/* global Module */

Module.register("MMM-AstroPanel", {
  defaults: {
    lat: null,
    lon: null,

    locale: "nl-NL",
    timezone: "Europe/Amsterdam",

    timeFormat: 24,          // 12 of 24
    showSeconds: true,

    updateInterval: 60 * 1000 // zon/maan refresh
  },

  start() {
    this.sun = null;
    this.moon = null;
    this.now = new Date();

    // lat/lon uit moduleconfig
    const lat = this.config.lat;
    const lon = this.config.lon;

    this.sendSocketNotification("ASTRO_CONFIG", {
      lat,
      lon,
      timezone: this.config.timezone
    });

    this.scheduleUpdates();

    // direct eerste keer ophalen
    this.sendSocketNotification("ASTRO_REQUEST", { ts: Date.now() });
  },

  scheduleUpdates() {
    // Astro refresh (zon/maan) op interval
    setInterval(() => {
      this.sendSocketNotification("ASTRO_REQUEST", { ts: Date.now() });
    }, this.config.updateInterval);

    // Tijd updaten: elke seconde als showSeconds aan staat, anders elke minuut
    const tickMs = this.config.showSeconds ? 1000 : 60 * 1000;
    setInterval(() => {
      this.now = new Date();
      this.updateDom(0);
    }, tickMs);
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "ASTRO_DATA") {
      this.sun = payload?.sun ?? null;
      this.moon = payload?.moon ?? null;
      this.updateDom(0);
    }
  },

  getStyles() {
    return ["MMM-AstroPanel.css"];
  },

  pad2(n) {
    return String(n).padStart(2, "0");
  },

  formatTime(dateObj) {
    const d = (dateObj instanceof Date) ? dateObj : new Date(dateObj);
    const h = d.getHours();
    const m = d.getMinutes();
    const s = d.getSeconds();

    if (this.config.timeFormat === 12) {
      const hh = ((h + 11) % 12) + 1;
      return {
        hh: this.pad2(hh),
        mm: this.pad2(m),
        ss: this.pad2(s),
        ampm: h >= 12 ? "PM" : "AM"
      };
    }

    return {
      hh: this.pad2(h),
      mm: this.pad2(m),
      ss: this.pad2(s),
      ampm: ""
    };
  },

  getMoonPhaseName(phase01) {
    // SunCalc phase: 0..1 (0 new moon, 0.5 full)
    const p = phase01;
    if (p < 0.03 || p > 0.97) return "Nieuwe maan";
    if (p < 0.22) return "Wassende sikkel";
    if (p < 0.28) return "Eerste kwartier";
    if (p < 0.47) return "Wassende maan";
    if (p < 0.53) return "Volle maan";
    if (p < 0.72) return "Afnemende maan";
    if (p < 0.78) return "Laatste kwartier";
    return "Afnemende sikkel";
  },

  makeSunRow(iconClass, timeText) {
    const row = document.createElement("div");
    row.className = "astro-sunrow";

    const icon = document.createElement("i");
    icon.className = `fas ${iconClass} astro-sunicon`;

    const time = document.createElement("div");
    time.className = "astro-suntime";
    time.textContent = timeText;

    row.appendChild(icon);
    row.appendChild(time);
    return row;
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "astro-panel";

    // LINKER BLOK (datum, tijd, maan)
    const left = document.createElement("div");
    left.className = "astro-left";

    const dateEl = document.createElement("div");
    dateEl.className = "astro-date";
    dateEl.textContent = this.now.toLocaleDateString(this.config.locale, {
      weekday: "long",
      day: "numeric",
      month: "long"
    });

    const timeEl = document.createElement("div");
    timeEl.className = "astro-time";

    const t = this.formatTime(this.now);

    const hhmm = document.createElement("span");
    hhmm.className = "astro-time-hhmm";
    hhmm.textContent = `${t.hh}:${t.mm}`;

    const ss = document.createElement("sup");
    ss.className = "astro-time-ss";
    ss.textContent = this.config.showSeconds ? `:${t.ss}` : "";

    timeEl.appendChild(hhmm);
    if (this.config.showSeconds) timeEl.appendChild(ss);

    const moonEl = document.createElement("div");
    moonEl.className = "astro-moon";

    if (this.moon) {
      const phaseName = this.getMoonPhaseName(this.moon.phase);
      const illumPct = Math.round(this.moon.illumination * 100);
      moonEl.textContent = `${phaseName} • ${illumPct}%`;
    } else {
      moonEl.textContent = "Maan: laden…";
    }

    left.appendChild(dateEl);
    left.appendChild(timeEl);
    left.appendChild(moonEl);

    // RECHTER BLOK (zonsopgang / hoogste / zonsondergang) - als lijst met iconen
    const right = document.createElement("div");
    right.className = "astro-right";

    const sunriseVal = this.sun?.sunrise ?? "…";
    const noonVal = this.sun?.solarNoon ?? "…";
    const sunsetVal = this.sun?.sunset ?? "…";

    // Als fa-sunrise/fa-sunset niet beschikbaar zijn in jouw FontAwesome set,
    // vervang ze door: fa-arrow-up / fa-sun / fa-arrow-down
    right.appendChild(this.makeSunRow("fa-arrow-up", sunriseVal));
    right.appendChild(this.makeSunRow("fa-sun", noonVal));
    right.appendChild(this.makeSunRow("fa-arrow-down", sunsetVal));



    wrapper.appendChild(left);
    wrapper.appendChild(right);

    return wrapper;
  }
});

