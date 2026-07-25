"""Tiny local LLM (Qwen2.5-0.5B-Instruct) via transformers, lazily loaded."""
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
                    logger.info("Loading LLM %s on %s ...", name, device)
                    self._tokenizer = AutoTokenizer.from_pretrained(name)
                    self._model = AutoModelForCausalLM.from_pretrained(
                        name,
                        dtype=torch.float32,
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
        )
        if temperature > 0:
            gen_kwargs.update(temperature=temperature, top_p=0.9)

        with torch.no_grad():
            output = model.generate(**inputs, **gen_kwargs)

        # Strip the prompt tokens, decode only the newly generated part.
        new_tokens = output[0][inputs["input_ids"].shape[1] :]
        return tokenizer.decode(new_tokens, skip_special_tokens=True).strip()


_llm: LocalLLM | None = None


def get_llm() -> LocalLLM:
    global _llm
    if _llm is None:
        _llm = LocalLLM()
    return _llm
