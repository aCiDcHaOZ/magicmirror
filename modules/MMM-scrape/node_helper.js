/* node_helper.js - MMM-scrape
 * Reads a CSV file and returns the next N pickup moments (date >= today).
 *
 * CSV format:
 *   date,types
 *   2026-02-12,"gft,pmd"
 *   2026-02-19,restafval
 */

const NodeHelper = require("node_helper");
const fs = require("fs");

function parseCsvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const idx = trimmed.indexOf(",");
  if (idx === -1) return null;

  const dateStr = trimmed.slice(0, idx).trim();
  let typesStr = trimmed.slice(idx + 1).trim();

  if (typesStr.startsWith('"') && typesStr.endsWith('"')) {
    typesStr = typesStr.slice(1, -1);
  }

  return { dateStr, typesStr };
}

function parseISODateToLocalMidnight(dateStr) {
  // YYYY-MM-DD
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  const dt = new Date(y, mo, d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

module.exports = NodeHelper.create({
  start: function () {
    console.log("[MMM-scrape] node_helper started (CSV mode)");
    this._config = {
      csvSource: "",
      locale: "nl-NL",
      renameLabels: {},
      daysToShow: 2
    };
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification !== "GET_AFVAL_DATA") return;

    if (payload && typeof payload === "object") {
      this._config.csvSource = payload.csvSource || this._config.csvSource;
      this._config.locale = payload.locale || this._config.locale;
      this._config.renameLabels = payload.renameLabels || this._config.renameLabels;
      this._config.daysToShow = Number(payload.daysToShow || this._config.daysToShow || 2);
    } else if (typeof payload === "string") {
      this._config.csvSource = payload;
    }

    this.loadUpcoming();
  },

  loadUpcoming: function () {
    const csvPath = this._config.csvSource;
    const locale = this._config.locale || "nl-NL";
    const renameLabels = this._config.renameLabels || {};
    const daysToShow = Math.max(1, Math.min(10, this._config.daysToShow || 2));

    try {
      if (!csvPath || typeof csvPath !== "string") {
        throw new Error("csvSource ontbreekt.");
      }
      if (!fs.existsSync(csvPath)) {
        throw new Error(`CSV niet gevonden: ${csvPath}`);
      }

      const raw = fs.readFileSync(csvPath, "utf8");
      const lines = raw.replace(/\r/g, "").split("\n");

      const now = new Date();
      const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const rows = [];

      for (const line of lines) {
        const parsed = parseCsvLine(line);
        if (!parsed) continue;

        // skip header
        if (parsed.dateStr.toLowerCase() === "date") continue;

        const dt = parseISODateToLocalMidnight(parsed.dateStr);
        if (!dt) continue;

        const tokens = parsed.typesStr
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean);

        const pretty = uniq(tokens.map((t) => renameLabels[t] || t));

        rows.push({ date: dt, dateISO: parsed.dateStr, labels: pretty });
      }

      rows.sort((a, b) => a.date - b.date);

      // future rows only
      const future = rows.filter((r) => r.date >= today0);

      // pick next N unique dates
      const picked = [];
      const seenDates = new Set();
      for (const r of future) {
        if (seenDates.has(r.dateISO)) continue;
        seenDates.add(r.dateISO);
        picked.push(r);
        if (picked.length >= daysToShow) break;
      }

      if (!picked.length) {
        this.sendSocketNotification("AFVAL_DATA", { days: [], next: null });
        this.sendSocketNotification("AFVAL_RESULT", "Geen inzameling gevonden");
        return;
      }

      // Format "do 12 feb" in nl-NL
      const fmt = new Intl.DateTimeFormat(locale, {
        weekday: "short",
        day: "numeric",
        month: "short"
      });

      const days = picked.map((p) => {
        const whenLabel = fmt.format(p.date).replace(/\.$/, "");
        return {
          dateISO: p.dateISO,
          whenLabel,
          labels: p.labels
        };
      });

      // Backwards compat: keep .next as first element
      this.sendSocketNotification("AFVAL_DATA", {
        days,
        next: days[0] || null
      });

      // Simple textual fallback
      const first = days[0];
      this.sendSocketNotification("AFVAL_RESULT", `${first.whenLabel} - ${first.labels.join(", ")}`);
    } catch (e) {
      console.error("[MMM-scrape] CSV read/parse error:", e);
      this.sendSocketNotification("AFVAL_RESULT", "Fout bij lezen CSV");
      this.sendSocketNotification("AFVAL_ERROR", { message: String(e.message || e) });
    }
  }
});
