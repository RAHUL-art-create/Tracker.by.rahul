// Service Worker for Personal Tracker PWA
// Provides safe Network-First offline caching and Smart Native Notifications

const CACHE_NAME = "personal-tracker-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.29/jspdf.plugin.autotable.min.js",
  "https://cdn.jsdelivr.net/npm/localforage@1.10.0/dist/localforage.min.js"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        APP_SHELL.map((url) => cache.add(url).catch(() => null))
      );
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        )
      )
    ])
  );
});

// Network-First strategy for HTML/app files, strict bypass for /api/sync
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never cache or intercept Cloud Sync API calls
  if (url.pathname.includes("/api/sync")) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((networkResp) => {
        if (networkResp && networkResp.ok && (url.origin === self.location.origin || url.hostname.includes("cdnjs.cloudflare.com") || url.hostname.includes("cdn.jsdelivr.net"))) {
          const respClone = networkResp.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, respClone).catch(() => {});
          });
        }
        return networkResp;
      })
      .catch(() => {
        return caches.match(req).then((cached) => {
          if (cached) return cached;
          if (req.mode === "navigate") {
            return caches.match("./index.html") || caches.match("./");
          }
          return new Response("Offline", { status: 503 });
        });
      })
  );
});

// Helper: Read & Write localForage's IndexedDB ("PersonalTracker" -> "tracker_data") from Service Worker
function openTrackerDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("PersonalTracker");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  try {
    const db = await openTrackerDB();
    if (!db.objectStoreNames.contains("tracker_data")) {
      db.close();
      return null;
    }
    return await new Promise((resolve) => {
      const tx = db.transaction("tracker_data", "readonly");
      const store = tx.objectStore("tracker_data");
      const getReq = store.get(key);
      getReq.onsuccess = () => {
        db.close();
        resolve(getReq.result);
      };
      getReq.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  } catch (e) {
    return null;
  }
}

async function idbSet(key, val) {
  try {
    const db = await openTrackerDB();
    if (!db.objectStoreNames.contains("tracker_data")) {
      db.close();
      return;
    }
    await new Promise((resolve) => {
      const tx = db.transaction("tracker_data", "readwrite");
      const store = tx.objectStore("tracker_data");
      store.put(val, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch (e) {}
}

function formatDateYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Compute monthly milk summary (respects 1~MB and 2~MB)
function computeMonthMilkSummary(milkData, milkBillType, year, monthIndex) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const monthName = new Date(year, monthIndex, 1).toLocaleString("default", { month: "long" });
  let days1 = 0, nil1 = 0, qty1 = 0, cost1 = 0;
  let days2 = 0, nil2 = 0, qty2 = 0, cost2 = 0;
  let anyLogged = false;

  for (let day = 1; day <= lastDay; day++) {
    const dateStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const entry = milkData && milkData[dateStr];
    if (!entry) continue;
    anyLogged = true;

    if (milkBillType === "1~MB") {
      const q = Number(entry.quantity) || 0;
      const c = Number(entry.cost) || 0;
      if (q > 0) {
        days1++;
        qty1 += q;
        cost1 += c;
      } else {
        nil1++;
      }
    } else {
      const q1 = Number(entry.quantity1) || 0;
      const c1 = Number(entry.cost1) || 0;
      const q2 = Number(entry.quantity2) || 0;
      const c2 = Number(entry.cost2) || 0;
      if (q1 > 0) {
        days1++;
        qty1 += q1;
        cost1 += c1;
      } else {
        nil1++;
      }
      if (q2 > 0) {
        days2++;
        qty2 += q2;
        cost2 += c2;
      } else {
        nil2++;
      }
    }
  }

  return {
    monthName,
    year,
    monthIndex,
    lastDay,
    anyLogged,
    milkBillType: milkBillType || "1~MB",
    days1,
    nil1,
    qty1,
    cost1,
    days2,
    nil2,
    qty2,
    cost2,
    totalCost: cost1 + cost2,
    totalQty: qty1 + qty2
  };
}

// Background evaluation for Periodic Sync wakeups
async function evaluateBackgroundNotifications() {
  if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
    return;
  }

  const enabled = await idbGet("notificationsEnabled");
  if (enabled === false) return;

  const selectedCategories = (await idbGet("selectedCategories")) || ["events", "salary", "milk"];
  const milkData = (await idbGet("milkData")) || {};
  const milkBillType = (await idbGet("milkBillType")) || "1~MB";
  const events = (await idbGet("events")) || [];
  const salaryData = (await idbGet("salaryData")) || {};
  const notifLog = (await idbGet("notificationLog")) || {};

  const now = new Date();
  const todayStr = formatDateYMD(now);
  const hour = now.getHours();
  let logUpdated = false;

  // 1. 5:00 PM Daily Milk Unmarked Reminder
  if (selectedCategories.includes("milk") && hour >= 17) {
    const logKey = `milk_5pm_${todayStr}`;
    const todayEntry = milkData[todayStr];
    const isUnmarked = !todayEntry;
    if (isUnmarked && !notifLog[logKey]) {
      const billLabel = milkBillType === "2~MB" ? "1st & 2nd milk bills" : "milk bill";
      await self.registration.showNotification("Milk Bill Reminder (5:00 PM)", {
        body: `It's past 5:00 PM and today's ${billLabel} (${now.toLocaleDateString()}) isn't marked yet. Tap to log now.`,
        icon: "icon.svg",
        badge: "icon.svg",
        tag: logKey,
        renotify: true,
        data: { action: "mark-milk", date: todayStr }
      });
      notifLog[logKey] = Date.now();
      logUpdated = true;
    }
  }

  // 2. Month-End Milk Bill Summary (Last day of month >= 18:00 OR 1st-3rd of new month for previous month)
  if (selectedCategories.includes("milk")) {
    const year = now.getFullYear();
    const month = now.getMonth();
    const lastDayOfCurrent = new Date(year, month + 1, 0).getDate();
    const isLastDayEvening = now.getDate() === lastDayOfCurrent && (hour >= 18 || Boolean(milkData[todayStr]));
    const isEarlyNewMonth = now.getDate() <= 3;

    let targetYear = null;
    let targetMonth = null;
    if (isLastDayEvening) {
      targetYear = year;
      targetMonth = month;
    } else if (isEarlyNewMonth) {
      const prevDate = new Date(year, month - 1, 1);
      targetYear = prevDate.getFullYear();
      targetMonth = prevDate.getMonth();
    }

    if (targetYear !== null && targetMonth !== null) {
      const ymKey = `milk_monthend_${targetYear}-${String(targetMonth + 1).padStart(2, "0")}`;
      if (!notifLog[ymKey]) {
        const summary = computeMonthMilkSummary(milkData, milkBillType, targetYear, targetMonth);
        if (summary.anyLogged) {
          let title = `${summary.monthName} Milk Bill Total`;
          let body = "";
          if (summary.milkBillType === "1~MB") {
            body = `1st Milk Bill: ${summary.days1} days (${summary.qty1.toFixed(1)}L)${summary.nil1 ? ` | ${summary.nil1} Nil` : ""} - Total: Rs.${summary.cost1.toFixed(2)}`;
          } else {
            title = `${summary.monthName} Milk Bills (1~MB & 2~MB)`;
            body = `1st Bill: ${summary.qty1.toFixed(1)}L (Rs.${summary.cost1.toFixed(0)}) | 2nd Bill: ${summary.qty2.toFixed(1)}L (Rs.${summary.cost2.toFixed(0)}) - Grand Total: Rs.${summary.totalCost.toFixed(2)}`;
          }
          await self.registration.showNotification(title, {
            body,
            icon: "icon.svg",
            badge: "icon.svg",
            tag: ymKey,
            data: { action: "milk-summary", year: targetYear, month: targetMonth }
          });
          notifLog[ymKey] = Date.now();
          logUpdated = true;
        }
      }
    }
  }

  // 3. Birthday & Anniversary Notifications (Today & Tomorrow)
  if (selectedCategories.includes("events") && Array.isArray(events)) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = formatDateYMD(tomorrow);

    for (const ev of events) {
      if (!ev || !ev.date || !ev.name) continue;
      const evDate = new Date(ev.date);
      const isToday = evDate.getDate() === now.getDate() && evDate.getMonth() === now.getMonth() && !ev.celebrated;
      const isTomorrow = evDate.getDate() === tomorrow.getDate() && evDate.getMonth() === tomorrow.getMonth();

      if (isToday && hour >= 8) {
        const key = `event_today_${todayStr}_${ev.name}`;
        if (!notifLog[key]) {
          await self.registration.showNotification(`Today: ${ev.name}'s ${ev.type}`, {
            body: `Don't forget to wish ${ev.name} on their ${ev.type} today.`,
            icon: "icon.svg",
            badge: "icon.svg",
            tag: key,
            data: { action: "events" }
          });
          notifLog[key] = Date.now();
          logUpdated = true;
        }
      } else if (isTomorrow && hour >= 17) {
        const key = `event_tomorrow_${tomorrowStr}_${ev.name}`;
        if (!notifLog[key]) {
          await self.registration.showNotification(`Tomorrow: ${ev.name}'s ${ev.type}`, {
            body: `Reminder: ${ev.name}'s ${ev.type} is tomorrow.`,
            icon: "icon.svg",
            badge: "icon.svg",
            tag: key,
            data: { action: "events" }
          });
          notifLog[key] = Date.now();
          logUpdated = true;
        }
      }
    }
  }

  if (logUpdated) {
    await idbSet("notificationLog", notifLog);
  }
}

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "tracker-smart-reminders") {
    event.waitUntil(evaluateBackgroundNotifications());
  }
});

self.addEventListener("message", (event) => {
  const payload = event.data;
  if (!payload || typeof payload !== "object") return;

  if (payload.type === "SHOW_NOTIFICATION") {
    const { title, options } = payload;
    if (title) {
      event.waitUntil(
        self.registration.showNotification(title, Object.assign({
          icon: "icon.svg",
          badge: "icon.svg"
        }, options || {}))
      );
    }
  } else if (payload.type === "EVALUATE_NOTIFICATIONS") {
    event.waitUntil(evaluateBackgroundNotifications());
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = data.action || "open";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          client.postMessage({
            type: "NOTIFICATION_CLICK",
            action: action,
            data: data
          });
          return;
        }
      }
      if (self.clients.openWindow) {
        const query = action ? `?action=${encodeURIComponent(action)}${data.date ? `&date=${encodeURIComponent(data.date)}` : ""}${data.year !== undefined ? `&year=${data.year}&month=${data.month}` : ""}` : "";
        return self.clients.openWindow(`./${query}`);
      }
    })
  );
});
