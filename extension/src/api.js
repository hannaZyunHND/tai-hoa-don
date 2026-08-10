import { HOST, PAGE_SIZE } from "./config.js";

export class InvoiceApi {
  constructor(token) {
    this.token = token;
    this.host = HOST;
  }

  async #get(pathWithQuery) {
    const resp = await fetch(`${this.host}${pathWithQuery}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`API ${resp.status}: ${text.slice(0, 200)}`);
    }
    return resp.json();
  }

  fetchPurchasePage({ dateFrom, dateTo, state = null, size = PAGE_SIZE }) {
    const search = `tdlap=ge=${dateFrom};tdlap=le=${dateTo};ttxly==5`;
    let query = `sort=tdlap:desc&size=${size}&search=${search}`;
    if (state) query += `&state=${encodeURIComponent(state)}`;
    return this.#get(`/api/query/invoices/purchase?${query}`);
  }

  fetchDetail({ nbmst, khhdon, shdon, khmshdon }) {
    const qs = new URLSearchParams({
      nbmst: String(nbmst),
      khhdon: String(khhdon),
      shdon: String(shdon),
      khmshdon: String(khmshdon),
    });
    return this.#get(`/api/query/invoices/detail?${qs}`);
  }
}
