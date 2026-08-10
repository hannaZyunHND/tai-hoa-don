function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

export function monthDateRange(year, month) {
  const last = daysInMonth(year, month);
  const mm = String(month).padStart(2, "0");
  return {
    dateFrom: `01/${mm}/${year}T00:00:00`,
    dateTo: `${String(last).padStart(2, "0")}/${mm}/${year}T23:59:59`,
  };
}

export function iterMonths(year, monthFilter = null) {
  if (monthFilter) return [monthFilter];
  const today = new Date();
  let last = 12;
  if (year === today.getFullYear()) last = today.getMonth() + 1;
  else if (year > today.getFullYear()) last = 0;
  const months = [];
  for (let m = 1; m <= last; m += 1) months.push(m);
  return months;
}

export async function fetchMonthInvoices(api, year, month, onProgress) {
  const { dateFrom, dateTo } = monthDateRange(year, month);
  const invoices = [];
  const seen = new Set();
  let state = null;

  while (true) {
    const page = await api.fetchPurchasePage({ dateFrom, dateTo, state });
    const datas = page.datas || [];
    for (const item of datas) {
      const key =
        String(item.id || "") ||
        `${item.nbmst}|${item.khhdon}|${item.shdon}|${item.khmshdon}`;
      if (seen.has(key)) continue;
      seen.add(key);
      invoices.push({ ...item, _year: year, _month: month });
    }
    const next = page.state || null;
    if (!next || !datas.length || next === state) break;
    state = next;
    if (onProgress) onProgress({ phase: "filter", year, month, count: invoices.length });
  }
  return invoices;
}

export async function fetchInvoices(api, year, month = null, onProgress) {
  const months = iterMonths(year, month);
  const all = [];
  for (const m of months) {
    if (onProgress) {
      onProgress({ phase: "filter", message: `Đang lọc tháng ${String(m).padStart(2, "0")}/${year}...` });
    }
    const items = await fetchMonthInvoices(api, year, m, onProgress);
    if (onProgress) {
      onProgress({
        phase: "filter",
        message: `Tháng ${String(m).padStart(2, "0")}/${year}: ${items.length} hoá đơn`,
        count: items.length,
      });
    }
    all.push(...items);
  }
  return all;
}
