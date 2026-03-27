/* MMM-HomeWizardP1Plus - node_helper.js
 *
 * - Reads HomeWizard P1 Meter via Local API v1: http://<p1Host>/api/v1/data
 * - Fetches indicative online kWh price via EasyEnergy APX endpoint (current hour)
 * - Applies optional adjustments: priceAdderEurPerKwh and priceMultiplier
 * - Fallbacks to fixedPriceEurPerKwh when online price fails
 * - Tracks last N days (default 3) import/export kWh deltas + costs in storage/daily.json
 */
const NodeHelper = require("node_helper");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toDayKeyLocal(tsMs) {
  const d = new Date(tsMs);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

module.exports = NodeHelper.create({
  start() {
    this.started = false;
    this.config = null;

    this.current = { importW: null, exportW: null };
    this.lastTotals = null; // { import_kwh, export_kwh, gas_m3 }

    // Daily aggregation: import/export deltas + gas deltas + costs
    // Backwards compatible with older storage that only had cost_eur (electricity only).
    this.daily = {}; // { "YYYY-MM-DD": { import_kwh, export_kwh, gas_m3, cost_eur_elec, cost_eur_gas, cost_eur_total } }

    // Price cache
    this.price = {
      eurPerKwhUsageRaw: null,
      eurPerKwhUsageAdj: null,
      eurPerKwhReturnRaw: null,
      eurPerKwhReturnAdj: null,
      tsMs: null,
      source: null,
      error: null
    };

    this.storageDir = path.join(__dirname, "storage");
    this.dailyFile = path.join(this.storageDir, "daily.json");

    this.ensureStorage();
    this.loadDaily();
  },

  ensureStorage() {
    if (!fs.existsSync(this.storageDir)) fs.mkdirSync(this.storageDir, { recursive: true });
  },

  loadDaily() {
    try {
      if (fs.existsSync(this.dailyFile)) {
        const raw = fs.readFileSync(this.dailyFile, "utf8");
        const j = JSON.parse(raw);
        if (j && typeof j === "object") this.daily = j;
      }
    } catch (e) {
      this.daily = {};
    }
  },

  saveDaily() {
    try {
      fs.writeFileSync(this.dailyFile, JSON.stringify(this.daily, null, 2), "utf8");
    } catch (e) {
      // non-fatal
    }
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "HWP1_CONFIG") {
      this.config = payload;

      if (!this.started) {
        this.started = true;
        this.pollLoop();
        this.priceLoop();
      }
    }
  },

  async pollLoop() {
    const intervalMs = Math.max(2000, (this.config.updateIntervalSeconds || 10) * 1000);

    while (true) {
      try {
        await this.pollP1();
      } catch (e) {
        this.sendSocketNotification("HWP1_ERROR", {
          message: `P1 poll failed: ${e.message || String(e)}`
        });
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }
  },

  async priceLoop() {
    const intervalMs = Math.max(60_000, (this.config.priceUpdateMinutes || 30) * 60_000);

    while (true) {
      try {
        await this.refreshPrice(true);
      } catch (e) {
        // Keep running, fallback will handle UI/costs.
        this.price.error = e.message || String(e);
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }
  },

  applyPriceAdjustments(rawEurPerKwh) {
    const mul = safeNumber(this.config.priceMultiplier);
    const add = safeNumber(this.config.priceAdderEurPerKwh);
    const m = mul !== null ? mul : 1.0;
    const a = add !== null ? add : 0.0;
    return (rawEurPerKwh + a) * m;
  },

  getFixedPriceFallback() {
    const fixed = safeNumber(this.config.fixedPriceEurPerKwh);
    return fixed !== null ? fixed : null;
  },

  getFixedGasPriceFallback() {
    const fixed = safeNumber(this.config.fixedGasPriceEurPerM3);
    return fixed !== null ? fixed : null;
  },

  getFixedGasPriceFallback() {
    const fixed = safeNumber(this.config.fixedGasPriceEurPerM3);
    return fixed !== null ? fixed : null;
  },

  // Prefer online usage price; fallback to fixed; else null
  getPriceWithMode() {
    const online = safeNumber(this.price?.eurPerKwhUsageAdj);
    if (online !== null) return { price: online, mode: "online" };

    const fixed = this.getFixedPriceFallback();
    if (fixed !== null) return { price: fixed, mode: "fallback" };

    return { price: null, mode: "none" };
  },

  async refreshPrice(force) {
    const provider = String(this.config.priceProvider || "easyenergy").toLowerCase();
    const nowMs = Date.now();

    const cacheMinutes = Math.max(1, Number(this.config.priceUpdateMinutes || 30));
    const ttlMs = cacheMinutes * 60_000;

    if (!force && this.price.tsMs && (nowMs - this.price.tsMs) < ttlMs) return;

    if (provider !== "easyenergy") {
      throw new Error(`Unknown priceProvider: ${provider}`);
    }

    // Fetch current hour tariffs (usage + return)
    const { usage, ret } = await this.fetchEasyEnergyCurrentHourTariffs();

    this.price = {
      eurPerKwhUsageRaw: usage,
      eurPerKwhUsageAdj: this.applyPriceAdjustments(usage),

      eurPerKwhReturnRaw: ret,
      eurPerKwhReturnAdj: ret !== null ? this.applyPriceAdjustments(ret) : null,

      tsMs: nowMs,
      source: "easyenergy",
      error: null
    };
  },

  async fetchEasyEnergyCurrentHourTariffs() {
    // Build a *valid* time window for current hour (UTC), which EasyEnergy accepts.
    const now = new Date();

    const start = new Date(now);
    start.setUTCMinutes(0, 0, 0);

    const end = new Date(now);
    end.setUTCMinutes(59, 0, 0);

    const url =
      `https://mijn.easyenergy.com/nl/api/tariff/getapxtariffs?` +
      `startTimestamp=${encodeURIComponent(start.toISOString())}` +
      `&endTimestamp=${encodeURIComponent(end.toISOString())}` +
      `&grouping=`;

    const res = await fetch(url, { timeout: 8000 });
    if (!res.ok) throw new Error(`HTTP ${res.status} from EasyEnergy`);

    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) throw new Error("EasyEnergy: empty tariff array");

    const usage = safeNumber(arr[0].TariffUsage);
    if (usage === null) throw new Error("EasyEnergy: TariffUsage missing/invalid");

    const ret = safeNumber(arr[0].TariffReturn); // may be null, that's OK

    return { usage, ret };
  },

  buildLastNDays(n) {
    const out = [];
    const now = new Date();
    for (let i = 0; i < n; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = toDayKeyLocal(d.getTime());
      const v = this.daily[key] || { import_kwh: 0, export_kwh: 0, gas_m3: 0, cost_eur: 0 };

      // Backwards compatibility: if storage only has cost_eur, treat that as total.
      const costTotal = (v.cost_eur_total !== undefined && v.cost_eur_total !== null)
        ? v.cost_eur_total
        : v.cost_eur;

      out.push({
        day: key,
        import_kwh: v.import_kwh || 0,
        export_kwh: v.export_kwh || 0,
        gas_m3: v.gas_m3 || 0,
        cost_eur_elec: v.cost_eur_elec ?? null,
        cost_eur_gas: v.cost_eur_gas ?? null,
        cost_eur_total: costTotal ?? 0,
        // keep cost_eur for older frontend versions
        cost_eur: costTotal ?? 0
      });
    }
    return out;
  },

  async pollP1() {
    if (!this.config || !this.config.p1Host) throw new Error("Missing config.p1Host");

    // HomeWizard P1 Local API v1
    const url = `http://${this.config.p1Host}/api/v1/data`;
    const res = await fetch(url, { timeout: 5000 });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    const j = await res.json();

    const activePowerW = safeNumber(j.active_power_w);
    const importTotalKwh = safeNumber(j.total_power_import_kwh);
    const exportTotalKwh = safeNumber(j.total_power_export_kwh);

    // Gas totals (m³). Key name depends on firmware; commonly: total_gas_m3
    const gasTotalM3 = safeNumber(j.total_gas_m3 ?? j.gas_total_m3 ?? j.gas_m3_total ?? j.total_gas_m3);

    // Split net power into import/export
    let importW = null;
    let exportW = null;
    if (activePowerW !== null) {
      if (activePowerW >= 0) {
        importW = activePowerW;
        exportW = 0;
      } else {
        importW = 0;
        exportW = Math.abs(activePowerW);
      }
    }
    this.current.importW = importW;
    this.current.exportW = exportW;

    // Opportunistic price refresh (cached)
    try {
      await this.refreshPrice(false);
    } catch (e) {
      this.price.error = e.message || String(e);
    }

    const { price, mode } = this.getPriceWithMode();
    const gasPrice = this.getFixedGasPriceFallback();

    // Daily aggregation via deltas
    const nowMs = Date.now();
    const dayKey = toDayKeyLocal(nowMs);
    if (!this.daily[dayKey]) {
      this.daily[dayKey] = {
        import_kwh: 0,
        export_kwh: 0,
        gas_m3: 0,
        cost_eur_elec: 0,
        cost_eur_gas: 0,
        cost_eur_total: 0
      };
    }

    // Storage migration for older entries
    const d = this.daily[dayKey];
    if (d.gas_m3 === undefined) d.gas_m3 = 0;
    if (d.cost_eur_elec === undefined) d.cost_eur_elec = safeNumber(d.cost_eur) || 0;
    if (d.cost_eur_gas === undefined) d.cost_eur_gas = 0;
    if (d.cost_eur_total === undefined) d.cost_eur_total = d.cost_eur_elec + d.cost_eur_gas;

    if (importTotalKwh !== null && exportTotalKwh !== null) {
      if (this.lastTotals) {
        const di = importTotalKwh - this.lastTotals.import_kwh;
        const de = exportTotalKwh - this.lastTotals.export_kwh;

        const dg = (gasTotalM3 !== null && this.lastTotals.gas_m3 !== null && this.lastTotals.gas_m3 !== undefined)
          ? (gasTotalM3 - this.lastTotals.gas_m3)
          : 0;

        // Sanity filter: ignore resets/negative and crazy jumps
        const deltaImport = di > 0 && di < 10 ? di : 0;
        const deltaExport = de > 0 && de < 10 ? de : 0;

        const deltaGas = dg > 0 && dg < 1 ? dg : 0;

        d.import_kwh += deltaImport;
        d.export_kwh += deltaExport;
        d.gas_m3 += deltaGas;

        // Costs: electricity import + gas, and total
        let addElec = 0;
        if (price !== null) addElec = deltaImport * price;
        let addGas = 0;
        if (gasPrice !== null) addGas = deltaGas * gasPrice;

        d.cost_eur_elec += addElec;
        d.cost_eur_gas += addGas;
        d.cost_eur_total += (addElec + addGas);
        // Backwards compatibility: expose total also via cost_eur
        d.cost_eur = d.cost_eur_total;

        this.saveDaily();
      }

      this.lastTotals = {
        import_kwh: importTotalKwh,
        export_kwh: exportTotalKwh,
        gas_m3: gasTotalM3
      };
    }

    // Optional debug (uncomment if needed)
    // console.log("[HWP1] usagePrice=", price, "mode=", mode, "source=", this.price?.source, "err=", this.price?.error);

    this.sendSocketNotification("HWP1_DATA", {
      ts: nowMs,
      importW: this.current.importW,
      exportW: this.current.exportW,

      // Indicative price (import) + optional return price
      priceEurPerKwh: price,
      priceReturnEurPerKwh: this.price.eurPerKwhReturnAdj,
      gasPriceEurPerM3: gasPrice,

      // Price status
      priceMode: mode,                 // online | fallback | none
      priceSource: this.price.source,  // easyenergy (or null)
      priceError: this.price.error,    // last error, if any

      daily: this.buildLastNDays(this.config.showHistoryDays || 3)
    });
  }
});

