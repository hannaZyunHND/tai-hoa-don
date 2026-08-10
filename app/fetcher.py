from __future__ import annotations

import calendar
import json
from datetime import date
from typing import Any, Iterator

from .api_client import InvoiceApiClient
from .config import Settings


def month_date_range(year: int, month: int) -> tuple[str, str]:
    last_day = calendar.monthrange(year, month)[1]
    date_from = f"01/{month:02d}/{year}T00:00:00"
    date_to = f"{last_day:02d}/{month:02d}/{year}T23:59:59"
    return date_from, date_to


def iter_months(year: int) -> Iterator[int]:
    today = date.today()
    last_month = 12
    if year == today.year:
        last_month = today.month
    elif year > today.year:
        last_month = 0
    for month in range(1, last_month + 1):
        yield month


def fetch_month_invoices(
    client: InvoiceApiClient,
    year: int,
    month: int,
) -> list[dict[str, Any]]:
    date_from, date_to = month_date_range(year, month)
    invoices: list[dict[str, Any]] = []
    state: str | None = None
    seen_ids: set[str] = set()

    while True:
        page = client.fetch_purchase_page(
            date_from=date_from,
            date_to=date_to,
            state=state,
        )
        datas = page.get("datas") or []
        for item in datas:
            item_id = str(item.get("id") or "")
            key = item_id or (
                f"{item.get('nbmst')}|{item.get('khhdon')}|"
                f"{item.get('shdon')}|{item.get('khmshdon')}"
            )
            if key in seen_ids:
                continue
            seen_ids.add(key)
            item = dict(item)
            item["_year"] = year
            item["_month"] = month
            invoices.append(item)

        next_state = page.get("state")
        if not next_state or not datas:
            break
        if next_state == state:
            break
        state = next_state

    return invoices


def fetch_year_invoices(
    client: InvoiceApiClient,
    year: int,
) -> list[dict[str, Any]]:
    all_items: list[dict[str, Any]] = []
    for month in iter_months(year):
        print(f"  Đang lọc tháng {month:02d}/{year}...")
        items = fetch_month_invoices(client, year, month)
        print(f"    → {len(items)} hoá đơn")
        all_items.extend(items)
    return all_items


def save_cache(
    settings: Settings,
    year: int,
    invoices: list[dict[str, Any]],
    *,
    month: int | None = None,
) -> None:
    existing = load_cache(settings)
    if month is not None and existing and existing.get("year") == year:
        kept = [
            item
            for item in (existing.get("datas") or [])
            if item.get("_month") != month
        ]
        merged = kept + list(invoices)
        payload = {
            "year": year,
            "month": None,
            "total": len(merged),
            "datas": merged,
        }
    else:
        payload = {
            "year": year,
            "month": month,
            "total": len(invoices),
            "datas": invoices,
        }
    settings.cache_file.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def load_cache(settings: Settings) -> dict[str, Any] | None:
    if not settings.cache_file.exists():
        return None
    return json.loads(settings.cache_file.read_text(encoding="utf-8"))
