const NodeHelper = require("node_helper");
const SunCalc = require("suncalc");

function pad2(n) { return String(n).padStart(2, "0"); }

function formatHHMM(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return "--:--";
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

module.exports = NodeHelper.create({
  start() {
    this.lat = null;
    this.lon = null;
    this.timezone = "Europe/Amsterdam";
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "ASTRO_CONFIG") {
      const lat = Number(payload.lat);
      const lon = Number(payload.lon);

      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        this.lat = lat;
        this.lon = lon;
      } else {
        // Lat/lon zijn verplicht; module toont dan placeholders.
        this.lat = null;
        this.lon = null;
      }

      if (payload.timezone) this.timezone = payload.timezone;

      this.sendData();
    }

    if (notification === "ASTRO_REQUEST") {
      this.sendData();
    }
  },

  sendData() {
    if (!Number.isFinite(this.lat) || !Number.isFinite(this.lon)) {
      this.sendSocketNotification("ASTRO_DATA", {
        sun: null,
        moon: null,
      });
      return;
    }

    const now = new Date();

    // Zon tijden
    const times = SunCalc.getTimes(now, this.lat, this.lon);
    // sunrise, solarNoon, sunset zitten in times

    const sun = {
      sunrise: formatHHMM(times.sunrise),
      solarNoon: formatHHMM(times.solarNoon),
      sunset: formatHHMM(times.sunset),
    };

    // Maanstand
    const moonIllum = SunCalc.getMoonIllumination(now);
    const moon = {
      phase: moonIllum.phase,            // 0..1
      illumination: moonIllum.fraction,  // 0..1
    };

    this.sendSocketNotification("ASTRO_DATA", { sun, moon });
  }
});

