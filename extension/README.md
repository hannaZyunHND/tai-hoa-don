# Chrome Extension — Tải hoá đơn điện tử GDT

Extension thuần JS (Manifest V3). Không cần Flask/Python.

## Cài đặt

1. Mở Chrome → `chrome://extensions`
2. Bật **Developer mode**
3. **Load unpacked** → chọn thư mục `extension/`

## Cách dùng

1. Click icon extension → **Mở trang tra cứu**
2. Đăng nhập (nếu cần) tại `https://hoadondientu.gdt.gov.vn/tra-cuu/tra-cuu-hoa-don`
3. Bấm **Tìm kiếm** một lần để extension bắt Bearer token
4. Chọn **Năm** (bắt buộc) và **Tháng** (tuỳ chọn)
5. Bấm **Tải ZIP PDF**

File zip có cấu trúc: `<năm>/<tháng>/<ký hiệu>/<ký hiệu>_<số>.pdf`

## Ghi chú

- Token được bắt từ header `Authorization` (webRequest + hook fetch/XHR)
- Pipeline chạy trong offscreen document (lọc API → detail → HTML → PDF → ZIP)
- Có ô **Giới hạn test** để thử vài hoá đơn trước khi tải cả năm
