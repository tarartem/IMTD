// =========================================================================
// IMTD (Intelligent Meeting Takeover Daemon) - Cloud Scheduler
// =========================================================================

// ⚙️ CONFIGURATION
// 1. Paste your Unique APP_KEY (generated during MacBook installation) here:
var KV_APP_KEY = "mxv4dy10";

// 2. (Optional) Paste your Bark iPhone push key for iPhone critical alerts:
var BARK_KEY = "adj6sfggZvVnNfriv8xwhf";

// =========================================================================
// MAIN CHECKER — runs every minute via time trigger
// =========================================================================
function checkUpcomingMeetings() {
  var now = new Date();
  var searchStart = new Date(now.getTime() - 30 * 1000); // 30 seconds ago
  var searchEnd = new Date(now.getTime() + 180 * 1000);  // 3 minutes from now

  var calendar = CalendarApp.getDefaultCalendar();
  var events = calendar.getEvents(searchStart, searchEnd);
  var properties = PropertiesService.getScriptProperties();

  for (var i = 0; i < events.length; i++) {
    var event = events[i];
    if (event.isAllDayEvent()) continue;

    var triggerKey = event.getId() + "_" + event.getStartTime().getTime();
    var diffSeconds = (event.getStartTime().getTime() - now.getTime()) / 1000;

    // Check if this meeting starts in the T-1 minute window (20s to 100s from now)
    if (diffSeconds >= 20 && diffSeconds <= 100) {
      if (!properties.getProperty(triggerKey)) {
        var meetUrl = getEventMeetingUrl(event);
        if (meetUrl) {
          var title = event.getTitle();

          // 1. Ring iPhone via Bark (if configured)
          sendBarkAlert(title, meetUrl);

          // 2. Trigger MacBook screen takeover (via ntfy.sh relay)
          triggerMacTakeover(title, meetUrl, triggerKey);

          properties.setProperty(triggerKey, "triggered");
          Logger.log("✅ Alerted for: " + title);
        }
      }
    }
  }
}

// =========================================================================
// MAC TAKEOVER — POSTs a JSON payload to ntfy.sh pub/sub relay
// =========================================================================
function triggerMacTakeover(title, meetUrl, triggerKey) {
  if (!KV_APP_KEY || KV_APP_KEY === "PASTE_YOUR_KEY_HERE") {
    Logger.log("Skipping Mac takeover: KV_APP_KEY is not configured.");
    return;
  }

  try {
    // Shorten long URLs (e.g. MS Teams) to avoid ntfy message length limits
    var safeUrl = shortenUrl(meetUrl);

    var payload = JSON.stringify({
      id: triggerKey,
      title: title,
      url: safeUrl
    });

    var ntfyTopic = "imtd-" + KV_APP_KEY;
    var url = "https://ntfy.sh/" + ntfyTopic;

    var options = {
      method: "post",
      payload: payload,
      headers: { "Content-Type": "application/json" },
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(url, options);
    Logger.log("ntfy.sh trigger response: " + response.getResponseCode() + " " + response.getContentText());
  } catch(e) {
    Logger.log("Mac takeover write failed: " + e.toString());
  }
}

// =========================================================================
// URL SHORTENER — prevents ntfy/IIS path limits for long MS Teams URLs
// =========================================================================
function shortenUrl(longUrl) {
  try {
    var response = UrlFetchApp.fetch("https://tinyurl.com/api-create.php?url=" + encodeURIComponent(longUrl));
    return response.getContentText().trim();
  } catch(e) {
    return longUrl; // Fallback to original URL if shortening fails
  }
}

// =========================================================================
// IPHONE ALERT via Bark
// =========================================================================
function sendBarkAlert(title, meetUrl) {
  if (!BARK_KEY) return;

  try {
    var message = "🚨 Meeting in 1 min: " + title;
    var url = "https://api.day.app/" + BARK_KEY + "/" + encodeURIComponent(message) +
              "?sound=alarm&isArchive=1&url=" + encodeURIComponent(meetUrl) + "&level=critical";
    UrlFetchApp.fetch(url, { method: "get", muteHttpExceptions: true });
    Logger.log("📱 iPhone alerted: " + title);
  } catch(e) {
    Logger.log("Bark error: " + e.toString());
  }
}

// =========================================================================
// MEETING URL EXTRACTOR
// =========================================================================
function getEventMeetingUrl(event) {
  var description = event.getDescription() || "";
  var location = event.getLocation() || "";
  var text = location + "\n" + description;

  // Match Google Meet (with or without https://)
  var meetMatch = text.match(/(https?:\/\/)?meet\.google\.com\/[a-z0-9-]+/i);
  if (meetMatch) return meetMatch[0].startsWith("http") ? meetMatch[0] : "https://" + meetMatch[0];

  // Match Zoom (with or without https://)
  var zoomMatch = text.match(/(https?:\/\/)?([a-zA-Z0-9-]+\.zoom\.(us|com)\/(j|my|s)\/[a-zA-Z0-9-_?=&]+)/i);
  if (zoomMatch) return zoomMatch[0].startsWith("http") ? zoomMatch[0] : "https://" + zoomMatch[0];

  // Match MS Teams
  var teamsMatch = text.match(/https?:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s<>"']+/i);
  if (teamsMatch) return teamsMatch[0];

  // Fallback: try native Google Calendar hangoutLink metadata
  try {
    if (typeof Calendar !== 'undefined') {
      var cleanId = event.getId().split("@")[0];
      var fullEvent = null;
      try { fullEvent = Calendar.Events.get('primary', cleanId); } catch(e) {}
      if (!fullEvent) {
        try {
          var list = Calendar.Events.list('primary', { iCalUID: event.getId() });
          if (list && list.items && list.items.length > 0) fullEvent = list.items[0];
        } catch(e) {}
      }
      if (fullEvent && fullEvent.hangoutLink) return fullEvent.hangoutLink;
    }
  } catch(e) {}

  return null;
}

// =========================================================================
// DIAGNOSTICS — run manually to check today's events and extracted URLs
// =========================================================================
function debugCalendarQuery() {
  var now = new Date();
  var calendar = CalendarApp.getDefaultCalendar();
  var startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  var endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  var events = calendar.getEvents(startOfDay, endOfDay);

  Logger.log("Server time: " + now);
  Logger.log("Events today: " + events.length);

  for (var i = 0; i < events.length; i++) {
    var event = events[i];
    var diffMins = (event.getStartTime().getTime() - now.getTime()) / 60000;
    var url = getEventMeetingUrl(event);
    Logger.log("👉 " + event.getTitle() + " | In " + diffMins.toFixed(1) + " mins | " + (url ? url : "❌ NO LINK"));
  }
}
