window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== "gdt-invoice-ext" || data.type !== "TOKEN") return;
  if (!data.token) return;
  chrome.runtime
    .sendMessage({ type: "TOKEN_CAPTURED", token: data.token, source: "page-fetch" })
    .catch(() => {});
});
