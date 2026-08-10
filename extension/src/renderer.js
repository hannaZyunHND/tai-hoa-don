const TCHAT_LABELS = {
  1: "Hàng hóa, dịch vụ",
  2: "Khuyến mại",
  3: "Chiết khấu thương mại",
  4: "Ghi chú / diễn giải",
  5: "Hàng hóa đặc trưng",
};

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "";
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  if (Number.isInteger(num)) {
    return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }
  const fixed = Math.round(num * 100) / 100;
  const [intPart, dec = ""] = fixed.toFixed(2).split(".");
  const withDot = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const trimmedDec = dec.replace(/0+$/, "");
  return trimmedDec ? `${withDot},${trimmedDec}` : withDot;
}

export function parseInvoiceDate(tdlap) {
  if (!tdlap) return null;
  try {
    const dt = new Date(tdlap);
    if (Number.isNaN(dt.getTime())) return null;
    // Asia/Ho_Chi_Minh = UTC+7
    const vn = new Date(dt.getTime() + 7 * 60 * 60 * 1000);
    return {
      day: String(vn.getUTCDate()),
      month: String(vn.getUTCMonth() + 1).padStart(2, "0"),
      year: String(vn.getUTCFullYear()),
      monthNum: vn.getUTCMonth() + 1,
      yearNum: vn.getUTCFullYear(),
    };
  } catch {
    return null;
  }
}

function parseCks(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function subjectCn(cks) {
  if (!cks?.Subject) return "";
  for (const part of String(cks.Subject).split(",")) {
    const p = part.trim();
    if (p.toUpperCase().startsWith("CN=")) return p.slice(3);
  }
  return cks.Subject;
}

export async function makeQrDataUri(payload) {
  if (!payload || typeof globalThis.qrcode !== "function") return null;
  try {
    const qr = globalThis.qrcode(0, "M");
    qr.addData(String(payload));
    qr.make();
    return qr.createDataURL(4, 0);
  } catch {
    return null;
  }
}

export function buildViewModel(detail, backgroundUrl, qrDataUri) {
  const dt = parseInvoiceDate(detail.tdlap);
  const nbcks = parseCks(detail.nbcks);
  const lines = (detail.hdhhdvu || []).map((row) => {
    let lhhdac = "";
    for (const item of row.tthhdtrung || []) {
      const piece =
        typeof item === "object"
          ? item.dlieu || item.ten || item.ttruong || ""
          : String(item);
      if (piece) lhhdac = lhhdac ? `${lhhdac}; ${piece}` : piece;
    }
    return {
      stt: row.stt || row.sxep || "",
      tchat: TCHAT_LABELS[row.tchat] || row.tchat || "",
      lhhdac,
      ten: row.ten || "",
      dvtinh: row.dvtinh || "",
      sluong: formatNumber(row.sluong),
      dgia: formatNumber(row.dgia),
      stckhau: formatNumber(row.stckhau ?? 0),
      tsuat: row.ltsuat || row.tsuat || "",
      thtien: formatNumber(row.thtien),
    };
  });

  const taxRows = (detail.thttltsuat || []).map((row) => ({
    tsuat: row.tsuat || "",
    thtien: formatNumber(row.thtien),
    tthue: formatNumber(row.tthue),
  }));

  let title = String(detail.thdon || detail.tlhdon || "HOÁ ĐƠN").toUpperCase();
  if (title.includes("GIÁ TRỊ GIA TĂNG") || detail.khmshdon === 1) {
    title = "HOÁ ĐƠN GIÁ TRỊ GIA TĂNG";
  } else if (title.includes("BÁN HÀNG") || detail.khmshdon === 2) {
    title = "HOÁ ĐƠN BÁN HÀNG";
  }

  return {
    backgroundUrl,
    khmshdon: detail.khmshdon,
    khhdon: detail.khhdon || "",
    shdon: detail.shdon || "",
    mhdon: detail.mhdon || "",
    title,
    day: dt?.day || "",
    month: dt?.month || "",
    year: dt?.year || "",
    monthNum: dt?.monthNum || detail._month || 0,
    yearNum: dt?.yearNum || detail._year || 0,
    nbten: detail.nbten || "",
    nbmst: detail.nbmst || "",
    nbdchi: detail.nbdchi || "",
    nbsdthoai: detail.nbsdthoai || "",
    nbstkhoan: detail.nbstkhoan || "",
    nbtnhang: detail.nbtnhang || "",
    chma: detail.chma || "",
    chten: detail.chten || "",
    nmten: detail.nmten || "",
    nmtnmua: detail.nmtnmua || "",
    nmmst: detail.nmmst || "",
    nmdchi: detail.nmdchi || "",
    nmstkhoan: detail.nmstkhoan || "",
    nmtnhang: detail.nmtnhang || "",
    nmmdvqhnsach: detail.nmmdvqhnsach || "",
    nmcmnd: detail.nmcmnd || "",
    nmshchieu: detail.nmshchieu || "",
    thtttoan: detail.thtttoan || "",
    dvtte: detail.dvtte || "VND",
    dksbke: detail.dksbke || "",
    dknlbke: detail.dknlbke || "",
    lines,
    taxRows,
    isGtgt: detail.khmshdon === 1,
    tgtcthue: formatNumber(detail.tgtcthue),
    tgtthue: formatNumber(detail.tgtthue),
    tgtphi: formatNumber(detail.tgtphi),
    ttcktmai: formatNumber(detail.ttcktmai),
    tgtttbso: formatNumber(detail.tgtttbso),
    tgtttbchu: detail.tgtttbchu || "",
    gchu: detail.gchu || "",
    qrDataUri,
    nbcks,
    nbcksName: subjectCn(nbcks),
    nbcksTime: nbcks?.SigningTime || "",
  };
}

function renderLines(v) {
  return v.lines
    .map(
      (line) => `
      <tr>
        <td class="tx-center">${esc(line.stt)}</td>
        <td class="tx-left">${esc(line.tchat)}</td>
        <td class="tx-left">${esc(line.lhhdac)}</td>
        <td class="tx-left">${esc(line.ten)}</td>
        <td class="tx-center">${esc(line.dvtinh)}</td>
        <td class="tx-right">${esc(line.sluong)}</td>
        <td class="tx-right">${esc(line.dgia)}</td>
        <td class="tx-right">${esc(line.stckhau)}</td>
        ${
          v.isGtgt
            ? `<td class="tx-center">${esc(line.tsuat)}</td><td class="tx-right">${esc(line.thtien)}</td>`
            : `<td class="tx-right">${esc(line.thtien)}</td>`
        }
      </tr>`
    )
    .join("");
}

function renderTaxRows(v) {
  if (!v.isGtgt || !v.taxRows.length) return "";
  const rows = v.taxRows
    .map(
      (row) => `
      <tr>
        <td class="tx-center">${esc(row.tsuat)}</td>
        <td class="tx-right">${esc(row.thtien)}</td>
        <td class="tx-right">${esc(row.tthue)}</td>
      </tr>`
    )
    .join("");
  return `
    <table class="res-tb" style="margin-top:-1px">
      <thead>
        <tr>
          <th>Thuế suất</th>
          <th>Tổng tiền chưa thuế</th>
          <th>Tổng tiền thuế</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

export function renderInvoiceHtml(view) {
  const v = view;
  const nameWidth = v.isGtgt ? "28%" : "33%";
  const bankSeller = `${v.nbstkhoan ? esc(v.nbstkhoan) : ""}${v.nbtnhang ? `&nbsp;&nbsp;&nbsp;${esc(v.nbtnhang)}` : ""}`;
  const bankBuyer = `${v.nmstkhoan ? esc(v.nmstkhoan) : ""}${v.nmtnhang ? `&nbsp;&nbsp;&nbsp;${esc(v.nmtnhang)}` : ""}`;

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>Hóa đơn ${esc(v.khhdon)}-${esc(v.shdon)}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Times New Roman", Times, "Noto Serif", serif;
      font-size: 13px;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .wrapper-content-vi.printSection {
      width: 190mm;
      min-height: 277mm;
      margin: 0 auto;
      padding: 16px 20px 24px;
      background-image: url("${v.backgroundUrl}");
      background-repeat: no-repeat;
      background-position: center center;
      background-size: 92% auto;
      color: #000;
    }
    .top-content { display: flex; justify-content: space-between; align-items: flex-start; }
    .qr img { width: 78px; height: 78px; display: block; }
    .code-block { text-align: right; line-height: 1.55; padding-top: 2px; font-size: 13px; }
    .code-ms { display: block; font-weight: 700; }
    .title-heading { text-align: center; margin: 2px 0 6px; }
    .main-title { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.4px; text-transform: uppercase; }
    .day { margin: 6px 0 0; font-size: 13px; }
    .mccqt { text-align: center; margin: 4px 0 12px; font-size: 13px; word-break: break-all; }
    .section { margin: 0 0 2px; }
    .field { display: flex; gap: 6px; line-height: 1.55; margin: 0; }
    .field .label { flex: 0 0 168px; font-weight: 700; white-space: nowrap; }
    .field .value { flex: 1; min-width: 0; }
    .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0 18px; }
    .divider { border: 0; border-top: 1px solid #222; margin: 8px 0; }
    table.res-tb { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 4px; font-size: 12px; }
    table.res-tb th, table.res-tb td { border: 1px solid #222; padding: 5px 4px; vertical-align: middle; word-wrap: break-word; }
    table.res-tb th { font-weight: 700; text-align: center; background: transparent; }
    .tx-center { text-align: center; }
    .tx-right { text-align: right; }
    .tx-left { text-align: left; }
    .totals-wrap { display: flex; justify-content: flex-end; margin-top: -1px; }
    table.totals { width: 72%; border-collapse: collapse; font-size: 12.5px; }
    table.totals td { border: 1px solid #222; padding: 5px 8px; vertical-align: middle; }
    table.totals td.lbl { width: 62%; }
    table.totals td.val { text-align: right; }
    table.totals td.val-left { text-align: left; }
    .sign-area { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 28px; text-align: center; }
    .sign-title { margin: 0; font-size: 13px; font-weight: 700; text-transform: uppercase; }
    .sign-sub { margin: 2px 0 0; font-style: italic; font-size: 12px; font-weight: 400; }
    .sign-box { display: inline-block; margin-top: 18px; padding: 8px 12px; border: 2px solid #1f8f3a; border-radius: 2px; text-align: left; min-width: 210px; background: rgba(255,255,255,0.72); }
    .sign-box .ok { display: block; color: #1f8f3a; font-weight: 700; font-size: 13px; margin-bottom: 4px; }
    .sign-box .ok::before { content: "✓ "; font-weight: 700; }
    .sign-box .meta { display: block; color: #111; font-size: 11.5px; line-height: 1.35; }
    .fd-end { margin-top: 18px; text-align: center; font-style: italic; font-size: 12px; }
  </style>
</head>
<body>
  <div class="wrapper-content-vi printSection">
    <div class="top-content">
      <div class="qr">${v.qrDataUri ? `<img src="${v.qrDataUri}" alt="QR" />` : ""}</div>
      <div class="code-block">
        <b class="code-ms">Mẫu số ${esc(v.khmshdon)}</b>
        <b class="code-ms">Ký hiệu: ${esc(v.khhdon)}</b>
        <b class="code-ms">Số: ${esc(v.shdon)}</b>
      </div>
    </div>
    <div class="title-heading">
      <h2 class="main-title">${esc(v.title)}</h2>
      <p class="day">Ngày ${esc(v.day)} tháng ${esc(v.month)} năm ${esc(v.year)}</p>
    </div>
    ${v.mhdon ? `<div class="mccqt">MCCQT: ${esc(v.mhdon)}</div>` : ""}
    <div class="section">
      <p class="field"><span class="label">Tên người bán:</span><span class="value">${esc(v.nbten)}</span></p>
      <p class="field"><span class="label">Mã số thuế:</span><span class="value">${esc(v.nbmst)}</span></p>
      <p class="field"><span class="label">Mã cửa hàng:</span><span class="value">${esc(v.chma)}</span></p>
      <p class="field"><span class="label">Tên cửa hàng:</span><span class="value">${esc(v.chten)}</span></p>
      <p class="field"><span class="label">Địa chỉ:</span><span class="value">${esc(v.nbdchi)}</span></p>
      <p class="field"><span class="label">Điện thoại:</span><span class="value">${esc(v.nbsdthoai)}</span></p>
      <p class="field"><span class="label">Số tài khoản:</span><span class="value">${bankSeller}</span></p>
    </div>
    <hr class="divider" />
    <div class="section">
      <p class="field"><span class="label">Tên người mua:</span><span class="value">${esc(v.nmten)}</span></p>
      <p class="field"><span class="label">Họ tên người mua hàng:</span><span class="value">${esc(v.nmtnmua)}</span></p>
      <p class="field"><span class="label">Mã số thuế:</span><span class="value">${esc(v.nmmst)}</span></p>
      <p class="field"><span class="label">Mã ĐVCQHVNSNN:</span><span class="value">${esc(v.nmmdvqhnsach)}</span></p>
      <p class="field"><span class="label">CCCD người mua:</span><span class="value">${esc(v.nmcmnd)}</span></p>
      <p class="field"><span class="label">Số hộ chiếu:</span><span class="value">${esc(v.nmshchieu)}</span></p>
      <p class="field"><span class="label">Địa chỉ:</span><span class="value">${esc(v.nmdchi)}</span></p>
      <p class="field"><span class="label">Số tài khoản:</span><span class="value">${bankBuyer}</span></p>
      <div class="field-row">
        <p class="field"><span class="label">Hình thức thanh toán:</span><span class="value">${esc(v.thtttoan)}</span></p>
        <p class="field"><span class="label">Đơn vị tiền tệ:</span><span class="value">${esc(v.dvtte)}</span></p>
      </div>
      <div class="field-row">
        <p class="field"><span class="label">Số bảng kê:</span><span class="value">${esc(v.dksbke)}</span></p>
        <p class="field"><span class="label">Ngày bảng kê:</span><span class="value">${esc(v.dknlbke)}</span></p>
      </div>
    </div>
    <hr class="divider" />
    <table class="res-tb">
      <thead>
        <tr>
          <th style="width:4%">STT</th>
          <th style="width:11%">Tính chất</th>
          <th style="width:10%">Loại hàng hoá đặc trưng</th>
          <th style="width:${nameWidth}">Tên hàng hóa, dịch vụ</th>
          <th style="width:7%">Đơn vị tính</th>
          <th style="width:8%">Số lượng</th>
          <th style="width:10%">Đơn giá</th>
          <th style="width:8%">Chiết khấu</th>
          ${
            v.isGtgt
              ? `<th style="width:8%">Thuế suất</th><th style="width:12%">Thành tiền chưa có thuế GTGT</th>`
              : `<th style="width:11%">Thành tiền</th>`
          }
        </tr>
      </thead>
      <tbody>${renderLines(v)}</tbody>
    </table>
    ${renderTaxRows(v)}
    <div class="totals-wrap">
      <table class="totals">
        ${
          v.isGtgt
            ? `<tr><td class="lbl">Tổng tiền chưa thuế<br/>(Tổng cộng thành tiền chưa có thuế)</td><td class="val">${esc(v.tgtcthue)}</td></tr>
               <tr><td class="lbl">Tổng tiền thuế (Tổng cộng tiền thuế)</td><td class="val">${esc(v.tgtthue)}</td></tr>`
            : ""
        }
        <tr><td class="lbl">Tổng tiền phí</td><td class="val">${esc(v.tgtphi)}</td></tr>
        <tr><td class="lbl">Tổng tiền chiết khấu thương mại</td><td class="val">${esc(v.ttcktmai || "0")}</td></tr>
        <tr><td class="lbl">Tổng tiền thanh toán bằng số</td><td class="val"><b>${esc(v.tgtttbso)}</b></td></tr>
        <tr><td class="lbl">Tổng tiền thanh toán bằng chữ</td><td class="val-left">${esc(v.tgtttbchu)}</td></tr>
        <tr><td class="lbl">Ghi chú</td><td class="val-left">${esc(v.gchu)}</td></tr>
      </table>
    </div>
    <div class="sign-area">
      <div>
        <p class="sign-title">NGƯỜI MUA HÀNG</p>
        <p class="sign-sub">(Chữ ký số (nếu có))</p>
      </div>
      <div>
        <p class="sign-title">NGƯỜI BÁN HÀNG</p>
        <p class="sign-sub">(Chữ ký điện tử, chữ ký số)</p>
        ${
          v.nbcks
            ? `<div class="sign-box">
                <span class="ok">Signature Valid</span>
                <span class="meta">Ký bởi ${esc(v.nbcksName)}</span>
                <span class="meta">Ký ngày: ${esc(v.nbcksTime)}</span>
              </div>`
            : ""
        }
      </div>
    </div>
    <div class="fd-end"><i>(Cần kiểm tra, đối chiếu khi lập, nhận hóa đơn)</i></div>
  </div>
</body>
</html>`;
}

export function safeName(value) {
  return String(value || "unknown")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_") || "unknown";
}

export function zipPathFor(detail, view) {
  const y = view.yearNum || detail._year || 0;
  const m = String(view.monthNum || detail._month || 0).padStart(2, "0");
  const khhdon = safeName(detail.khhdon);
  const shdon = safeName(detail.shdon);
  return `${y}/${m}/${khhdon}/${khhdon}_${shdon}.pdf`;
}
