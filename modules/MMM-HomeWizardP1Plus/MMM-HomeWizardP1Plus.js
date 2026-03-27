/* global Module, Log */

Module.register("MMM-HomeWizardP1Plus", {
  defaults: {
    // P1
    p1Host: null,
    updateIntervalSeconds: 10,

    // Price
    priceProvider: "easyenergy",
    priceUpdateMinutes: 30,
    priceMultiplier: 1.0,
    priceAdderEurPerKwh: 0.0,
    fixedPriceEurPerKwh: 0.30,

    // Gas price (fallback only, €/m3)
    fixedGasPriceEurPerM3: 1.20,

    // UI
    showPrice: true,
    showPriceStatus: true,
    showExport: true,
    showHistoryDays: 3
  },

  start() {
    this.dataPayload = null;
    this.error = null;

    // Config handshake retry (robust against early socket timing)
    this._sentConfig = false;
    this._configAcked = false;
    this._configRetryTimer = null;

    this.sendConfigToHelper();
    this._configRetryTimer = setInterval(() => {
      if (this._configAcked) {
        clearInterval(this._configRetryTimer);
        this._configRetryTimer = null;
        return;
      }
      this.sendConfigToHelper();
    }, 5000);

    // Stop retry after 60s to avoid infinite spam in weird states
    setTimeout(() => {
      if (this._configRetryTimer) {
        clearInterval(this._configRetryTimer);
        this._configRetryTimer = null;
      }
    }, 60_000);
  },

  sendConfigToHelper() {
    // Only send when p1Host exists; otherwise we will just show error.
    if (!this.config.p1Host) {
      this.error = "config.p1Host ontbreekt";
      this.updateDom(0);
      return;
    }
    this._sentConfig = true;
    this.sendSocketNotification("HWP1_CONFIG", this.config);
  },

  getStyles() {
    // Font Awesome is typically loaded by MagicMirror; keep CSS local for layout.
    return ["MMM-HomeWizardP1Plus.css"];
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "HWP1_DATA") {
      this._configAcked = true;
      this.error = null;
      this.dataPayload = payload || null;
      this.updateDom(0);
      return;
    }

    if (notification === "HWP1_ERROR") {
      this.error = payload?.message || "Onbekende fout";
      this.updateDom(0);
      return;
    }
  },

  // ---------- Formatting helpers ----------
  formatW(w) {
    if (w === null || w === undefined) return "—";
    const n = Number(w);
    if (!Number.isFinite(n)) return "—";

    // Show in W up to 999W, else kW with 1 decimal.
    if (n < 1000) return `${Math.round(n)} W`;
    return `${(n / 1000).toFixed(1)} kW`;
  },

  formatKwh(v) {
    if (v === null || v === undefined) return "—";
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return `${n.toFixed(2)} kWh`;
  },

  formatM3(v) {
    if (v === null || v === undefined) return "—";
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return `${n.toFixed(3)} m³`;
  },

  formatEur(v) {
    if (v === null || v === undefined) return "—";
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return `€ ${n.toFixed(2)}`;
  },

  // Expects "YYYY-MM-DD" -> "DD-MM-YY"
  formatDay(dayKey) {
    if (!dayKey || typeof dayKey !== "string") return "—";
    const m = dayKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return dayKey;
    const yy = m[1].slice(-2);
    const mm = m[2];
    const dd = m[3];
    return `${dd}-${mm}-${yy}`;
  },

  // ---------- DOM builders ----------
  buildWaitingDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "small dimmed";
    wrapper.innerText = this.error ? this.error : "Wachten op P1-Data…";
    return wrapper;
  },

  buildTopLines(payload) {
    const container = document.createElement("div");
    container.className = "hwp1-top";

    // Line 1: import + export on one line (icons)
    const powerLine = document.createElement("div");
    powerLine.className = "hwp1-line hwp1-powerline";

    const importW = payload?.importW ?? null;
    const exportW = payload?.exportW ?? null;

    // Down arrow = afname (import), Up arrow = teruglevering (export)
    const left = document.createElement("span");
    left.className = "hwp1-item";
    left.innerHTML =
      `<i class="fa fa-arrow-down hwp1-icon" aria-hidden="true"></i>` +
      `<span class="hwp1-value">${this.formatW(importW)}</span>`;

    const right = document.createElement("span");
    right.className = "hwp1-item";
    // showExport controls whether we show export; keep the slot to preserve alignment
    if (this.config.showExport) {
      right.innerHTML =
        `<i class="fa fa-arrow-up hwp1-icon" aria-hidden="true"></i>` +
        `<span class="hwp1-value">${this.formatW(exportW)}</span>`;
    } else {
      right.innerHTML = "";
    }

    powerLine.appendChild(left);

    // Spacer between import/export, but keep flex alignment
    const spacer = document.createElement("span");
    spacer.className = "hwp1-spacer";
    powerLine.appendChild(spacer);

    powerLine.appendChild(right);
    container.appendChild(powerLine);

    // Line 2: indicative price (electric + gas), icons, right-aligned (via CSS)
    if (this.config.showPrice) {
      const priceLine = document.createElement("div");
      priceLine.className = "hwp1-line hwp1-priceline";

      const elec = payload?.priceEurPerKwh ?? null;
      const gas = payload?.gasPriceEurPerM3 ?? null;

      const elecSpan = document.createElement("span");
      elecSpan.className = "hwp1-item";
      elecSpan.innerHTML =
        `<i class="fa fa-bolt hwp1-icon" aria-hidden="true"></i>` +
        `<span class="hwp1-value">${elec === null ? "—" : `€ ${Number(elec).toFixed(3)}/kWh`}</span>`;

      const gasSpan = document.createElement("span");
      gasSpan.className = "hwp1-item";
      gasSpan.innerHTML =
        `<i class="fa fa-fire hwp1-icon" aria-hidden="true"></i>` +
        `<span class="hwp1-value">${gas === null ? "—" : `€ ${Number(gas).toFixed(3)}/m³`}</span>`;

      priceLine.appendChild(elecSpan);

      const spacer2 = document.createElement("span");
      spacer2.className = "hwp1-spacer";
      priceLine.appendChild(spacer2);

      priceLine.appendChild(gasSpan);

      container.appendChild(priceLine);

      // Price source line intentionally omitted per request.
      // If you ever want it back, render payload.priceMode/source/error here.
    }

    return container;
  },

  buildHistoryTable(payload) {
    const hist = Array.isArray(payload?.daily) ? payload.daily : [];
    if (!hist.length) {
      const none = document.createElement("div");
      none.className = "small dimmed";
      none.innerText = "Geen historie beschikbaar.";
      return none;
    }

    const table = document.createElement("table");
    table.className = "small";
    table.style.width = "100%";

    // Header
    const head = document.createElement("tr");
    ["Dag", "Verbruik", "Kosten (€)"].forEach((t, idx) => {
      const th = document.createElement("th");
      th.textContent = t;
      th.style.textAlign = idx === 0 ? "left" : "right";
      head.appendChild(th);
    });
    table.appendChild(head);

    // Rows
    hist.slice(0, this.config.showHistoryDays || 3).forEach((rowData) => {
      const tr = document.createElement("tr");

      const tdDay = document.createElement("td");
      tdDay.textContent = this.formatDay(rowData.day);
      tdDay.style.textAlign = "left";
      tr.appendChild(tdDay);

      const tdUsage = document.createElement("td");
      tdUsage.style.textAlign = "right";

      const importKwh = rowData.import_kwh ?? 0;
      const gasM3 = rowData.gas_m3 ?? 0;

      // Electricity + Gas on same line, with icons
      tdUsage.innerHTML =
        `<span class="hwp1-item"><i class="fa fa-bolt hwp1-icon" aria-hidden="true"></i>` +
        `<span class="hwp1-value">${this.formatKwh(importKwh)}</span></span>` +
        `<span class="hwp1-item"><i class="fa fa-fire hwp1-icon" aria-hidden="true"></i>` +
        `<span class="hwp1-value">${this.formatM3(gasM3)}</span></span>`;

      tr.appendChild(tdUsage);

      const tdCost = document.createElement("td");
      tdCost.style.textAlign = "right";
      const totalCost = rowData.cost_eur_total ?? rowData.cost_eur ?? null;
      tdCost.textContent = this.formatEur(totalCost);
      tr.appendChild(tdCost);

      table.appendChild(tr);
    });

    return table;
  },

  getDom() {
    // When no data yet, show waiting/error
    if (!this.dataPayload) return this.buildWaitingDom();

    const wrapper = document.createElement("div");
    wrapper.className = "hwp1-wrapper";

    // Top lines (power + price)
    wrapper.appendChild(this.buildTopLines(this.dataPayload));

    // History table
    wrapper.appendChild(this.buildHistoryTable(this.dataPayload));

    return wrapper;
  }
});

