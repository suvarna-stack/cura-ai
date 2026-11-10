"""Local LLM via transformers, lazily loaded (model + dtype from settings)."""
from __future__ import annotations

import logging
import threading

from app.config import get_settings

logger = logging.getLogger(__name__)


class LocalLLM:
    """Lazily-loaded causal LM with a chat interface.

    Model + tokenizer (~1GB) load on first `.generate()` call.
    """

    def __init__(self) -> None:
        self._model = None
        self._tokenizer = None
        self._lock = threading.Lock()
        self._settings = get_settings()

    def _ensure_model(self):
        if self._model is None:
            with self._lock:
                if self._model is None:
                    import torch
                    from transformers import AutoModelForCausalLM, AutoTokenizer

                    name = self._settings.llm_model
                    device = self._settings.llm_device
                    dtype_name = self._settings.llm_dtype.lower()
                    dtype = {
                        "float32": torch.float32,
                        "bfloat16": torch.bfloat16,
                        "float16": torch.float16,
                    }.get(dtype_name, "auto")
                    logger.info("Loading LLM %s on %s (dtype=%s) ...",
                                name, device, dtype_name)
                    self._tokenizer = AutoTokenizer.from_pretrained(name)
                    self._model = AutoModelForCausalLM.from_pretrained(
                        name,
                        dtype=dtype,
                    )
                    self._model.to(device)
                    self._model.eval()
                    logger.info("LLM ready.")
        return self._model, self._tokenizer

    def generate(
        self,
        messages: list[dict[str, str]],
        max_new_tokens: int | None = None,
        temperature: float | None = None,
    ) -> str:
        import torch

        model, tokenizer = self._ensure_model()
        settings = self._settings

        temperature = settings.temperature if temperature is None else temperature
        max_new_tokens = settings.max_new_tokens if max_new_tokens is None else max_new_tokens

        prompt = tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

        gen_kwargs = dict(
            max_new_tokens=max_new_tokens,
            do_sample=temperature > 0,
            pad_token_id=tokenizer.eos_token_id,
            # Small models degenerate into echoing the prompt without this.
            repetition_penalty=settings.repetition_penalty,
        )
        if temperature > 0:
            gen_kwargs.update(temperature=temperature, top_p=0.9)

        with torch.no_grad():
            output = model.generate(**inputs, **gen_kwargs)

        # Strip the prompt tokens, decode only the newly generated part.
        new_tokens = output[0][inputs["input_ids"].shape[1] :]
        return tokenizer.decode(new_tokens, skip_special_tokens=True).strip()

    def generate_stream(self, messages, max_new_tokens=None, temperature=None):
        """Streaming interface parity with OllamaLLM. transformers generation
        here is blocking, so this degrades to a single final chunk — the SSE
        plumbing stays identical either way."""
        yield self.generate(messages, max_new_tokens=max_new_tokens,
                            temperature=temperature)


class OllamaLLM:
    """Same .generate() interface, served by a local Ollama server.

    Ollama runs GGUF-quantized models with automatic GPU offload — on a
    machine with even a small dGPU this is an order of magnitude faster than
    in-process CPU transformers. The model is pulled/managed by Ollama
    (`ollama pull <name>`); this class only speaks its /api/chat endpoint.
    """

    def __init__(self) -> None:
        self._settings = get_settings()

    def generate(
        self,
        messages: list[dict[str, str]],
        max_new_tokens: int | None = None,
        temperature: float | None = None,
    ) -> str:
        import httpx

        settings = self._settings
        temperature = settings.temperature if temperature is None else temperature
        max_new_tokens = settings.max_new_tokens if max_new_tokens is None else max_new_tokens

        try:
            # Generous timeout: the first call after idle loads the model
            # into (V)RAM; generation itself is fast.
            resp = httpx.post(
                f"{settings.ollama_base}/api/chat",
                json={
                    "model": settings.ollama_model,
                    "messages": messages,
                    "stream": False,
                    # Keep the model resident between questions; the default
                    # 5m idle unload makes every post-idle answer pay a
                    # ~20s VRAM reload.
                    "keep_alive": "2h",
                    "options": {
                        "num_predict": max_new_tokens,
                        "temperature": temperature,
                        "top_p": 0.9,
                        "repeat_penalty": settings.repetition_penalty,
                        # Smaller KV cache → more layers fit in VRAM. Our
                        # prompts (system + 6 chunks + short history) stay
                        # well under this.
                        "num_ctx": 3072,
                    },
                },
                timeout=300.0,
            )
            resp.raise_for_status()
        except httpx.ConnectError as exc:
            raise RuntimeError(
                f"Ollama server not reachable at {settings.ollama_base} — "
                "start it (the Ollama app) or set LLM_BACKEND=transformers."
            ) from exc
        return resp.json()["message"]["content"].strip()

    def generate_stream(self, messages, max_new_tokens=None, temperature=None):
        """Yield answer text incrementally (Ollama's native NDJSON stream).

        On CPU hosts full generation takes tens of seconds; streaming puts the
        first words on screen in ~2-3s, which is the difference between "slow"
        and "broken" for the chat UI.
        """
        import json

        import httpx

        settings = self._settings
        temperature = settings.temperature if temperature is None else temperature
        max_new_tokens = settings.max_new_tokens if max_new_tokens is None else max_new_tokens

        try:
            with httpx.stream(
                "POST",
                f"{settings.ollama_base}/api/chat",
                json={
                    "model": settings.ollama_model,
                    "messages": messages,
                    "stream": True,
                    "keep_alive": "2h",
                    "options": {
                        "num_predict": max_new_tokens,
                        "temperature": temperature,
                        "top_p": 0.9,
                        "repeat_penalty": settings.repetition_penalty,
                        "num_ctx": 3072,
                    },
                },
                timeout=300.0,
            ) as resp:
                resp.raise_for_status()
                for line in resp.iter_lines():
                    if not line:
                        continue
                    data = json.loads(line)
                    piece = data.get("message", {}).get("content", "")
                    if piece:
                        yield piece
                    if data.get("done"):
                        break
        except httpx.ConnectError as exc:
            raise RuntimeError(
                f"Ollama server not reachable at {settings.ollama_base} — "
                "start it (the Ollama app) or set LLM_BACKEND=transformers."
            ) from exc


_llm: LocalLLM | OllamaLLM | None = None


def get_llm() -> LocalLLM | OllamaLLM:
    global _llm
    if _llm is None:
        backend = get_settings().llm_backend.lower()
        _llm = OllamaLLM() if backend == "ollama" else LocalLLM()
        logger.info("LLM backend: %s", backend)
    return _llm
