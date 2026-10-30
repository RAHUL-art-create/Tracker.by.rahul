// Personal Tracker MCP server (Model Context Protocol over Streamable HTTP, stateless JSON).
// Access model: a per-user secret link (/mcp/<secret>). No login or token exchange, so it works
// by pasting one URL into Claude, ChatGPT, Gemini CLI or any MCP client. The link can be
// replaced from the app's Settings, which instantly disables the old one.

const SERVER_INFO = { name: "personal-tracker", version: "1.0.0" };
const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const DEFAULT_TIMEZONE = "Asia/Kolkata";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const EVENT_TYPES = ["Birthday", "Wedding Anniversary"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id"
};

class ToolError extends Error {}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS, ...extra } });
}

// ---------------------------------------------------------------- secret links

async function ensureLinkTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS mcp_links (secret TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL)"
  ).run();
}

function newSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// POST /api/mcp-link  { userId, userName, pin, regenerate }
export async function handleMcpLink(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  if (!env || !env.DB) return json({ success: false, error: "Database binding 'DB' is not configured." }, 503);

  const body = await request.json().catch(() => null);
  if (!body) return json({ success: false, error: "Invalid JSON payload." }, 400);
  const userId = String(body.userId || "").trim();
  const userName = String(body.userName || "").trim();
  const pin = String(body.pin || "").trim();
  if (!/^\d{4}$/.test(pin)) return json({ success: false, error: "A 4-digit PIN is required." }, 400);

  let record = null;
  if (userId) {
    record = await env.DB.prepare("SELECT user_id, pin FROM user_backups WHERE user_id = ?").bind(userId).first();
  }
  if (!record && userName) {
    record = await env.DB.prepare("SELECT user_id, pin FROM user_backups WHERE LOWER(TRIM(user_name)) = LOWER(TRIM(?)) AND pin = ?").bind(userName, pin).first();
  }
  if (!record) return json({ success: false, error: "No cloud backup found yet. Turn on cloud backup first." }, 404);
  if (record.pin !== pin) return json({ success: false, error: "PIN does not match this backup." }, 401);

  await ensureLinkTable(env);
  let secret = null;
  if (!body.regenerate) {
    const existing = await env.DB.prepare("SELECT secret FROM mcp_links WHERE user_id = ?").bind(record.user_id).first();
    if (existing) secret = existing.secret;
  }
  if (!secret) {
    secret = newSecret();
    await env.DB.prepare(
      "INSERT INTO mcp_links (secret, user_id, created_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET secret = excluded.secret, created_at = excluded.created_at"
    ).bind(secret, record.user_id, Date.now()).run();
  }

  const origin = new URL(request.url).origin;
  return json({ success: true, url: `${origin}/mcp/${secret}`, regenerated: Boolean(body.regenerate) });
}

async function resolveUser(env, secret) {
  if (!secret || secret.length < 30) return null;
  await ensureLinkTable(env);
  return env.DB.prepare("SELECT user_id FROM mcp_links WHERE secret = ?").bind(secret).first();
}

// ---------------------------------------------------------------- data access

async function loadData(env, userId) {
  const row = await env.DB.prepare("SELECT id, data, last_modified FROM user_backups WHERE user_id = ?").bind(userId).first();
  if (!row) throw new ToolError("Backup not found for this link. Create a new AI link from the app's Settings.");
  let data;
  try { data = JSON.parse(row.data); } catch (e) { throw new ToolError("Stored tracker data is unreadable."); }
  data.events = Array.isArray(data.events) ? data.events : [];
  data.salaryData = data.salaryData && typeof data.salaryData === "object" ? data.salaryData : {};
  data.milkData = data.milkData && typeof data.milkData === "object" ? data.milkData : {};
  data.milkQuantities = Array.isArray(data.milkQuantities) ? data.milkQuantities : [];
  data.milkQuantities2 = Array.isArray(data.milkQuantities2) ? data.milkQuantities2 : [];
  data.milkBillType = data.milkBillType === "2~MB" ? "2~MB" : "1~MB";
  return { row, data };
}

// Read-modify-write with an optimistic check on last_modified so a concurrent save
// from the app is never silently overwritten; retries on a fresh copy.
async function mutate(env, userId, fn) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { row, data } = await loadData(env, userId);
    const result = fn(data);
    const next = Math.max(Date.now(), Number(row.last_modified) + 1);
    const res = await env.DB.prepare(
      "UPDATE user_backups SET data = ?, last_modified = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND last_modified = ?"
    ).bind(JSON.stringify(data), next, row.id, row.last_modified).run();
    if (res && res.meta && res.meta.changes > 0) return result;
  }
  throw new ToolError("The tracker was busy saving another change. Please try again.");
}

async function read(env, userId, fn) {
  const { data } = await loadData(env, userId);
  return fn(data);
}

// ---------------------------------------------------------------- date helpers

function todayStr(tz = DEFAULT_TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function shiftDate(ymd, days) {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function parseDate(input, field = "date") {
  const raw = String(input == null ? "today" : input).trim().toLowerCase();
  if (raw === "" || raw === "today") return todayStr();
  if (raw === "yesterday") return shiftDate(todayStr(), -1);
  if (raw === "tomorrow") return shiftDate(todayStr(), 1);
  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) {
    const dmY = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
    if (dmY) m = [null, dmY[3], dmY[2], dmY[1]];
  }
  if (!m) throw new ToolError(`Invalid ${field} "${input}". Use YYYY-MM-DD, or today / yesterday / tomorrow.`);
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    throw new ToolError(`Invalid ${field} "${input}".`);
  }
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseMonth(input) {
  const raw = String(input == null ? "" : input).trim();
  if (!raw || raw.toLowerCase() === "this month" || raw.toLowerCase() === "current") return todayStr().slice(0, 7);
  if (raw.toLowerCase() === "last month" || raw.toLowerCase() === "previous") return shiftMonth(todayStr().slice(0, 7), -1);
  let m = raw.match(/^(\d{4})-(\d{1,2})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${m[1]}-${String(+m[2]).padStart(2, "0")}`;
  const idx = MONTHS.findIndex((n) => n.toLowerCase().startsWith(raw.toLowerCase().slice(0, 3)) && raw.length >= 3);
  if (idx >= 0) {
    const yearMatch = raw.match(/(\d{4})/);
    const now = todayStr();
    let year = yearMatch ? +yearMatch[1] : +now.slice(0, 4);
    if (!yearMatch && idx + 1 > +now.slice(5, 7)) year -= 1;
    return `${year}-${String(idx + 1).padStart(2, "0")}`;
  }
  throw new ToolError(`Invalid month "${input}". Use YYYY-MM (e.g. 2026-10) or a month name.`);
}

function shiftMonth(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function monthName(ym) { return MONTHS[Number(ym.slice(5, 7)) - 1]; }
function daysInMonth(ym) { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
function niceDate(ymd) { const [y, m, d] = ymd.split("-").map(Number); return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`; }
function rupees(n) { return "₹" + (Math.round(Number(n || 0) * 100) / 100).toLocaleString("en-IN"); }
function liters(n) { return `${Math.round(Number(n || 0) * 100) / 100} L`; }

// ---------------------------------------------------------------- milk logic

function priceList(data, bill) { return bill === 2 ? data.milkQuantities2 : data.milkQuantities; }

function lookupCost(data, bill, quantity) {
  const q = Number(quantity);
  if (!Number.isFinite(q) || q < 0) throw new ToolError("Quantity must be a number of liters (0 means nil).");
  if (q === 0) return 0;
  const item = priceList(data, bill).find((i) => Number(i.quantity) === q);
  if (!item) {
    const allowed = priceList(data, bill).filter((i) => Number(i.quantity) > 0).map((i) => `${i.quantity} L (${rupees(i.price)})`).join(", ");
    throw new ToolError(`No price is set for ${q} L on Bill ${bill}. Available: ${allowed || "none"}. Use set_milk_price to add it.`);
  }
  return Number(item.price) || 0;
}

function buildMilkEntry(data, existing, quantity, quantity2) {
  if (data.milkBillType === "1~MB") {
    const q = Number(quantity);
    return { quantity: q, cost: lookupCost(data, 1, q) };
  }
  const q1 = Number(quantity);
  const q2 = quantity2 === undefined || quantity2 === null ? Number((existing && existing.quantity2) || 0) : Number(quantity2);
  return { quantity1: q1, cost1: lookupCost(data, 1, q1), quantity2: q2, cost2: lookupCost(data, 2, q2) };
}

function describeEntry(data, e) {
  if (!e) return "not marked";
  if (data.milkBillType === "1~MB") return Number(e.quantity) > 0 ? `${liters(e.quantity)} (${rupees(e.cost)})` : "nil";
  const b1 = Number(e.quantity1) > 0 ? `${liters(e.quantity1)} (${rupees(e.cost1)})` : "nil";
  const b2 = Number(e.quantity2) > 0 ? `${liters(e.quantity2)} (${rupees(e.cost2)})` : "nil";
  return `Bill 1: ${b1}, Bill 2: ${b2}`;
}

function milkSummary(data, from, to) {
  const bills = data.milkBillType === "2~MB" ? [1, 2] : [1];
  const today = todayStr();
  const out = bills.map((bill) => ({ bill, taken: 0, nil: 0, qty: 0, cost: 0, breakdown: {} }));
  let unmarked = 0, totalDays = 0;
  for (let d = from; d <= to; d = shiftDate(d, 1)) {
    totalDays++;
    const e = data.milkData[d];
    if (!e) { if (d <= today) unmarked++; continue; }
    for (const s of out) {
      const q = data.milkBillType === "1~MB" ? Number(e.quantity) || 0 : Number(e[`quantity${s.bill}`]) || 0;
      const c = data.milkBillType === "1~MB" ? Number(e.cost) || 0 : Number(e[`cost${s.bill}`]) || 0;
      if (q > 0) {
        s.taken++; s.qty += q; s.cost += c;
        const k = `${q}|${c}`;
        s.breakdown[k] = s.breakdown[k] || { q, c, n: 0 };
        s.breakdown[k].n++;
      } else s.nil++;
    }
  }
  return { bills: out, unmarked, totalDays, grand: out.reduce((a, s) => a + s.cost, 0) };
}

function formatMilkSummary(data, from, to) {
  const s = milkSummary(data, from, to);
  const lines = [`Milk bill ${niceDate(from)} to ${niceDate(to)} (${data.milkBillType}):`];
  for (const b of s.bills) {
    lines.push(`Bill ${b.bill}: milk on ${b.taken} day(s), ${b.nil} nil, total ${liters(b.qty)} = ${rupees(b.cost)}`);
    for (const x of Object.values(b.breakdown)) lines.push(`  ${x.n} day(s) x ${liters(x.q)} @ ${rupees(x.c)} = ${rupees(x.n * x.c)}`);
  }
  if (s.bills.length > 1) lines.push(`Grand total: ${rupees(s.grand)}`);
  if (s.unmarked) lines.push(`Unmarked days so far: ${s.unmarked}`);
  return lines.join("\n");
}

function monthRange(ym) { return [`${ym}-01`, `${ym}-${String(daysInMonth(ym)).padStart(2, "0")}`]; }

function unmarkedDays(data, ym) {
  const [from, to] = monthRange(ym);
  const today = todayStr();
  const days = [];
  for (let d = from; d <= to && d <= today; d = shiftDate(d, 1)) if (!data.milkData[d]) days.push(Number(d.slice(8)));
  return days;
}

// ---------------------------------------------------------------- salary logic

function salaryAmount(v) { return typeof v === "object" && v ? Number(v.amount) || 0 : Number(v) || 0; }
function findKeyCI(obj, name) { const n = String(name).trim().toLowerCase(); return Object.keys(obj || {}).find((k) => k.trim().toLowerCase() === n); }

function salaryMonthReport(data, ym) {
  const name = monthName(ym);
  const students = data.salaryData[name] || {};
  const entries = Object.entries(students).map(([s, v]) => ({ student: s, amount: salaryAmount(v), date: typeof v === "object" && v ? v.date || "" : "" }));
  const total = entries.reduce((a, e) => a + e.amount, 0);
  const prev = data.salaryData[monthName(shiftMonth(ym, -1))] || {};
  const paidSet = new Set(Object.keys(students).map((s) => s.trim().toLowerCase()));
  const pending = Object.keys(prev).filter((s) => !paidSet.has(s.trim().toLowerCase()));
  return { name, entries, total, pending };
}

// ---------------------------------------------------------------- events logic

function nextOccurrence(dateStr, fromYmd) {
  const [, m, d] = dateStr.split("-").map(Number);
  const y = Number(fromYmd.slice(0, 4));
  let cand = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (cand < fromYmd) cand = `${y + 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return cand;
}

function daysBetween(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000); }

function findEvents(data, name, date) {
  const n = String(name || "").trim().toLowerCase();
  let list = data.events.map((e, i) => ({ e, i })).filter(({ e }) => String(e.name || "").trim().toLowerCase() === n);
  if (!list.length) list = data.events.map((e, i) => ({ e, i })).filter(({ e }) => String(e.name || "").toLowerCase().includes(n));
  if (date) { const d = parseDate(date); list = list.filter(({ e }) => e.date && e.date.slice(5) === d.slice(5)); }
  return list;
}

// ---------------------------------------------------------------- tools

const str = (description, extra = {}) => ({ type: "string", description, ...extra });
const num = (description, extra = {}) => ({ type: "number", description, ...extra });

const TOOLS = [
  {
    name: "get_overview",
    title: "Tracker overview",
    description: "One-shot summary for a month: milk bill totals, unmarked milk days, salary collected and pending students, and upcoming birthdays/anniversaries. Use this first for general questions.",
    inputSchema: { type: "object", properties: { month: str("Month as YYYY-MM or a month name. Defaults to the current month.") } },
    annotations: { readOnlyHint: true },
    run: (env, uid, a) => read(env, uid, (data) => {
      const ym = parseMonth(a.month);
      const [from, to] = monthRange(ym);
      const parts = [formatMilkSummary(data, from, to)];
      const un = unmarkedDays(data, ym);
      parts.push(un.length ? `Unmarked milk days: ${un.join(", ")}` : "All milk days marked so far.");
      const sal = salaryMonthReport(data, ym);
      parts.push(`Salary ${sal.name}: ${rupees(sal.total)} from ${sal.entries.length} student(s)` + (sal.pending.length ? `; pending: ${sal.pending.join(", ")}` : ""));
      const today = todayStr();
      const up = data.events.map((e) => ({ e, next: e.date ? nextOccurrence(e.date, today) : null })).filter((x) => x.next && daysBetween(today, x.next) <= 14).sort((a1, b1) => a1.next.localeCompare(b1.next));
      parts.push(up.length ? "Upcoming events (14 days): " + up.map((x) => `${x.e.name}'s ${x.e.type} on ${niceDate(x.next)}`).join("; ") : "No events in the next 14 days.");
      return parts.join("\n\n");
    })
  },
  {
    name: "mark_milk",
    title: "Mark milk for a day",
    description: "Mark milk taken on one day. quantity is liters for Bill 1 (0 = nil / no milk). In 2~MB mode also pass quantity_bill2. Prices come from the saved price list; replaces any existing entry for that day.",
    inputSchema: {
      type: "object",
      properties: {
        date: str("Day as YYYY-MM-DD, or today / yesterday. Defaults to today (India time)."),
        quantity: num("Liters for Bill 1, e.g. 1, 1.5, 2. Use 0 for nil.", { minimum: 0 }),
        quantity_bill2: num("Liters for Bill 2 (only in 2~MB mode). 0 = nil.", { minimum: 0 })
      },
      required: ["quantity"]
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (env, uid, a) => mutate(env, uid, (data) => {
      const date = parseDate(a.date);
      const entry = buildMilkEntry(data, data.milkData[date], a.quantity, a.quantity_bill2);
      data.milkData[date] = entry;
      return `Marked ${niceDate(date)}: ${describeEntry(data, entry)}.`;
    })
  },
  {
    name: "mark_milk_range",
    title: "Mark milk for several days",
    description: "Mark the same milk quantity for every day in a date range (max 62 days). By default days that are already marked are left unchanged; set overwrite=true to replace them.",
    inputSchema: {
      type: "object",
      properties: {
        start_date: str("First day, YYYY-MM-DD."),
        end_date: str("Last day, YYYY-MM-DD (inclusive)."),
        quantity: num("Liters for Bill 1. 0 = nil.", { minimum: 0 }),
        quantity_bill2: num("Liters for Bill 2 (2~MB mode only).", { minimum: 0 }),
        overwrite: { type: "boolean", description: "Replace days that are already marked. Default false." }
      },
      required: ["start_date", "end_date", "quantity"]
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (env, uid, a) => mutate(env, uid, (data) => {
      const from = parseDate(a.start_date, "start_date"), to = parseDate(a.end_date, "end_date");
      if (to < from) throw new ToolError("end_date is before start_date.");
      if (daysBetween(from, to) > 61) throw new ToolError("Range too long. Mark at most 62 days at a time.");
      let marked = 0, skipped = 0;
      for (let d = from; d <= to; d = shiftDate(d, 1)) {
        if (data.milkData[d] && !a.overwrite) { skipped++; continue; }
        data.milkData[d] = buildMilkEntry(data, data.milkData[d], a.quantity, a.quantity_bill2);
        marked++;
      }
      return `Marked ${marked} day(s) from ${niceDate(from)} to ${niceDate(to)}` + (skipped ? `; left ${skipped} already-marked day(s) unchanged.` : ".");
    })
  },
  {
    name: "clear_milk_day",
    title: "Remove a milk entry",
    description: "Remove the milk entry for a day so it shows as not marked. Confirm with the user before calling.",
    inputSchema: { type: "object", properties: { date: str("Day as YYYY-MM-DD or today / yesterday.") }, required: ["date"] },
    annotations: { readOnlyHint: false, destructiveHint: true },
    run: (env, uid, a) => mutate(env, uid, (data) => {
      const date = parseDate(a.date);
      if (!data.milkData[date]) return `${niceDate(date)} was not marked; nothing to remove.`;
      delete data.milkData[date];
      return `Removed the milk entry for ${niceDate(date)}.`;
    })
  },
  {
    name: "get_milk_day",
    title: "Check milk for a day",
    description: "Show what is marked for one day.",
    inputSchema: { type: "object", properties: { date: str("Day as YYYY-MM-DD or today / yesterday.") } },
    annotations: { readOnlyHint: true },
    run: (env, uid, a) => read(env, uid, (data) => { const d = parseDate(a.date); return `${niceDate(d)}: ${describeEntry(data, data.milkData[d])}.`; })
  },
  {
    name: "milk_bill_summary",
    title: "Milk bill totals",
    description: "Milk bill for a month or a custom date range, per bill (1~MB / 2~MB), with days taken, nil days, liters, breakdown by quantity and total amount. Same math as the app's Analyze button.",
    inputSchema: {
      type: "object",
      properties: {
        month: str("Month as YYYY-MM or name. Defaults to the current month. Ignored if start_date/end_date are given."),
        start_date: str("Optional custom range start, YYYY-MM-DD."),
        end_date: str("Optional custom range end, YYYY-MM-DD.")
      }
    },
    annotations: { readOnlyHint: true },
    run: (env, uid, a) => read(env, uid, (data) => {
      let from, to;
      if (a.start_date || a.end_date) {
        from = parseDate(a.start_date || a.end_date, "start_date"); to = parseDate(a.end_date || a.start_date, "end_date");
        if (to < from) throw new ToolError("end_date is before start_date.");
        if (daysBetween(from, to) > 400) throw new ToolError("Range too long (max about 13 months).");
      } else [from, to] = monthRange(parseMonth(a.month));
      return formatMilkSummary(data, from, to);
    })
  },
  {
    name: "milk_unmarked_days",
    title: "Unmarked milk days",
    description: "List the days in a month (up to today) that have no milk entry yet.",
    inputSchema: { type: "object", properties: { month: str("Month as YYYY-MM or name. Defaults to the current month.") } },
    annotations: { readOnlyHint: true },
    run: (env, uid, a) => read(env, uid, (data) => {
      const ym = parseMonth(a.month);
      const days = unmarkedDays(data, ym);
      return days.length ? `Unmarked days in ${monthName(ym)} ${ym.slice(0, 4)}: ${days.join(", ")} (${days.length} day(s)).` : `Every day in ${monthName(ym)} ${ym.slice(0, 4)} is marked so far.`;
    })
  },
  {
    name: "list_milk_prices",
    title: "Milk prices",
    description: "Show the saved milk quantities and prices for each bill, and whether the tracker uses one bill (1~MB) or two (2~MB).",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    run: (env, uid) => read(env, uid, (data) => {
      const fmt = (l) => l.filter((i) => Number(i.quantity) > 0).map((i) => `${liters(i.quantity)} = ${rupees(i.price)}`).join(", ") || "none";
      let t = `Mode: ${data.milkBillType}\nBill 1: ${fmt(data.milkQuantities)}`;
      if (data.milkBillType === "2~MB") t += `\nBill 2: ${fmt(data.milkQuantities2)}`;
      return t;
    })
  },
  {
    name: "set_milk_price",
    title: "Set a milk price",
    description: "Add or change the price for a milk quantity on a bill. Like the app, existing entries with that quantity are updated to the new price. Confirm with the user before changing an existing price.",
    inputSchema: {
      type: "object",
      properties: {
        bill: { type: "integer", enum: [1, 2], description: "Which bill: 1 or 2." },
        quantity: num("Liters, e.g. 1.5", { exclusiveMinimum: 0 }),
        price: num("Price in rupees for that quantity.", { minimum: 0 })
      },
      required: ["quantity", "price"]
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (env, uid, a) => mutate(env, uid, (data) => {
      const bill = Number(a.bill || 1) === 2 ? 2 : 1;
      const q = Number(a.quantity), p = Number(a.price);
      if (!(q > 0) || !(p >= 0)) throw new ToolError("quantity must be > 0 and price must be >= 0.");
      const list = priceList(data, bill);
      const item = list.find((i) => Number(i.quantity) === q);
      const old = item ? Number(item.price) : null;
      if (item) item.price = p; else { list.push({ quantity: q, price: p }); list.sort((x, y) => Number(x.quantity) - Number(y.quantity)); }
      let updated = 0;
      for (const e of Object.values(data.milkData)) {
        if (data.milkBillType === "1~MB" && bill === 1) { if (Number(e.quantity) === q) { e.cost = p; updated++; } }
        else if (Number(e[`quantity${bill}`]) === q) { e[`cost${bill}`] = p; updated++; }
      }
      return item ? `Bill ${bill}: ${liters(q)} price changed from ${rupees(old)} to ${rupees(p)}; updated ${updated} existing entr${updated === 1 ? "y" : "ies"}.` : `Bill ${bill}: added ${liters(q)} at ${rupees(p)}.`;
    })
  },
  {
    name: "add_salary",
    title: "Record a salary payment",
    description: "Record a payment from a student. The month is taken from the payment date. If the student already has a payment that month, it is replaced.",
    inputSchema: {
      type: "object",
      properties: {
        student: str("Student name."),
        amount: num("Amount in rupees.", { exclusiveMinimum: 0 }),
        date: str("Payment date YYYY-MM-DD or today / yesterday. Defaults to today.")
      },
      required: ["student", "amount"]
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (env, uid, a) => mutate(env, uid, (data) => {
      const student = String(a.student || "").trim();
      if (!student) throw new ToolError("student is required.");
      const amount = Number(a.amount);
      if (!(amount > 0)) throw new ToolError("amount must be greater than 0.");
      const date = parseDate(a.date);
      const mName = monthName(date.slice(0, 7));
      data.salaryData[mName] = data.salaryData[mName] || {};
      // Reuse the spelling already used for this student in any month
      const knownName = Object.values(data.salaryData).map((m) => findKeyCI(m, student)).find(Boolean);
      const key = findKeyCI(data.salaryData[mName], student) || knownName || student;
      const replaced = key in data.salaryData[mName];
      data.salaryData[mName][key] = { amount, date };
      return `${replaced ? "Updated" : "Recorded"} ${rupees(amount)} from ${key} on ${niceDate(date)} (${mName}).`;
    })
  },
  {
    name: "salary_report",
    title: "Salary for a month",
    description: "List payments for a month with the total, and students who paid last month but not yet this month (pending).",
    inputSchema: { type: "object", properties: { month: str("Month as YYYY-MM or name. Defaults to the current month.") } },
    annotations: { readOnlyHint: true },
    run: (env, uid, a) => read(env, uid, (data) => {
      const r = salaryMonthReport(data, parseMonth(a.month));
      const lines = [`Salary for ${r.name}: ${rupees(r.total)} from ${r.entries.length} student(s).`];
      for (const e of r.entries) lines.push(`- ${e.student}: ${rupees(e.amount)}${e.date ? ` on ${niceDate(e.date)}` : ""}`);
      lines.push(r.pending.length ? `Pending (paid last month, not yet this month): ${r.pending.join(", ")}` : "No pending students.");
      return lines.join("\n");
    })
  },
  {
    name: "delete_salary",
    title: "Remove a salary payment",
    description: "Remove a student's payment for a month. Confirm with the user before calling.",
    inputSchema: {
      type: "object",
      properties: { student: str("Student name."), month: str("Month as YYYY-MM or name. Defaults to the current month.") },
      required: ["student"]
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
    run: (env, uid, a) => mutate(env, uid, (data) => {
      const mName = monthName(parseMonth(a.month));
      const key = findKeyCI(data.salaryData[mName], a.student);
      if (!key) throw new ToolError(`No payment from "${a.student}" in ${mName}.`);
      delete data.salaryData[mName][key];
      if (!Object.keys(data.salaryData[mName]).length) delete data.salaryData[mName];
      return `Removed ${key}'s payment for ${mName}.`;
    })
  },
  {
    name: "add_event",
    title: "Add a birthday or anniversary",
    description: "Add a birthday or wedding anniversary. It repeats every year on the same day.",
    inputSchema: {
      type: "object",
      properties: {
        name: str("Person's name, e.g. Priya."),
        type: { type: "string", enum: EVENT_TYPES, description: "Birthday or Wedding Anniversary." },
        date: str("The date, YYYY-MM-DD. If the year is unknown use the current year.")
      },
      required: ["name", "type", "date"]
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    run: (env, uid, a) => mutate(env, uid, (data) => {
      const name = String(a.name || "").trim();
      if (!name) throw new ToolError("name is required.");
      const type = EVENT_TYPES.find((t) => t.toLowerCase() === String(a.type || "").trim().toLowerCase()) || (String(a.type || "").toLowerCase().includes("anniv") ? "Wedding Anniversary" : null);
      if (!type) throw new ToolError(`type must be one of: ${EVENT_TYPES.join(", ")}.`);
      const date = parseDate(a.date);
      const dup = data.events.find((e) => String(e.name).trim().toLowerCase() === name.toLowerCase() && e.type === type && String(e.date).slice(5) === date.slice(5));
      if (dup) return `${name}'s ${type} on ${niceDate(date)} is already saved.`;
      data.events.push({ name, type, date, celebrated: false });
      return `Added ${name}'s ${type} on ${niceDate(date)}.`;
    })
  },
  {
    name: "list_events",
    title: "List birthdays and anniversaries",
    description: "List saved events sorted by their next date. Use days to only show events coming up within that many days.",
    inputSchema: { type: "object", properties: { days: { type: "integer", minimum: 0, maximum: 366, description: "Only events within this many days from today. Omit for all." } } },
    annotations: { readOnlyHint: true },
    run: (env, uid, a) => read(env, uid, (data) => {
      const today = todayStr();
      let list = data.events.filter((e) => e && e.date).map((e) => ({ e, next: nextOccurrence(e.date, today) }));
      list.forEach((x) => (x.inDays = daysBetween(today, x.next)));
      if (Number.isInteger(a.days)) list = list.filter((x) => x.inDays <= a.days);
      list.sort((x, y) => x.next.localeCompare(y.next));
      if (!list.length) return Number.isInteger(a.days) ? `No events in the next ${a.days} day(s).` : "No events saved.";
      return list.map((x) => `- ${x.e.name}'s ${x.e.type}: ${niceDate(x.next)} (${x.inDays === 0 ? "today" : x.inDays === 1 ? "tomorrow" : `in ${x.inDays} days`})${x.e.celebrated ? ", celebrated" : ""}`).join("\n");
    })
  },
  {
    name: "set_event_celebrated",
    title: "Mark an event celebrated",
    description: "Mark (or unmark) a person's event as celebrated.",
    inputSchema: {
      type: "object",
      properties: {
        name: str("Person's name."),
        celebrated: { type: "boolean", description: "true to mark celebrated (default), false to unmark." },
        date: str("Optional date to pick between people with the same name.")
      },
      required: ["name"]
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (env, uid, a) => mutate(env, uid, (data) => {
      const hits = findEvents(data, a.name, a.date);
      if (!hits.length) throw new ToolError(`No event found for "${a.name}".`);
      if (hits.length > 1) throw new ToolError(`Several events match "${a.name}": ${hits.map(({ e }) => `${e.name}'s ${e.type} (${e.date})`).join("; ")}. Pass date to choose.`);
      const value = a.celebrated !== false;
      hits[0].e.celebrated = value;
      return `${hits[0].e.name}'s ${hits[0].e.type} marked as ${value ? "celebrated" : "not celebrated"}.`;
    })
  },
  {
    name: "delete_event",
    title: "Remove an event",
    description: "Remove a saved birthday or anniversary. Confirm with the user before calling.",
    inputSchema: {
      type: "object",
      properties: { name: str("Person's name."), date: str("Optional date to pick between people with the same name.") },
      required: ["name"]
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
    run: (env, uid, a) => mutate(env, uid, (data) => {
      const hits = findEvents(data, a.name, a.date);
      if (!hits.length) throw new ToolError(`No event found for "${a.name}".`);
      if (hits.length > 1) throw new ToolError(`Several events match "${a.name}": ${hits.map(({ e }) => `${e.name}'s ${e.type} (${e.date})`).join("; ")}. Pass date to choose.`);
      data.events.splice(hits[0].i, 1);
      return `Removed ${hits[0].e.name}'s ${hits[0].e.type}.`;
    })
  }
];

const INSTRUCTIONS = [
  "Personal Tracker: milk bill calendar, salary (student fee) tracker, and birthdays/anniversaries.",
  "Dates are India time. Use YYYY-MM-DD; 'today' and 'yesterday' are accepted.",
  "Milk: quantity 0 means nil (no milk that day). In 2~MB mode there are two bills; pass quantity_bill2 too. Prices come from the saved price list (see list_milk_prices).",
  "Salary is grouped by month name; pending = paid last month but not this month.",
  "Ask the user to confirm before any delete or price change. Reply briefly with amounts in rupees."
].join(" ");

// ---------------------------------------------------------------- JSON-RPC

async function handleMessage(msg, env, userId) {
  const isRequest = msg && typeof msg === "object" && "id" in msg && msg.id !== null;
  const reply = (result) => ({ jsonrpc: "2.0", id: msg.id, result });
  const fail = (code, message) => ({ jsonrpc: "2.0", id: msg && "id" in msg ? msg.id : null, error: { code, message } });

  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return fail(-32600, "Invalid Request");
  if (!isRequest) return null;

  switch (msg.method) {
    case "initialize": {
      const asked = msg.params && msg.params.protocolVersion;
      return reply({
        protocolVersion: SUPPORTED_PROTOCOLS.includes(asked) ? asked : SUPPORTED_PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS.map(({ run, ...t }) => t) });
    case "resources/list":
      return reply({ resources: [] });
    case "prompts/list":
      return reply({ prompts: [] });
    case "tools/call": {
      const name = msg.params && msg.params.name;
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return fail(-32602, `Unknown tool: ${name}`);
      try {
        const text = await tool.run(env, userId, (msg.params && msg.params.arguments) || {});
        return reply({ content: [{ type: "text", text }] });
      } catch (e) {
        const message = e instanceof ToolError ? e.message : "Something went wrong while updating the tracker.";
        if (!(e instanceof ToolError)) console.error("MCP tool error", name, e);
        return reply({ content: [{ type: "text", text: message }], isError: true });
      }
    }
    default:
      return fail(-32601, `Method not found: ${msg.method}`);
  }
}

// /mcp/<secret>
export async function handleMcp(request, env, secret) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (!env || !env.DB) return json({ error: "Database binding 'DB' is not configured." }, 503);

  const link = await resolveUser(env, secret);
  if (!link) return json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "This AI link is not valid. Create a new one in the app's Settings." } }, 404);

  // Stateless server: no server-initiated SSE stream and no sessions to close.
  if (request.method === "GET" || request.method === "DELETE") return new Response(null, { status: 405, headers: { Allow: "POST, OPTIONS", ...CORS } });
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST, OPTIONS", ...CORS } });

  let body;
  try { body = await request.json(); } catch (e) { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); }

  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handleMessage(m, env, link.user_id)))).filter(Boolean);
    return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
  }
  const out = await handleMessage(body, env, link.user_id);
  return out ? json(out) : new Response(null, { status: 202, headers: CORS });
}
