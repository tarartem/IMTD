// =========================================================================
// IMTD (Intelligent Meeting Takeover Daemon) - Cloud Scheduler
// =========================================================================

// ⚙️ CONFIGURATION
// 1. Paste your Unique APP_KEY (generated during MacBook installation) here:
var KV_APP_KEY = "PASTE_YOUR_KEY_HERE"; 

// 2. (Optional) Paste your Bark iPhone push key if you want iPhone alerts:
var BARK_KEY = ""; 

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
          
          // 2. Trigger MacBook screen takeover (via cloud KV store)
          triggerMacTakeover(title, meetUrl, triggerKey);
          
          properties.setProperty(triggerKey, "triggered");
          Logger.log("✅ Alerted for: " + title);
        }
      }
    }
  }
}

// =========================================================================
// MAC TAKEOVER — Writes a base64-websafe payload to cloud registry
// =========================================================================
function triggerMacTakeover(title, meetUrl, triggerKey) {
  if (!KV_APP_KEY || KV_APP_KEY === "PASTE_YOUR_KEY_HERE") {
    Logger.log("Skipping Mac takeover: KV_APP_KEY is not configured.");
    return;
  }
  
  try {
    var payload = JSON.stringify({
      id: triggerKey,
      title: title,
      url: meetUrl
    });
    
    // Web-Safe Base64 to bypass routing limitations
    var base64Payload = Utilities.base64EncodeWebSafe(payload);
    var url = "https://keyvalue.immanuel.co/api/KeyVal/UpdateValue/" + KV_APP_KEY + "/trigger/" + base64Payload;
    
    // 💡 payload: "" is crucial to force Google to send Content-Length: 0
    var options = {
      method: "post",
      payload: "",
      muteHttpExceptions: true
    };
    
    var response = UrlFetchApp.fetch(url, options);
    Logger.log("Cloud KV trigger update response: " + response.getContentText());
  } catch(e) {
    Logger.log("Mac takeover write failed: " + e.toString());
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

  var meetMatch = text.match(/https?:\/\/meet\.google\.com\/[a-z0-9-]+/i);
  if (meetMatch) return meetMatch[0];

  var zoomMatch = text.match(/https?:\/\/[a-zA-Z0-9-]+\.zoom\.(us|com)\/(j|my|s)\/[a-zA-Z0-9-_?=&]+/i);
  if (zoomMatch) return zoomMatch[0];

  var teamsMatch = text.match(/https?:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s]+/i);
  if (teamsMatch) return teamsMatch[0];

  return null;
}
