import { TRA_CUU_URL } from "./src/config.js";

const OFFSCREEN_URL = "offscreen.html";

async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });
  if (existing.length) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ["BLOBS", "DOM_SCRAPING"],
    justification: "Chạy pipeline tải hoá đơn, render PDF và tạo file ZIP.",
  });

  for (let i = 0; i < 20; i += 1) {
    try {
      const ping = await chrome.runtime.sendMessage({ type: "OFFSCREEN_PING" });
      if (ping?.ok) return;
    } catch {
      // not ready
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

function extractBearer(value) {
  if (!value) return null;
  const m = String(value).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

async function saveToken(token, source = "webRequest") {
  if (!token) return;
  await chrome.storage.local.set({
    bearerToken: token,
    tokenCapturedAt: Date.now(),
    tokenSource: source,
  });
}

chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    const headers = details.requestHeaders || [];
    for (const h of headers) {
      if (h.name && h.name.toLowerCase() === "authorization") {
        const token = extractBearer(h.value);
        if (token) saveToken(token, "webRequest");
        break;
      }
    }
  },
  { urls: ["https://hoadondientu.gdt.gov.vn/*"] },
  ["requestHeaders", "extraHeaders"]
);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (
    message?.type === "OFFSCREEN_PING" ||
    message?.type === "OFFSCREEN_START_DOWNLOAD" ||
    message?.type === "OFFSCREEN_REVOKE_URL"
  ) {
    return false;
  }

  (async () => {
    switch (message?.type) {
      case "TOKEN_CAPTURED": {
        await saveToken(message.token, message.source || "content");
        sendResponse({ ok: true });
        break;
      }
      case "GET_STATUS": {
        const data = await chrome.storage.local.get([
          "bearerToken",
          "tokenCapturedAt",
          "tokenSource",
          "jobStatus",
        ]);
        sendResponse({
          ok: true,
          hasToken: Boolean(data.bearerToken),
          tokenCapturedAt: data.tokenCapturedAt || null,
          tokenSource: data.tokenSource || null,
          jobStatus: data.jobStatus || null,
          traCuuUrl: TRA_CUU_URL,
        });
        break;
      }
      case "START_DOWNLOAD": {
        const store = await chrome.storage.local.get(["bearerToken", "jobStatus"]);
        if (!store.bearerToken) {
          sendResponse({
            ok: false,
            error: "Chưa có Bearer token. Hãy mở trang tra cứu và bấm Tìm kiếm một lần.",
          });
          break;
        }
        if (store.jobStatus?.running) {
          sendResponse({ ok: false, error: "Đang tải dở. Đợi hoàn tất rồi thử lại." });
          break;
        }

        await ensureOffscreen();
        await chrome.storage.local.set({
          jobStatus: { running: true, progress: { message: "Khởi động..." } },
        });

        chrome.runtime.sendMessage({
          type: "OFFSCREEN_START_DOWNLOAD",
          payload: {
            token: store.bearerToken,
            year: message.year,
            month: message.month || null,
            limit: message.limit || null,
          },
        });

        sendResponse({ ok: true, started: true });
        break;
      }
      case "DOWNLOAD_PROGRESS": {
        await chrome.storage.local.set({
          jobStatus: { running: true, progress: message.progress },
        });
        sendResponse({ ok: true });
        break;
      }
      case "DOWNLOAD_COMPLETE": {
        try {
          if (!message.url) {
            throw new Error("Thiếu URL file ZIP từ offscreen.");
          }
          // SW không dùng createObjectURL — nhận blob URL đã tạo từ offscreen
          await chrome.downloads.download({
            url: message.url,
            filename: message.filename || "hoa-don.zip",
            saveAs: true,
          });
          await chrome.storage.local.set({
            jobStatus: {
              running: false,
              done: true,
              progress: {
                phase: "done",
                message: message.message || `Xong: ${message.ok}/${message.total} PDF`,
                ok: message.ok,
                failed: message.failed,
                total: message.total,
                filename: message.filename,
              },
            },
          });
          sendResponse({ ok: true });
        } catch (err) {
          await chrome.storage.local.set({
            jobStatus: {
              running: false,
              done: false,
              progress: {
                phase: "failed",
                message: err?.message || "Không tải được file ZIP",
              },
            },
          });
          sendResponse({ ok: false, error: err?.message || String(err) });
        }
        break;
      }
      case "DOWNLOAD_FAILED": {
        await chrome.storage.local.set({
          jobStatus: {
            running: false,
            done: false,
            progress: { phase: "failed", message: message.error || "Lỗi không xác định" },
          },
        });
        sendResponse({ ok: true });
        break;
      }
      case "OPEN_TRA_CUU": {
        await chrome.tabs.create({ url: TRA_CUU_URL });
        sendResponse({ ok: true });
        break;
      }
      case "RESET_JOB": {
        await chrome.storage.local.set({ jobStatus: null });
        sendResponse({ ok: true });
        break;
      }
      default:
        break;
    }
  })();

  return true;
});

chrome.alarms.create("keepalive", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(() => {});
