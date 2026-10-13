const TZ = "Europe/London";

const dateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** '2026-10-13' -> '13 Oct 2026'. Parsed at UTC noon so the London offset can't shift the day. */
export function formatDate(isoDate: string): string {
  return dateFmt.format(new Date(`${isoDate.slice(0, 10)}T12:00:00Z`));
}

/** Full ISO timestamp -> '13 Oct 2026, 21:37' in London time. */
export function formatDateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso));
}

/** Today's date in London as 'YYYY-MM-DD'. */
export function todayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
}

/** Minutes -> '2h 15m'. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}
