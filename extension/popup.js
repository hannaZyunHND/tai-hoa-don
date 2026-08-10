const yearEl = document.getElementById("year");
const monthEl = document.getElementById("month");
const limitEl = document.getElementById("limit");
const tokenBadge = document.getElementById("tokenBadge");
const tokenMeta = document.getElementById("tokenMeta");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const btnDownload = document.getElementById("btnDownload");
const btnOpen = document.getElementById("btnOpen");

yearEl.value = String(new Date().getFullYear());

function formatTime(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString("vi-VN");
  } catch {
    return "";
  }
}

function applyStatus(status) {
  if (status?.hasToken) {
    tokenBadge.textContent = "Đã bắt";
    tokenBadge.className = "badge ok";
    tokenMeta.textContent = `Bắt lúc ${formatTime(status.tokenCapturedAt)} (${status.tokenSource || "unknown"})`;
  } else {
    tokenBadge.textContent = "Chưa có";
    tokenBadge.className = "badge bad";
    tokenMeta.textContent = "Mở trang tra cứu và bấm Tìm kiếm để bắt token.";
  }

  const job = status?.jobStatus;
  const progress = job?.progress;
  if (progress?.message) {
    progressText.textContent = progress.message;
  } else {
    progressText.textContent = "Chưa chạy.";
  }

  if (progress?.total && progress?.current) {
    const pct = Math.min(100, Math.round((progress.current / progress.total) * 100));
    progressBar.style.width = `${pct}%`;
  } else if (job?.running) {
    progressBar.style.width = "15%";
  } else if (progress?.phase === "done") {
    progressBar.style.width = "100%";
  } else {
    progressBar.style.width = "0%";
  }

  btnDownload.disabled = Boolean(job?.running);
}

async function refresh() {
  const status = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
  applyStatus(status);
}

btnOpen.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "OPEN_TRA_CUU" });
});

btnDownload.addEventListener("click", async () => {
  const year = Number(yearEl.value);
  const month = monthEl.value ? Number(monthEl.value) : null;
  const limit = limitEl.value ? Number(limitEl.value) : null;

  if (!year || year < 2010) {
    progressText.textContent = "Năm không hợp lệ.";
    return;
  }

  btnDownload.disabled = true;
  progressText.textContent = "Đang khởi động...";
  progressBar.style.width = "8%";

  const resp = await chrome.runtime.sendMessage({
    type: "START_DOWNLOAD",
    year,
    month,
    limit,
  });

  if (!resp?.ok) {
    progressText.textContent = resp?.error || "Không khởi động được.";
    btnDownload.disabled = false;
    progressBar.style.width = "0%";
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.bearerToken || changes.jobStatus || changes.tokenCapturedAt) {
    refresh();
  }
});

refresh();
setInterval(refresh, 1500);
