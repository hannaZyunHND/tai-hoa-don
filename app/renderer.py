from __future__ import annotations

import base64
import io
import json
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

import qrcode
from jinja2 import Environment, FileSystemLoader, select_autoescape

from .config import Settings

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")

TCHAT_LABELS = {
    1: "Hàng hóa, dịch vụ",
    2: "Khuyến mại",
    3: "Chiết khấu thương mại",
    4: "Ghi chú / diễn giải",
    5: "Hàng hóa đặc trưng",
}


def _parse_cks(raw: Any) -> dict[str, Any] | None:
    if not raw:
        return None
    if isinstance(raw, dict):
        return raw
    try:
        return json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return None


def format_number(value: Any) -> str:
    if value is None or value == "":
        return ""
    try:
        num = float(value)
    except (TypeError, ValueError):
        return str(value)
    if num.is_integer():
        return f"{int(num):,}".replace(",", ".")
    text = f"{num:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return text.rstrip("0").rstrip(",")


def parse_invoice_date(tdlap: str | None) -> datetime | None:
    if not tdlap:
        return None
    text = tdlap.strip()
    try:
        if text.endswith("Z"):
            dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        else:
            dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(VN_TZ)
    except ValueError:
        return None


def make_qr_data_uri(payload: str | None) -> str | None:
    if not payload:
        return None
    img = qrcode.make(payload)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def build_view_model(detail: dict[str, Any], background_url: str) -> dict[str, Any]:
    dt = parse_invoice_date(detail.get("tdlap"))
    nbcks = _parse_cks(detail.get("nbcks"))
    cqtcks = _parse_cks(detail.get("cqtcks"))

    lines = []
    for row in detail.get("hdhhdvu") or []:
        lhhdac = ""
        for item in row.get("tthhdtrung") or []:
            if isinstance(item, dict):
                piece = item.get("dlieu") or item.get("ten") or item.get("ttruong") or ""
            else:
                piece = str(item)
            if piece:
                lhhdac = f"{lhhdac}; {piece}" if lhhdac else piece

        lines.append(
            {
                "stt": row.get("stt") or row.get("sxep") or "",
                "tchat": TCHAT_LABELS.get(row.get("tchat"), row.get("tchat") or ""),
                "lhhdac": lhhdac,
                "ten": row.get("ten") or "",
                "dvtinh": row.get("dvtinh") or "",
                "sluong": format_number(row.get("sluong")),
                "dgia": format_number(row.get("dgia")),
                "stckhau": format_number(row.get("stckhau") if row.get("stckhau") is not None else 0),
                "tsuat": row.get("ltsuat") or row.get("tsuat") or "",
                "thtien": format_number(row.get("thtien")),
                "tthue": format_number(row.get("tthue")),
                "is_note": row.get("tchat") == 4,
            }
        )

    tax_rows = []
    for row in detail.get("thttltsuat") or []:
        tax_rows.append(
            {
                "tsuat": row.get("tsuat") or "",
                "thtien": format_number(row.get("thtien")),
                "tthue": format_number(row.get("tthue")),
            }
        )

    title = (detail.get("thdon") or detail.get("tlhdon") or "HOÁ ĐƠN").upper()
    if "GIÁ TRỊ GIA TĂNG" in title or detail.get("khmshdon") == 1:
        display_title = "HOÁ ĐƠN GIÁ TRỊ GIA TĂNG"
    elif "BÁN HÀNG" in title or detail.get("khmshdon") == 2:
        display_title = "HOÁ ĐƠN BÁN HÀNG"
    else:
        display_title = title

    return {
        "background_url": background_url,
        "khmshdon": detail.get("khmshdon"),
        "khhdon": detail.get("khhdon") or "",
        "shdon": detail.get("shdon") or "",
        "mhdon": detail.get("mhdon") or "",
        "title": display_title,
        "day": f"{dt.day}" if dt else "",
        "month": f"{dt.month:02d}" if dt else "",
        "year": f"{dt.year}" if dt else "",
        "nbten": detail.get("nbten") or "",
        "nbmst": detail.get("nbmst") or "",
        "nbdchi": detail.get("nbdchi") or "",
        "nbsdthoai": detail.get("nbsdthoai") or "",
        "nbstkhoan": detail.get("nbstkhoan") or "",
        "nbtnhang": detail.get("nbtnhang") or "",
        "chma": detail.get("chma") or "",
        "chten": detail.get("chten") or "",
        "nmten": detail.get("nmten") or "",
        "nmtnmua": detail.get("nmtnmua") or "",
        "nmmst": detail.get("nmmst") or "",
        "nmdchi": detail.get("nmdchi") or "",
        "nmstkhoan": detail.get("nmstkhoan") or "",
        "nmtnhang": detail.get("nmtnhang") or "",
        "nmmdvqhnsach": detail.get("nmmdvqhnsach") or "",
        "nmcmnd": detail.get("nmcmnd") or "",
        "nmshchieu": detail.get("nmshchieu") or "",
        "thtttoan": detail.get("thtttoan") or "",
        "dvtte": detail.get("dvtte") or "VND",
        "dksbke": detail.get("dksbke") or "",
        "dknlbke": detail.get("dknlbke") or "",
        "lines": lines,
        "tax_rows": tax_rows,
        "is_gtgt": detail.get("khmshdon") == 1,
        "tgtcthue": format_number(detail.get("tgtcthue")),
        "tgtthue": format_number(detail.get("tgtthue")),
        "tgtphi": format_number(detail.get("tgtphi")),
        "ttcktmai": format_number(detail.get("ttcktmai")),
        "tgtttbso": format_number(detail.get("tgtttbso")),
        "tgtttbchu": detail.get("tgtttbchu") or "",
        "gchu": detail.get("gchu") or "",
        "qr_data_uri": make_qr_data_uri(detail.get("qrcode")),
        "nbcks": nbcks,
        "cqtcks": cqtcks,
        "nbcks_name": _subject_cn(nbcks),
        "nbcks_time": (nbcks or {}).get("SigningTime") or "",
    }


def _subject_cn(cks: dict[str, Any] | None) -> str:
    if not cks:
        return ""
    subject = cks.get("Subject") or ""
    for part in subject.split(","):
        part = part.strip()
        if part.upper().startswith("CN="):
            return part[3:]
    return subject


def resolve_background_data_uri(settings: Settings) -> str:
    """Ưu tiên file local (ổn định khi xuất PDF), fallback URL từ env."""
    local = settings.templates_dir / "viewinvoice-bg.jpg"
    if local.exists():
        b64 = base64.b64encode(local.read_bytes()).decode("ascii")
        return f"data:image/jpeg;base64,{b64}"

    url = settings.invoice_background
    if url.startswith("data:"):
        return url
    try:
        import httpx

        resp = httpx.get(url, timeout=30.0)
        resp.raise_for_status()
        mime = resp.headers.get("content-type", "image/jpeg").split(";")[0]
        b64 = base64.b64encode(resp.content).decode("ascii")
        local.write_bytes(resp.content)
        return f"data:{mime};base64,{b64}"
    except Exception:
        return url


class InvoiceRenderer:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.env = Environment(
            loader=FileSystemLoader(str(settings.templates_dir)),
            autoescape=select_autoescape(["html", "xml"]),
        )
        self._background_uri = resolve_background_data_uri(settings)

    def render_html(self, detail: dict[str, Any]) -> str:
        view = build_view_model(detail, self._background_uri)
        template = self.env.get_template("invoice.html")
        return template.render(**view)
