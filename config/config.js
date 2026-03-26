/* MagicMirror² Config
 *
 * Docs:
 * - https://docs.magicmirror.builders/configuration/introduction.html
 * - https://docs.magicmirror.builders/modules/configuration.html
 *
 * MagicMirror kan modules wel tonen/verbergen tijdens runtime, maar config van een reeds geladen
 * module live wijzigen is niet generiek ondersteund (tenzij die module daar zelf notificaties
 * voor implementeert).
 *
 * De beste praktijk is:
 * - Definieer meerdere instanties van dezelfde module met verschillende config.
 * - Geef ze classes zoals:
 *   profile-managed profile-lionel
 *   profile-managed profile-bas
 *   profile-managed profile-guest
 *   en eventueel profile-common <--- staat altijd aan
 *
 * MMM-FaceStatus schakelt dan de juiste instanties in/uit op basis van herkende persoon.
 */

let config = {
  address: "0.0.0.0",
  port: 8080,
  basePath: "/",
  ipWhitelist: [],

  useHttps: false,
  httpsPrivateKey: "",
  httpsCertificate: "",

  language: "nl",
  locale: "nl-NL",

  logLevel: ["INFO", "LOG", "WARN", "ERROR"],
  timeFormat: 24,
  units: "metric",

  modules: [
    {
      module: "alert"
    },
    {
      module: "updatenotification",
      position: "top_bar"
    },

    ////////////////////////////////////////////////////////////////////////////////////////////////////
    //                      SYSTEM DINGEN
    ////////////////////////////////////////////////////////////////////////////////////////////////////

    ////////////////////////////////////////////////////////////////////////////////////////////////////
    //                      DEFAULT DINGEN
    ////////////////////////////////////////////////////////////////////////////////////////////////////

    // BEGIN KLOK
    {
      module: "MMM-AstroPanel",
      position: "top_center",
      classes: "profile-managed profile-common",
      config: {
        lat: 52.3676,
        lon: 4.9041,
        locale: "nl-NL",
        timezone: "Europe/Amsterdam",
        timeFormat: 24,
        showSeconds: true,
        updateInterval: 60 * 1000
      }
    },
    // EINDE KLOK

    // BEGIN WEER
    {
      module: "weather",
      position: "top_right",
      header: "Het weer",
      classes: "profile-managed profile-common",
      config: {
        weatherProvider: "openmeteo",
        type: "current",
        lat: 53.0517,
        lon: 6.9940
      }
    },
    {
      module: "weather",
      position: "top_right",
      classes: "profile-managed profile-common",
      // header: "Verwachting", // optioneel: zet aan als je een aparte titel wilt
      config: {
        weatherProvider: "openmeteo",
        type: "forecast",
        lat: 53.0517,
        lon: 6.9940,
        maxNumberOfDays: 4
      }
    },
    // EINDE WEER

    ////////////////////////////////////////////////////////////////////////////////////////////////////
    //                      PROFIEL LIONEL
    ////////////////////////////////////////////////////////////////////////////////////////////////////

    // BEGIN NIEUWS
    {
      module: "newsfeed",
      position: "bottom_bar",
      classes: "profile-managed profile-common",
      // header: "Nieuws",
      config: {
        feeds: [
          {
            title: "Nieuws van Nu.nl",
            url: "https://www.nu.nl/rss/goed-nieuws"
          }
        ],
        showSourceTitle: true,
        showPublishDate: true,
        broadcastNewsFeeds: true,
        broadcastNewsUpdates: true
      }
    },
    // EINDE NIEUWS

    // BEGIN REISTIJD
//    {
//      module: "MMM-RWSVerkeer",
//      position: "middle_center",
//      config: {
//        updateInterval: 120000,
//        maxItemsPerDestination: 5,
//        title: "Files richting",
//        destinations: [
//          { label: "Groningen", match: { roads: ["N366", "N33", "A7"], places: ["Alteveer [GN]", "Groningen"] } },
//          { label: "Den Helder", match: { roads: ["N366", "N33", "A7", "N99", "N250"], places: ["Den Helder"] } },
//          { label: "Heerhugowaard", match: { roads: ["N366", "N33", "A7", "N242"], places: ["Heerhugowaard"] } }
//        ]
//      }
 //   },
    // EINDE REISTIJD

    // BEGIN CALENDAR, lionel
    {
      module: "calendar",
      position: "top_left",
      header: "Agenda",
      classes: "profile-managed profile-common",
      config: {
        maximumEntries: 10,
        fetchInterval: 5 * 60 * 1000, // 5 minuten
        calendars: [
          {
            symbol: "calendar",
            url: "https://calendar.google.com/calendar/ical/redemption.is.yours%40gmail.com/private-5be5bdcfe9ba927721a6fcdac5d2618d/basic.ics"
          }
        ]
      }
    },
    // EINDE CALENDAR, lionel

    // BEGIN CALENDAR, familie
    {
      module: "calendar",
      position: "top_left",
      header: "Agenda Familie",
      classes: "profile-managed profile-common",
      config: {
        maximumEntries: 15,
        fetchInterval: 5 * 60 * 1000, // 5 minuten
        calendars: [
          {
            symbol: "calendar",
            url: "https://calendar.google.com/calendar/ical/krystelthepen%40hotmail.com/private-fe1a7f183d784c6e526e70ec708690cb/basic.ics"
          }
        ]
      }
    },
    // EINDE CALENDAR, familie

    // BEGIN ENERGIE
    {
      module: "MMM-HomeWizardP1Plus",
      position: "top_right",
      header: "Energie",
      classes: "profile-managed profile-common",
      config: {
        p1Host: "10.0.4.3",
        updateIntervalSeconds: 30,

        priceProvider: "easyenergy",
        priceUpdateMinutes: 30,

        // Indicatieve “all-in” correctie (pas naar wens aan)
        priceMultiplier: 1.21, // BTW (indicatief)
        priceAdderEurPerKwh: 0.10, // opslag/energiebelasting (indicatief)

        // fallback
        fixedPriceEurPerKwh: 0.30,

        showPrice: true,
        showPriceStatus: true,
        showExport: true,
        showHistoryDays: 3
      }
    },
    // EINDE ENERGIE

    // BEGIN AFVALWIJZER
    {
      module: "MMM-scrape",
      position: "top_center",
      header: "Afvalkalender",
      classes: "profile-managed profile-common",
      config: {
        pdfSource: "/home/magicmirror/MagicMirror/afval26.pdf",
        refreshInterval: 6 * 60 * 60 * 1000,
        showHeading: false,
        headingText: "Afvalinzameling (rest van deze maand)",
        maxThisMonth: 50,

        align: "left",

        renameLabels: {
          gft: "Groene bak",
          pmd: "Plastic zakken",
          restafval: "Grijze bak"
        }
      }
    },
    // EINDE AFVALWIJZER

    // BEGIN AANWEZIGHEID
    {
      module: "MMM-PresencePing",
      header: "Aanwezigheid",
      position: "top_right",
      config: {
        updateInterval: 30000,
        pingTimeoutMs: 1500,
        pingCount: 1,
        gracePeriodMs: 120000, // 2 min “wifi hiccup” tolerant
        persons: [
          { name: "Ome Lionel", label: "Ome Lionel", ips: ["10.0.3.4", "192.168.178.11"] },
          { name: "Milan", label: "Milan", ips: ["10.0.3.6"] },
          { name: "Jesmay", label: "Jesmay", ips: ["10.0.3.9"] },
          { name: "Rensley", label: "Rensley", ips: ["10.0.3.8"] },
          { name: "Mama", label: "Mama", ips: ["10.0.3.7"] },
          { name: "Oma", label: "Oma", ips: ["10.0.3.5"] }
        ]
      }
    }
    // EINDE AANWEZIGHEID
  ]
};

/*************** DO NOT EDIT THE LINE BELOW ***************/
if (typeof module !== "undefined") {
  module.exports = config;
}
