"""Convenience launcher: `python run.py` starts the API with uvicorn."""
from __future__ import annotations

import uvicorn

from app.config import get_settings

if __name__ == "__main__":
    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        # Watch only source code: uploads/ingestion write into data/, and an
        # unrestricted watcher would restart the server mid-request.
        reload=True,
        reload_dirs=["app"],
    )
