# Tải hoá đơn điện tử (GDT)

Tool Python tải hoá đơn **mua vào** từ cổng [hoadondientu.gdt.gov.vn](https://hoadondientu.gdt.gov.vn), xuất **HTML + PDF + XML** và file Excel tổng hợp theo từng lượt tải.

## Yêu cầu

- Python **3.10+**
- Tài khoản đăng nhập cổng hoá đơn điện tử (để lấy JWT / Bearer token)

## Cài đặt

```bash
cd TAI_HOA_DON_DIEN_TU
python -m venv .venv

# Windows PowerShell
.\.venv\Scripts\Activate.ps1

# Windows CMD
.\.venv\Scripts\activate.bat

pip install -r requirements.txt
playwright install chromium
```

## Cấu hình `.env`

Copy mẫu rồi điền token:

```bash
copy .env.example .env
```

Nội dung `.env`:

```env
BIERER_TOKEN=eyJhbGciOiJIUzUxMiJ9....
HOST=https://hoadondientu.gdt.gov.vn
INVOICE_BACKGROUND=https://hoadondientu.gdt.gov.vn/static/images/viewinvoice-bg.jpg
```

| Biến | Bắt buộc | Mô tả |
|------|----------|--------|
| `BIERER_TOKEN` | Có | JWT Bearer lấy từ cổng GDT sau khi đăng nhập |
| `HOST` | Không | Mặc định `https://hoadondientu.gdt.gov.vn` |
| `INVOICE_BACKGROUND` | Không | Ảnh nền mẫu hoá đơn (có thể để mặc định) |

### Lấy `BIERER_TOKEN`

1. Đăng nhập [https://hoadondientu.gdt.gov.vn](https://hoadondientu.gdt.gov.vn)
2. Mở DevTools (F12) → tab **Network** / **Application**
3. Tìm request API có header `Authorization: Bearer ...` hoặc cookie/JWT tương ứng
4. Copy chuỗi JWT dán vào `BIERER_TOKEN` trong `.env`

Token có hạn dùng — hết hạn thì lấy lại và cập nhật `.env`.

> Không commit file `.env` (đã nằm trong `.gitignore`).

## Chạy theo thời gian

Cú pháp:

```bash
python main.py <NĂM> [--month <THÁNG>] [tuỳ chọn khác]
```

### Cả năm

```bash
python main.py 2023
```

Lọc lần lượt 12 tháng (hoặc đến tháng hiện tại nếu là năm nay), rồi tải chi tiết + xuất file.

### Một tháng

```bash
python main.py 2023 --month 1
python main.py 2026 --month 8
```

### Chỉ lọc danh sách (không xuất PDF/XML)

```bash
python main.py 2023 --fetch-only
python main.py 2023 --month 5 --fetch-only
```

Ghi danh sách vào `cache-result.json`.

### Bỏ cache, lọc lại từ API

```bash
python main.py 2023 --no-cache
python main.py 2023 --month 1 --no-cache
```

### Test vài hoá đơn

```bash
python main.py 2023 --month 1 --limit 3
```

## Output ở đâu?

Mỗi lần chạy tạo **một thư mục theo timestamp** trong `output/`:

```text
output/
  20260810_101703_2023/          # cả năm 2023
  20260810_100821_2026-01/       # tháng 01/2026
    tong-hop.xlsx
    2023/
      01/
        C23TCG/
          C23TCG_140.html
          C23TCG_140.pdf
          C23TCG_140.xml
      02/
        ...
```

- **Tên thư mục:** `YYYYMMDD_HHMMSS_<năm>` hoặc `YYYYMMDD_HHMMSS_<năm>-<tháng>`
- **Mỗi hoá đơn:** 3 file `.html`, `.pdf`, `.xml`
- **`tong-hop.xlsx`:** Excel tổng hợp (link file dùng **relative path** — zip cả thư mục lượt tải gửi đi vẫn click mở được)

### Cấu trúc Excel `tong-hop.xlsx`

| Sheet | Nội dung |
|-------|----------|
| `Tham so tai` | Năm/tháng, host, số lượng, đường dẫn thư mục… |
| `Danh sach hoa don` | Danh sách HĐ + cột link `xml` / `html` / `pdf` |
| `Bang ke chi tiet` | Bảng kê dòng hàng hoá (header theo `templates/bang-ke-chi-tiet.xlsx`) |

## Cache

- File: `cache-result.json` (cùng thư mục project)
- Lần chạy sau cùng năm sẽ dùng cache nếu có — nhanh hơn, ít gọi API
- Đổi năm / cache lệch → tool tự lọc lại
- Muốn ép gọi API lại: thêm `--no-cache`

## Lưu ý

- Portal có thể báo **Too many requests** — tool tự retry + nghỉ giữa các hoá đơn
- Một số hoá đơn **không có hồ sơ XML gốc** trên GDT → sẽ ghi lỗi, các HĐ khác vẫn chạy tiếp
- Token hết hạn → cập nhật lại `BIERER_TOKEN` trong `.env`

## Ví dụ nhanh

```bash
# Cài lần đầu
pip install -r requirements.txt
playwright install chromium
copy .env.example .env
# → sửa BIERER_TOKEN trong .env

# Tải tháng 1/2026
python main.py 2026 --month 1

# Tải cả năm 2023
python main.py 2023
```

Kết quả xem trong thư mục `output\` mới nhất.
