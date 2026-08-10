(() => {
  const emit = (token) => {
    if (!token) return;
    window.postMessage({ source: "gdt-invoice-ext", type: "TOKEN", token }, "*");
  };

  const pick = (headers) => {
    if (!headers) return null;
    if (headers instanceof Headers) {
      return headers.get("Authorization") || headers.get("authorization");
    }
    if (Array.isArray(headers)) {
      const hit = headers.find((h) => String(h[0] || "").toLowerCase() === "authorization");
      return hit ? hit[1] : null;
    }
    if (typeof headers === "object") {
      return headers.Authorization || headers.authorization || null;
    }
    return null;
  };

  const fromValue = (value) => {
    if (!value) return null;
    const m = String(value).match(/^Bearer\s+(.+)$/i);
    return m ? m[1].trim() : null;
  };

  const rawFetch = window.fetch;
  window.fetch = function patchedFetch(input, init = {}) {
    try {
      const headerValue =
        pick(init && init.headers) ||
        (input && typeof input === "object" && input.headers && pick(input.headers));
      emit(fromValue(headerValue));
    } catch (_) {
      /* ignore */
    }
    return rawFetch.apply(this, arguments);
  };

  const rawOpen = XMLHttpRequest.prototype.open;
  const rawSet = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function patchedOpen() {
    this.__gdt_headers = {};
    return rawOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function patchedSet(key, value) {
    try {
      if (String(key).toLowerCase() === "authorization") emit(fromValue(value));
    } catch (_) {
      /* ignore */
    }
    return rawSet.apply(this, arguments);
  };
})();
