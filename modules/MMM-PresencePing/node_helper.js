const NodeHelper = require("node_helper");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

function nowTs() {
  return Date.now();
}

module.exports = NodeHelper.create({
  start() {
    this.config = null;
    this.timer = null;

    // persistent storage (in module map)
    this.stateFile = path.join(__dirname, "presence_state.json");
    this.persisted = this.loadStateFile(); // { [personName]: { lastSeenTs } }
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "MMM_PRESENCEPING_INIT") {
      this.config = payload.config;
      this.validateConfig(this.config);

      // init presence object
      this.presence = {};
      for (const p of (this.config.persons || [])) {
        const lastSeenTs = this.persisted?.[p.name]?.lastSeenTs || 0;
        this.presence[p.name] = {
          isHome: false,
          lastSeenTs,
          lastCheckTs: 0
        };
      }

      this.runCycle(); // meteen
      this.startTimer();
    }
  },

  validateConfig(cfg) {
    if (!cfg || !Array.isArray(cfg.persons) || cfg.persons.length === 0) {
      throw new Error("Config persons[] ontbreekt of is leeg.");
    }
    for (const p of cfg.persons) {
      if (!p.name || !Array.isArray(p.ips) || p.ips.length === 0) {
        throw new Error("Elke persoon moet { name, ips:[...] } hebben.");
      }
    }
  },

  startTimer() {
    const iv = this.config.updateInterval || 30000;
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.runCycle(), iv);
  },

  runCycle() {
    const persons = this.config.persons || [];
    const pingTimeoutMs = this.config.pingTimeoutMs ?? 1500;
    const pingCount = this.config.pingCount ?? 1;
    const gracePeriodMs = this.config.gracePeriodMs ?? 0;

    const tasks = persons.map((p) => this.checkPerson(p, pingCount, pingTimeoutMs));

    Promise.all(tasks)
      .then((results) => {
        const ts = nowTs();

        for (const r of results) {
          const prev = this.presence[r.name] || { lastSeenTs: 0, isHome: false };

          // “home” als er minimaal 1 IP reageert
          let isHome = r.anyUp;

          // grace period: als net “down”, maar recent gezien, nog thuis tonen
          if (!isHome && gracePeriodMs > 0 && prev.lastSeenTs && (ts - prev.lastSeenTs) <= gracePeriodMs) {
            isHome = true;
          }

          let lastSeenTs = prev.lastSeenTs;

          // update lastSeen als echt up
          if (r.anyUp) lastSeenTs = ts;

          this.presence[r.name] = {
            isHome,
            lastSeenTs,
            lastCheckTs: ts
          };
        }

        // persist lastSeenTs
        this.saveStateFile(this.presence);

        this.sendSocketNotification("MMM_PRESENCEPING_STATE", {
          presence: this.presence
        });
      })
      .catch((err) => {
        this.sendSocketNotification("MMM_PRESENCEPING_ERROR", {
          error: String(err?.message || err)
        });
      });
  },

  checkPerson(person, count, timeoutMs) {
    // ping alle IPs van die persoon, anyUp = OR
    const ips = person.ips || [];
    const checks = ips.map((ip) => this.pingOnce(ip, count, timeoutMs));

    return Promise.allSettled(checks).then((settled) => {
      const anyUp = settled.some((s) => s.status === "fulfilled" && s.value === true);
      return { name: person.name, anyUp };
    });
  },

  pingOnce(ip, count, timeoutMs) {
    // Linux ping:
    // -c <count>  number of packets
    // -W <sec>    per-packet timeout in seconds (integer)
    // -n          numeric output
    // We mappen ms -> sec (ceil, min 1)
    const timeoutSec = Math.max(1, Math.ceil(timeoutMs / 1000));

    return new Promise((resolve) => {
      execFile("ping", ["-n", "-c", String(count), "-W", String(timeoutSec), ip], (error) => {
        // exit code 0 => reachable
        resolve(!error);
      });
    });
  },

  loadStateFile() {
    try {
      if (!fs.existsSync(this.stateFile)) return {};
      const raw = fs.readFileSync(this.stateFile, "utf8");
      return JSON.parse(raw);
    } catch (e) {
      // corrupt? start fresh
      return {};
    }
  },

  saveStateFile(presence) {
    try {
      const out = {};
      for (const [name, st] of Object.entries(presence || {})) {
        out[name] = { lastSeenTs: st.lastSeenTs || 0 };
      }
      fs.writeFileSync(this.stateFile, JSON.stringify(out, null, 2), "utf8");
    } catch (e) {
      // silently ignore, but you could log if you want
    }
  }
});
