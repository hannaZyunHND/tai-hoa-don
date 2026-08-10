import { runDownloadPipeline } from "./src/pipeline.js";

let running = false;
let pendingObjectUrl = null;

function revokePendingUrl() {
  if (pendingObjectUrl) {
    try {
      URL.revokeObjectURL(pendingObjectUrl);
    } catch {
      /* ignore */
    }
    pendingObjectUrl = null;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "OFFSCREEN_PING") {
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "OFFSCREEN_REVOKE_URL") {
    revokePendingUrl();
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "OFFSCREEN_START_DOWNLOAD") {
    if (running) {
      sendResponse({ ok: false, error: "Đang chạy job khác" });
      return false;
    }
    running = true;
    const { token, year, month, limit } = message.payload || {};

    (async () => {
      try {
        const result = await runDownloadPipeline(
          { token, year, month: month || null, limit: limit || null },
          (progress) => {
            chrome.runtime.sendMessage({ type: "DOWNLOAD_PROGRESS", progress }).catch(() => {});
          }
        );

        // Tạo blob URL ở offscreen (SW không có URL.createObjectURL)
        revokePendingUrl();
        pendingObjectUrl = URL.createObjectURL(result.zipBlob);

        chrome.runtime.sendMessage({
          type: "DOWNLOAD_COMPLETE",
          url: pendingObjectUrl,
          filename: result.filename,
          ok: result.ok,
          failed: result.failed,
          total: result.total,
          message: `Xong: ${result.ok}/${result.total} PDF`,
        }).catch(() => {});

        // Giữ blob sống đủ lâu để Chrome kịp tải
        setTimeout(revokePendingUrl, 180_000);
      } catch (err) {
        chrome.runtime.sendMessage({
          type: "DOWNLOAD_FAILED",
          error: err?.message || String(err),
        }).catch(() => {});
      } finally {
        running = false;
      }
    })();

    sendResponse({ ok: true, started: true });
    return false;
  }

  return false;
});
