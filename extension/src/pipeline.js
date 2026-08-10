import { InvoiceApi } from "./api.js";
import { BACKGROUND_URL } from "./config.js";
import { fetchInvoices } from "./fetcher.js";
import {
  buildViewModel,
  makeQrDataUri,
  renderInvoiceHtml,
  zipPathFor,
} from "./renderer.js";

async function resolveBackgroundDataUri() {
  try {
    const localUrl = chrome.runtime.getURL("assets/viewinvoice-bg.jpg");
    const resp = await fetch(localUrl);
    if (!resp.ok) throw new Error("local bg missing");
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return `data:image/jpeg;base64,${btoa(binary)}`;
  } catch {
    return BACKGROUND_URL;
  }
}

function htmlToPdfBlob(html) {
  return new Promise((resolve, reject) => {
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-10000px";
    container.style.top = "0";
    container.innerHTML = html;
    document.body.appendChild(container);

    const opt = {
      margin: 0,
      filename: "invoice.pdf",
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] },
    };

    globalThis
      .html2pdf()
      .set(opt)
      .from(container)
      .outputPdf("blob")
      .then((blob) => {
        container.remove();
        resolve(blob);
      })
      .catch((err) => {
        container.remove();
        reject(err);
      });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runDownloadPipeline({ token, year, month = null, limit = null }, onProgress) {
  if (typeof globalThis.JSZip !== "function") {
    throw new Error("Thiếu JSZip");
  }
  if (typeof globalThis.html2pdf !== "function") {
    throw new Error("Thiếu html2pdf");
  }

  const api = new InvoiceApi(token);
  const backgroundUri = await resolveBackgroundDataUri();
  const zip = new globalThis.JSZip();

  const invoices = await fetchInvoices(api, year, month, onProgress);
  const list = limit ? invoices.slice(0, limit) : invoices;
  const total = list.length;

  onProgress?.({
    phase: "export",
    message: `Bắt đầu xuất ${total} PDF...`,
    current: 0,
    total,
  });

  let ok = 0;
  let failed = 0;

  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    const label = `${item.khhdon}/${item.shdon}`;
    onProgress?.({
      phase: "export",
      message: `[${i + 1}/${total}] ${label}`,
      current: i + 1,
      total,
    });

    try {
      const detail = await api.fetchDetail({
        nbmst: item.nbmst,
        khhdon: item.khhdon,
        shdon: item.shdon,
        khmshdon: item.khmshdon,
      });
      detail._year = item._year || year;
      detail._month = item._month;

      const qr = await makeQrDataUri(detail.qrcode);
      const view = buildViewModel(detail, backgroundUri, qr);
      const html = renderInvoiceHtml(view);
      const pdfBlob = await htmlToPdfBlob(html);
      const path = zipPathFor(detail, view);
      zip.file(path, pdfBlob);
      ok += 1;
    } catch (err) {
      failed += 1;
      onProgress?.({
        phase: "error",
        message: `Lỗi ${label}: ${err.message || err}`,
        current: i + 1,
        total,
      });
    }

    await sleep(120);
  }

  onProgress?.({ phase: "zip", message: "Đang nén ZIP..." });
  const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const monthPart = month ? `-T${String(month).padStart(2, "0")}` : "";
  const filename = `hoa-don-${year}${monthPart}.zip`;

  onProgress?.({
    phase: "done",
    message: `Xong: ${ok} PDF, ${failed} lỗi`,
    ok,
    failed,
    total,
    filename,
  });

  return { zipBlob, filename, ok, failed, total };
}
