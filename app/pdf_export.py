from __future__ import annotations

from pathlib import Path

from playwright.sync_api import sync_playwright


def html_to_pdf(html: str, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            page = browser.new_page()
            page.set_content(html, wait_until="load")
            page.pdf(
                path=str(output_path),
                format="A4",
                print_background=True,
                margin={
                    "top": "8mm",
                    "right": "8mm",
                    "bottom": "8mm",
                    "left": "8mm",
                },
            )
        finally:
            browser.close()
