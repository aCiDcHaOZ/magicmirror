/* global Module */

Module.register("MMM-PresencePing", {
  defaults: {
    updateInterval: 30 * 1000,        // 30s
    pingTimeoutMs: 1500,              // per ping
    pingCount: 1,                     // per check
    gracePeriodMs: 2 * 60 * 1000,     // “kort weggevallen” nog als thuis tellen (optioneel)
    showLastSeenWhenHome: false,
    dateLocale: "nl-NL",
    timeFormatOptions: { hour: "2-digit", minute: "2-digit" },
    persons: [
      // voorbeeld:
      // { name: "Lionel", ips: ["192.168.1.10", "192.168.1.11"], label: "Lionel" }
    ]
  },

  start() {
    this.presence = {}; // per persoon: { isHome, lastSeenTs, lastSeenStr, lastCheckTs }
    this.loaded = false;

    this.sendSocketNotification("MMM_PRESENCEPING_INIT", {
      config: this.config
    });
  },

  getStyles() {
    return ["MMM-PresencePing.css"];
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "MMM_PRESENCEPING_STATE") {
      this.presence = payload.presence || {};
      this.loaded = true;
      this.updateDom();
    }

    if (notification === "MMM_PRESENCEPING_ERROR") {
      this.loaded = true;
      this.error = payload?.error || "Unknown error";
      this.updateDom();
    }
  },

  formatLastSeen(ts) {
    if (!ts) return "—";
    const d = new Date(ts);
    const date = d.toLocaleDateString(this.config.dateLocale);
    const time = d.toLocaleTimeString(this.config.dateLocale, this.config.timeFormatOptions);
    return `${date} ${time}`;
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "presenceping";

    if (!this.loaded) {
      wrapper.innerHTML = "Presence: laden…";
      return wrapper;
    }

    if (this.error) {
      wrapper.innerHTML = `Presence fout: ${this.error}`;
      return wrapper;
    }

    const table = document.createElement("table");
    table.className = "presenceping-table";

    const persons = this.config.persons || [];
    persons.forEach((p) => {
      const row = document.createElement("tr");
      row.className = "presenceping-row";

      const nameCell = document.createElement("td");
      nameCell.className = "presenceping-name";
      nameCell.textContent = p.label || p.name;

      const stateCell = document.createElement("td");
      const infoCell = document.createElement("td");

      const st = this.presence[p.name] || {};
      const isHome = !!st.isHome;

      stateCell.className = "presenceping-state " + (isHome ? "home" : "away");
      stateCell.textContent = isHome ? "Thuis" : "Niet thuis";

      infoCell.className = "presenceping-info";

      if (!isHome) {
        infoCell.textContent = `Laatst gezien: ${this.formatLastSeen(st.lastSeenTs)}`;
      } else if (this.config.showLastSeenWhenHome) {
        infoCell.textContent = `Laatst gezien: ${this.formatLastSeen(st.lastSeenTs)}`;
      } else {
        infoCell.textContent = "";
      }

      row.appendChild(nameCell);
      row.appendChild(stateCell);
      row.appendChild(infoCell);
      table.appendChild(row);
    });

    wrapper.appendChild(table);
    return wrapper;
  }
});
