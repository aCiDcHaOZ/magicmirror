/* MMM-scrape.js
 * Shows upcoming afval pickup moments from a CSV file.
 */

Module.register("MMM-scrape", {
  defaults: {
    csvSource: "/home/magicmirror/MagicMirror/afval-2026.csv",
    refreshInterval: 6 * 60 * 60 * 1000, // 6 hours
    showHeading: true,
    headingText: "Afvalinzameling (komende ophaaldagen)",
    align: "left", // left | center | right
    locale: "nl-NL",
    daysToShow: 2,
    // renameLabels maps CSV tokens -> display text
    renameLabels: {
      gft: "Groene bak",
      pmd: "Plastic zakken",
      restafval: "Grijze bak",
      textiel: "Textiel",
      kerstbomen: "Kerstbomen"
    }
  },

  start: function () {
    this.error = null;
    this.nextText = "Laden…";
    this.payloadData = null;

    this.getData();
    this.scheduleUpdate();
  },

  scheduleUpdate: function () {
    const interval = Number(this.config.refreshInterval) || (6 * 60 * 60 * 1000);
    setInterval(() => this.getData(), interval);
  },

  getData: function () {
    this.error = null;
    this.sendSocketNotification("GET_AFVAL_DATA", {
      csvSource: this.config.csvSource,
      locale: this.config.locale,
      renameLabels: this.config.renameLabels || {},
      daysToShow: this.config.daysToShow || 2
    });
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "AFVAL_RESULT") {
      this.nextText = String(payload);
      this.updateDom();
    }

    if (notification === "AFVAL_DATA") {
      this.payloadData = payload;
      this.error = null;
      this.updateDom();
    }

    if (notification === "AFVAL_ERROR") {
      this.error = payload && payload.message ? payload.message : String(payload);
      this.updateDom();
    }
  },

  getDom: function () {
    const wrapper = document.createElement("div");
    wrapper.className = "mmm-scrape-wrapper";
    wrapper.style.textAlign = this.config.align || "left";

    if (this.config.showHeading) {
      const h = document.createElement("div");
      h.className = "mmm-scrape-heading bright";
      h.innerText = this.config.headingText || "";
      h.style.marginBottom = "6px";
      wrapper.appendChild(h);
    }

    if (this.error) {
      const e = document.createElement("div");
      e.className = "mmm-scrape-error bright";
      e.innerText = "Error: " + this.error;
      wrapper.appendChild(e);
      return wrapper;
    }

    // Preferred: structured payload with days[]
    const days = (this.payloadData && Array.isArray(this.payloadData.days)) ? this.payloadData.days : null;

    if (days && days.length) {
      for (const d of days) {
        const row = document.createElement("div");
        row.className = "mmm-scrape-row";

        const when = document.createElement("span");
        when.className = "mmm-scrape-when bright";
        when.innerText = d.whenLabel || d.dateISO || "";

        const sep = document.createElement("span");
        sep.className = "mmm-scrape-sep dimmed";
        sep.innerText = "  -  ";

        const labels = document.createElement("span");
        labels.className = "mmm-scrape-labels";
        labels.innerText = (d.labels || []).join(", ");

        row.appendChild(when);
        row.appendChild(sep);
        row.appendChild(labels);

        wrapper.appendChild(row);
      }
      return wrapper;
    }

    // Backwards compat: if only next exists
    if (this.payloadData && this.payloadData.next) {
      const row = document.createElement("div");
      row.className = "mmm-scrape-row";

      const when = document.createElement("span");
      when.className = "mmm-scrape-when bright";
      when.innerText = this.payloadData.next.whenLabel;

      const sep = document.createElement("span");
      sep.className = "mmm-scrape-sep dimmed";
      sep.innerText = "  -  ";

      const labels = document.createElement("span");
      labels.className = "mmm-scrape-labels";
      labels.innerText = (this.payloadData.next.labels || []).join(", ");

      row.appendChild(when);
      row.appendChild(sep);
      row.appendChild(labels);

      wrapper.appendChild(row);
      return wrapper;
    }

    // Fallback line
    const line = document.createElement("div");
    line.className = "mmm-scrape-line";
    line.innerText = this.nextText || "Laden…";
    wrapper.appendChild(line);
    return wrapper;
  }
});
