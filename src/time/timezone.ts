/** Timezone helpers + full IANA catalog for onboarding. */

export interface TimezoneOption {
  id: string;
  label: string;
}

/** Friendly labels for popular family zones (shown first). */
export const POPULAR_TIMEZONES: TimezoneOption[] = [
  { id: "America/Buenos_Aires", label: "Буэнос-Айрес" },
  { id: "America/Cordoba", label: "Кордова (AR)" },
  { id: "America/Mendoza", label: "Мендоса" },
  { id: "America/Sao_Paulo", label: "Сан-Паулу" },
  { id: "America/Santiago", label: "Сантьяго" },
  { id: "America/Bogota", label: "Богота" },
  { id: "America/Mexico_City", label: "Мехико" },
  { id: "America/New_York", label: "Нью-Йорк" },
  { id: "America/Los_Angeles", label: "Лос-Анджелес" },
  { id: "Europe/Moscow", label: "Москва" },
  { id: "Europe/Kaliningrad", label: "Калининград" },
  { id: "Europe/Samara", label: "Самара" },
  { id: "Asia/Yekaterinburg", label: "Екатеринбург" },
  { id: "Asia/Novosibirsk", label: "Новосибирск" },
  { id: "Asia/Krasnoyarsk", label: "Красноярск" },
  { id: "Asia/Irkutsk", label: "Иркутск" },
  { id: "Asia/Vladivostok", label: "Владивосток" },
  { id: "Europe/Minsk", label: "Минск" },
  { id: "Europe/Kyiv", label: "Киев" },
  { id: "Europe/Berlin", label: "Берлин" },
  { id: "Europe/London", label: "Лондон" },
  { id: "Asia/Almaty", label: "Алматы" },
  { id: "Asia/Tashkent", label: "Ташкент" },
  { id: "Asia/Tokyo", label: "Токио" },
  { id: "Australia/Sydney", label: "Сидней" },
];

/** @deprecated use POPULAR_TIMEZONES / getAllTimeZones */
export const TIMEZONE_OPTIONS = POPULAR_TIMEZONES;

export function getAllTimeZones(): string[] {
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf;
    if (typeof supported === "function") {
      return [...supported("timeZone")].sort((a, b) => a.localeCompare(b));
    }
  } catch {
    // fall through
  }
  return POPULAR_TIMEZONES.map((z) => z.id);
}

export function getTimezoneRegions(): string[] {
  const regions = new Set<string>();
  for (const id of getAllTimeZones()) {
    const slash = id.indexOf("/");
    regions.add(slash === -1 ? id : id.slice(0, slash));
  }
  return [...regions].sort((a, b) => a.localeCompare(b));
}

export function getTimeZonesInRegion(region: string): string[] {
  const prefix = `${region}/`;
  return getAllTimeZones().filter((id) => id === region || id.startsWith(prefix));
}

export function labelForTimeZone(id: string): string {
  const popular = POPULAR_TIMEZONES.find((z) => z.id === id);
  if (popular) return popular.label;
  // America/Argentina/Ushuaia → Argentina/Ushuaia (shorter button)
  const parts = id.split("/");
  if (parts.length >= 2) return parts.slice(1).join("/").replaceAll("_", " ");
  return id.replaceAll("_", " ");
}

export function isValidIanaTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** Local minutes from midnight [0, 1440) in the given IANA zone. */
export function getLocalMinuteOfDay(now: Date, timeZone: string): number {
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

export function formatMinuteOfDay(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function parseHhMm(text: string): number | null {
  const match = text.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }
  return h * 60 + m;
}
