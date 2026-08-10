from __future__ import annotations

import argparse
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from app.api_client import InvoiceApiClient
from app.config import load_settings
from app.excel_export import (
    TTHAI_LABELS,
    build_bang_ke_rows,
    write_export_workbook,
)
from app.fetcher import (
    fetch_month_invoices,
    fetch_year_invoices,
    load_cache,
    save_cache,
)
from app.pdf_export import html_to_pdf
from app.renderer import InvoiceRenderer, parse_invoice_date

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


def safe_folder_name(value: str) -> str:
    text = (value or "unknown").strip()
    text = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", text)
    return text or "unknown"


def make_session_dir(settings, year: int, month: int | None = None) -> Path:
    stamp = datetime.now(VN_TZ).strftime("%Y%m%d_%H%M%S")
    if month is not None:
        name = f"{stamp}_{year}-{month:02d}"
    else:
        name = f"{stamp}_{year}"
    path = settings.output_dir / name
    path.mkdir(parents=True, exist_ok=True)
    return path


def output_path_for(
    session_dir: Path,
    detail: dict,
    year: int | None = None,
) -> Path:
    dt = parse_invoice_date(detail.get("tdlap"))
    y = year or (dt.year if dt else 0) or detail.get("_year") or 0
    m = (dt.month if dt else 0) or detail.get("_month") or 0
    khhdon = safe_folder_name(str(detail.get("khhdon") or "UNKNOWN"))
    shdon = safe_folder_name(str(detail.get("shdon") or "0"))
    filename = f"{khhdon}_{shdon}.pdf"
    return session_dir / str(y) / f"{int(m):02d}" / khhdon / filename


def run_fetch(year: int, month: int | None = None) -> list[dict]:
    settings = load_settings()
    if month is not None:
        print(f"==> Lọc hoá đơn mua vào tháng {month:02d}/{year}")
        with InvoiceApiClient(settings) as client:
            invoices = fetch_month_invoices(client, year, month)
    else:
        print(f"==> Lọc hoá đơn mua vào năm {year}")
        with InvoiceApiClient(settings) as client:
            invoices = fetch_year_invoices(client, year)
    save_cache(settings, year, invoices, month=month)
    print(f"Đã lưu {len(invoices)} hoá đơn vào {settings.cache_file}")
    return invoices


def _filter_invoices(
    invoices: list[dict],
    *,
    year: int,
    month: int | None,
) -> list[dict]:
    result = []
    for item in invoices:
        item_year = item.get("_year") or year
        item_month = item.get("_month")
        if item_year != year:
            continue
        if month is not None and item_month != month:
            # Fallback theo ngày lập nếu cache cũ thiếu _month
            if item_month is None:
                dt = parse_invoice_date(item.get("tdlap"))
                if not dt or dt.month != month:
                    continue
            else:
                continue
        result.append(item)
    return result


def run_export(
    year: int,
    *,
    month: int | None = None,
    use_cache: bool = True,
    limit: int | None = None,
) -> None:
    settings = load_settings()
    renderer = InvoiceRenderer(settings)
    session_dir = make_session_dir(settings, year, month)
    print(f"Thư mục lượt tải: {session_dir.relative_to(settings.root)}")

    invoices: list[dict]
    if use_cache:
        cache = load_cache(settings)
        if not cache or cache.get("year") != year:
            print("Cache trống hoặc khác năm → lọc lại từ API...")
            invoices = run_fetch(year, month)
        else:
            invoices = _filter_invoices(
                cache.get("datas") or [],
                year=year,
                month=month,
            )
            scope = f"tháng {month:02d}/{year}" if month else f"năm {year}"
            if not invoices and month is not None:
                print(f"Cache không có dữ liệu {scope} → lọc lại từ API...")
                invoices = run_fetch(year, month)
            else:
                print(f"Dùng cache: {len(invoices)} hoá đơn ({scope})")
    else:
        invoices = run_fetch(year, month)

    if limit is not None:
        invoices = invoices[:limit]

    ok = 0
    failed = 0
    invoice_rows: list[dict] = []
    bang_ke_rows: list[list] = []

    with InvoiceApiClient(settings) as client:
        total = len(invoices)
        for idx, item in enumerate(invoices, start=1):
            nbmst = item.get("nbmst")
            khhdon = item.get("khhdon")
            shdon = item.get("shdon")
            khmshdon = item.get("khmshdon")
            label = f"{khhdon}/{shdon}"
            print(f"[{idx}/{total}] Detail {label} ...", end=" ", flush=True)
            try:
                detail = client.fetch_detail(
                    nbmst=nbmst,
                    khhdon=khhdon,
                    shdon=shdon,
                    khmshdon=khmshdon,
                )
                detail["_year"] = item.get("_year") or year
                detail["_month"] = item.get("_month") or month
                html = renderer.render_html(detail)
                pdf_path = output_path_for(session_dir, detail, year=year)
                html_path = pdf_path.with_suffix(".html")
                xml_path = pdf_path.with_suffix(".xml")
                html_path.parent.mkdir(parents=True, exist_ok=True)
                html_path.write_text(html, encoding="utf-8")
                html_to_pdf(html, pdf_path)

                xml_bytes = client.fetch_xml(
                    nbmst=nbmst,
                    khhdon=khhdon,
                    shdon=shdon,
                    khmshdon=khmshdon,
                )
                xml_path.write_bytes(xml_bytes)

                dt = parse_invoice_date(detail.get("tdlap"))
                invoice_rows.append(
                    {
                        "stt": ok + 1,
                        "khmshdon": detail.get("khmshdon"),
                        "khhdon": detail.get("khhdon"),
                        "shdon": detail.get("shdon"),
                        "ngay_lap": dt.strftime("%d/%m/%Y") if dt else "",
                        "nbmst": detail.get("nbmst"),
                        "nbten": detail.get("nbten"),
                        "tgtttbso": detail.get("tgtttbso"),
                        "tthai": TTHAI_LABELS.get(
                            detail.get("tthai"), detail.get("tthai") or ""
                        ),
                        "xml_path": xml_path,
                        "html_path": html_path,
                        "pdf_path": pdf_path,
                    }
                )
                bang_ke_rows.extend(build_bang_ke_rows(detail))

                print(
                    f"OK → {pdf_path.relative_to(session_dir)} "
                    f"(+html, +xml)"
                )
                ok += 1
            except Exception as exc:  # noqa: BLE001
                failed += 1
                print(f"LỖI: {exc}")
            time.sleep(0.4)

    excel_path = session_dir / "tong-hop.xlsx"
    params = [
        ("Thời điểm tải", datetime.now(VN_TZ).strftime("%Y-%m-%d %H:%M:%S")),
        ("Host", settings.host),
        ("Năm", year),
        ("Tháng", month if month is not None else "Cả năm"),
        ("Dùng cache", "Có" if use_cache else "Không"),
        ("Giới hạn (limit)", limit if limit is not None else "Không"),
        ("Số hoá đơn trong danh sách", len(invoices)),
        ("Số hoá đơn tải thành công", ok),
        ("Số hoá đơn lỗi", failed),
        ("Thư mục output", str(session_dir.resolve())),
        ("File Excel", str(excel_path.resolve())),
    ]
    write_export_workbook(
        output_path=excel_path,
        params=params,
        invoice_rows=invoice_rows,
        bang_ke_rows=bang_ke_rows,
        template_path=settings.templates_dir / "bang-ke-chi-tiet.xlsx",
    )
    print(f"Excel: {excel_path.relative_to(settings.root)}")
    print(f"\nHoàn tất: {ok} hoá đơn thành công (html/pdf/xml), {failed} lỗi.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Tải hoá đơn điện tử mua vào từ cổng GDT "
            "và xuất HTML + PDF (mẫu BTC) + XML gốc + Excel tổng hợp."
        )
    )
    parser.add_argument(
        "year",
        type=int,
        help="Năm cần tải (vd: 2025)",
    )
    parser.add_argument(
        "--month",
        type=int,
        default=None,
        help="Chỉ tải 1 tháng (1-12). Ví dụ: --month 1",
    )
    parser.add_argument(
        "--fetch-only",
        action="store_true",
        help="Chỉ lọc danh sách và ghi cache-result.json, không xuất file",
    )
    parser.add_argument(
        "--no-cache",
        action="store_true",
        help="Bỏ qua cache, lọc lại từ API rồi xuất file",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Giới hạn số hoá đơn xuất (dùng để test)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    parser = build_parser()
    args = parser.parse_args(argv)

    if args.year < 2000 or args.year > 2100:
        parser.error("Năm không hợp lệ")
    if args.month is not None and (args.month < 1 or args.month > 12):
        parser.error("Tháng phải từ 1 đến 12")

    if args.fetch_only:
        run_fetch(args.year, args.month)
    else:
        run_export(
            args.year,
            month=args.month,
            use_cache=not args.no_cache,
            limit=args.limit,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
