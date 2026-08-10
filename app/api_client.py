from __future__ import annotations

import io
import random
import time
import zipfile
from typing import Any
from urllib.parse import quote, urlencode

import httpx

from .config import Settings


class TooManyRequestsError(Exception):
    """Portal GDT giới hạn tần suất gọi API."""


class InvoiceApiClient:
    def __init__(
        self,
        settings: Settings,
        timeout: float = 60.0,
        *,
        max_retries: int = 6,
        base_backoff: float = 2.0,
    ) -> None:
        self.settings = settings
        self.max_retries = max_retries
        self.base_backoff = base_backoff
        self._client = httpx.Client(
            base_url=settings.host,
            timeout=timeout,
            headers={
                "Authorization": f"Bearer {settings.bearer_token}",
                "Accept": "application/json, application/zip, */*",
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
            },
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "InvoiceApiClient":
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    @staticmethod
    def _is_rate_limited(resp: httpx.Response) -> bool:
        if resp.status_code in {429, 503}:
            return True
        text = (resp.text or "").lower()
        needles = (
            "too many request",
            "too many requests",
            "quá nhiều yêu cầu",
            "rate limit",
            "throttl",
        )
        return any(n in text for n in needles)

    def _request_with_retry(
        self,
        method: str,
        url: str,
        *,
        expect_json: bool = True,
    ) -> httpx.Response:
        last_exc: Exception | None = None
        for attempt in range(self.max_retries + 1):
            try:
                resp = self._client.request(method, url)
            except httpx.TransportError as exc:
                last_exc = exc
                if attempt >= self.max_retries:
                    raise
                delay = self.base_backoff * (2**attempt) + random.uniform(0, 0.5)
                print(
                    f"\n    ⚠ Lỗi mạng ({exc.__class__.__name__}), "
                    f"đợi {delay:.1f}s rồi thử lại ({attempt + 1}/{self.max_retries})...",
                    flush=True,
                )
                time.sleep(delay)
                continue

            if self._is_rate_limited(resp):
                if attempt >= self.max_retries:
                    raise TooManyRequestsError(
                        f"Too many requests sau {self.max_retries} lần thử "
                        f"(HTTP {resp.status_code})"
                    )
                retry_after = resp.headers.get("Retry-After")
                if retry_after and retry_after.isdigit():
                    delay = float(retry_after)
                else:
                    delay = self.base_backoff * (2**attempt) + random.uniform(0.5, 1.5)
                print(
                    f"\n    ⚠ Too many requests, đợi {delay:.1f}s "
                    f"rồi thử lại ({attempt + 1}/{self.max_retries})...",
                    flush=True,
                )
                time.sleep(delay)
                continue

            if resp.status_code >= 400:
                snippet = (resp.text or "")[:300]
                raise httpx.HTTPStatusError(
                    f"API {resp.status_code}: {snippet}",
                    request=resp.request,
                    response=resp,
                )

            if expect_json:
                # Một số endpoint trả zip — caller tự xử lý
                pass
            return resp

        if last_exc:
            raise last_exc
        raise RuntimeError("request_with_retry thất bại không rõ nguyên nhân")

    def fetch_purchase_page(
        self,
        *,
        date_from: str,
        date_to: str,
        state: str | None = None,
        size: int | None = None,
    ) -> dict[str, Any]:
        """Lấy 1 trang hoá đơn mua vào (ttxly==5).

        date_from/date_to: dd/MM/yyyyTHH:mm:ss
        Phân trang bằng cursor `state` (không dùng page index).
        """
        size = size or self.settings.page_size
        search = f"tdlap=ge={date_from};tdlap=le={date_to};ttxly==5"
        # Giữ nguyên `/` và `;` `=` như portal — encode quá mức sẽ 400
        query = f"sort=tdlap:desc&size={size}&search={search}"
        if state:
            query += f"&state={quote(state, safe='')}"

        resp = self._request_with_retry(
            "GET", f"/api/query/invoices/purchase?{query}"
        )
        return resp.json()

    def fetch_detail(
        self,
        *,
        nbmst: str,
        khhdon: str,
        shdon: int | str,
        khmshdon: int | str,
    ) -> dict[str, Any]:
        qs = urlencode(
            {
                "nbmst": nbmst,
                "khhdon": khhdon,
                "shdon": shdon,
                "khmshdon": khmshdon,
            }
        )
        resp = self._request_with_retry(
            "GET", f"/api/query/invoices/detail?{qs}"
        )
        return resp.json()

    def fetch_xml(
        self,
        *,
        nbmst: str,
        khhdon: str,
        shdon: int | str,
        khmshdon: int | str,
    ) -> bytes:
        """Tải XML gốc từ portal (ZIP chứa invoice.xml)."""
        qs = urlencode(
            {
                "nbmst": nbmst,
                "khhdon": khhdon,
                "shdon": shdon,
                "khmshdon": khmshdon,
            }
        )
        paths = (
            f"/api/query/invoices/export-xml?{qs}",
            f"/api/sco-query/invoices/export-xml?{qs}",
        )
        last_err: Exception | None = None
        for path in paths:
            try:
                resp = self._request_with_retry("GET", path, expect_json=False)
            except Exception as exc:  # noqa: BLE001
                last_err = exc
                continue

            content = resp.content
            if not content:
                last_err = RuntimeError(f"Empty response from {path}")
                continue

            xml_bytes = self._extract_invoice_xml(content)
            if xml_bytes is not None:
                return xml_bytes

            # Một số trường hợp trả thẳng XML
            head = content.lstrip()[:64].lower()
            if head.startswith(b"<?xml") or head.startswith(b"<hdon"):
                return content

            last_err = RuntimeError(
                f"Không tìm thấy invoice.xml trong phản hồi ({path})"
            )

        raise last_err or RuntimeError("Không tải được XML hoá đơn")

    @staticmethod
    def _extract_invoice_xml(content: bytes) -> bytes | None:
        if content[:2] != b"PK":
            return None
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                names = zf.namelist()
                # Ưu tiên đúng tên portal trả về
                for preferred in ("invoice.xml", "Invoice.xml", "INVOICE.XML"):
                    if preferred in names:
                        return zf.read(preferred)
                xml_names = [n for n in names if n.lower().endswith(".xml")]
                if xml_names:
                    return zf.read(xml_names[0])
        except zipfile.BadZipFile:
            return None
        return None
