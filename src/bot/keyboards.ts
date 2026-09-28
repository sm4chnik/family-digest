import { DND_PRESETS } from "../time/dnd";
import {
  getAllTimeZones,
  getTimeZonesInRegion,
  getTimezoneRegions,
  labelForTimeZone,
  POPULAR_TIMEZONES,
} from "../time/timezone";

export type InlineKeyboard = {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const TZ_PAGE_SIZE = 8;

function pageSlice<T>(items: T[], page: number, pageSize = TZ_PAGE_SIZE): T[] {
  const start = page * pageSize;
  return items.slice(start, start + pageSize);
}

function navRow(
  page: number,
  total: number,
  prevCb: string,
  nextCb: string,
  pageSize = TZ_PAGE_SIZE,
): Array<{ text: string; callback_data: string }> {
  const nav: Array<{ text: string; callback_data: string }> = [];
  if (page > 0) nav.push({ text: "←", callback_data: prevCb });
  const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  nav.push({ text: `${page + 1}/${maxPage + 1}`, callback_data: "tz:noop" });
  if (page < maxPage) nav.push({ text: "→", callback_data: nextCb });
  return nav;
}

/** Root picker: popular zones + browse all / by region / custom. */
export function timezoneKeyboard(page = 0): InlineKeyboard {
  const total = POPULAR_TIMEZONES.length;
  const slice = pageSlice(POPULAR_TIMEZONES, page);
  const rows = slice.map((tz) => [
    { text: tz.label, callback_data: `tz:${tz.id}` },
  ]);

  rows.push(navRow(page, total, `tzpage:${page - 1}`, `tzpage:${page + 1}`));
  rows.push([{ text: "Все зоны (A–Z)", callback_data: "tza:0" }]);
  rows.push([{ text: "По регионам", callback_data: "tzreg" }]);
  rows.push([{ text: "Ввести IANA вручную", callback_data: "tz:custom" }]);
  return { inline_keyboard: rows };
}

export function timezoneAllKeyboard(page = 0): InlineKeyboard {
  const all = getAllTimeZones();
  const slice = pageSlice(all, page);
  const rows = slice.map((id) => [
    { text: labelForTimeZone(id), callback_data: `tz:${id}` },
  ]);
  rows.push(navRow(page, all.length, `tza:${page - 1}`, `tza:${page + 1}`));
  rows.push([{ text: "← К популярным", callback_data: "tzmenu" }]);
  rows.push([{ text: "Ввести IANA вручную", callback_data: "tz:custom" }]);
  return { inline_keyboard: rows };
}

export function timezoneRegionsKeyboard(): InlineKeyboard {
  const regions = getTimezoneRegions();
  const rows = chunk(regions, 2).map((pair) =>
    pair.map((region) => ({
      text: `${region} (${getTimeZonesInRegion(region).length})`,
      callback_data: `tzr:${region}:0`,
    })),
  );
  rows.push([{ text: "← К популярным", callback_data: "tzmenu" }]);
  return { inline_keyboard: rows };
}

export function timezoneRegionKeyboard(region: string, page = 0): InlineKeyboard {
  const zones = getTimeZonesInRegion(region);
  const slice = pageSlice(zones, page);
  const rows = slice.map((id) => [
    { text: labelForTimeZone(id), callback_data: `tz:${id}` },
  ]);
  rows.push(
    navRow(page, zones.length, `tzr:${region}:${page - 1}`, `tzr:${region}:${page + 1}`),
  );
  rows.push([{ text: "← Регионы", callback_data: "tzreg" }]);
  rows.push([{ text: "← К популярным", callback_data: "tzmenu" }]);
  return { inline_keyboard: rows };
}

export function dndOfferKeyboard(includeSkip: boolean): InlineKeyboard {
  const rows = DND_PRESETS.map((p) => [
    { text: p.label, callback_data: `dnd:set:${p.start}:${p.end}` },
  ]);
  rows.push([{ text: "Свой интервал…", callback_data: "dnd:custom" }]);
  if (includeSkip) {
    rows.push([{ text: "Пропустить", callback_data: "dnd:skip" }]);
  } else {
    rows.push([{ text: "Выключить DND", callback_data: "dnd:off" }]);
    rows.push([{ text: "← В настройки", callback_data: "set:menu" }]);
  }
  return { inline_keyboard: rows };
}

export function dndHourKeyboard(kind: "start" | "end"): InlineKeyboard {
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const rows = chunk(hours, 4).map((group) =>
    group.map((h) => ({
      text: `${String(h).padStart(2, "0")}:00`,
      callback_data: `dnd:${kind}:${h}`,
    })),
  );
  rows.push([{ text: "Отмена", callback_data: "dnd:cancel" }]);
  return { inline_keyboard: rows };
}

export function settingsKeyboard(): InlineKeyboard {
  return {
    inline_keyboard: [
      [{ text: "Часовой пояс", callback_data: "set:tz" }],
      [{ text: "Не беспокоить", callback_data: "set:dnd" }],
      [{ text: "Обновить статус", callback_data: "set:menu" }],
    ],
  };
}
