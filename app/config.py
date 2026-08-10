from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    bearer_token: str
    host: str
    invoice_background: str
    root: Path = ROOT
    cache_file: Path = ROOT / "cache-result.json"
    output_dir: Path = ROOT / "output"
    templates_dir: Path = ROOT / "templates"
    page_size: int = 50


def load_settings() -> Settings:
    load_dotenv(ROOT / ".env")
    token = (
        os.getenv("BIERER_TOKEN")
        or os.getenv("BEARER_TOKEN")
        or os.getenv("TOKEN")
        or ""
    ).strip()
    if not token:
        raise SystemExit(
            "Thiếu BIERER_TOKEN trong .env. Hãy cấu hình JWT lấy từ cổng hoá đơn điện tử."
        )

    host = (os.getenv("HOST") or "https://hoadondientu.gdt.gov.vn").rstrip("/")
    background = (
        os.getenv("INVOICE_BACKGROUND")
        or f"{host}/static/images/viewinvoice-bg.jpg"
    ).strip()

    return Settings(
        bearer_token=token,
        host=host,
        invoice_background=background,
    )
