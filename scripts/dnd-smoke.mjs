/** Run: node scripts/dnd-smoke.mjs */

function dndDurationMinutes(startMinute, endMinute) {
  if (startMinute === endMinute) return 0;
  if (startMinute < endMinute) return endMinute - startMinute;
  return 1440 - startMinute + endMinute;
}

function assertValidDndWindow(startMinute, endMinute) {
  const duration = dndDurationMinutes(startMinute, endMinute);
  if (duration <= 0) throw new Error("empty");
  if (duration > 12 * 60) throw new Error(">12h");
}

function getLocalMinuteOfDay(now, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function isInDnd(user, now) {
  if (!user.dnd_enabled) return false;
  const minute = getLocalMinuteOfDay(now, user.timezone);
  const { dnd_start_minute: start, dnd_end_minute: end } = user;
  if (start === end) return false;
  if (start < end) return minute >= start && minute < end;
  return minute >= start || minute < end;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(dndDurationMinutes(23 * 60, 8 * 60) === 9 * 60, "overnight");
assertValidDndWindow(23 * 60, 8 * 60);
let threw = false;
try {
  assertValidDndWindow(20 * 60, 10 * 60);
} catch {
  threw = true;
}
assert(threw, ">12h rejected");

const user = {
  dnd_enabled: 1,
  timezone: "Europe/Moscow",
  dnd_start_minute: 23 * 60,
  dnd_end_minute: 8 * 60,
};
assert(isInDnd(user, new Date("2026-08-08T01:00:00.000Z")), "in dnd");
assert(!isInDnd(user, new Date("2026-08-08T10:00:00.000Z")), "out dnd");
console.log("dnd-smoke ok");
