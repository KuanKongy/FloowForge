/**
 * Schedule maths for the dashboard's "Upcoming Triggers" panel.
 *
 * Extracted from the dashboard page so it can be unit tested — the previous
 * inline versions had no coverage, which hid both a performance problem (a
 * ~527k-iteration loop running during render) and a correctness bug in cron
 * step handling.
 */

export type ScheduleTrigger = {
  config: Record<string, unknown> | null | undefined;
  created_at: string;
};

export function nextScheduleTime(trigger: ScheduleTrigger): Date | null {
  const config = trigger.config || {};
  const mode = (config.schedule_mode as string) || "cron";
  const now = new Date();
  if (mode === "once") {
    const onceAt = config.once_at as string | undefined;
    if (!onceAt) return null;
    const date = new Date(onceAt);
    return date.getTime() > now.getTime() ? date : null;
  }
  if (mode === "delay") {
    const base = new Date(trigger.created_at);
    const seconds =
      (Number(config.delay_hours) || 0) * 3600 +
      (Number(config.delay_minutes) || 0) * 60 +
      (Number(config.delay_seconds) || 0);
    // The API defaults an empty delay to one hour (scheduler._build_aps_trigger);
    // clamping *every* delay to an hour made the ETA wrong for the wizard's own
    // 30-minute default.
    const effective = seconds > 0 ? seconds : 3600;
    const date = new Date(base.getTime() + effective * 1000);
    return date.getTime() > now.getTime() ? date : null;
  }
  if (mode === "interval") {
    const seconds =
      (Number(config.interval_hours) || 0) * 3600 +
      (Number(config.interval_minutes) || 0) * 60 +
      (Number(config.interval_seconds) || 0);
    if (seconds <= 0) return null;
    const base = new Date(trigger.created_at).getTime();
    const elapsed = Math.max(0, now.getTime() - base);
    const periods = Math.floor(elapsed / (seconds * 1000)) + 1;
    return new Date(base + periods * seconds * 1000);
  }
  const cron = config.cron as string | undefined;
  return cron ? nextCronTime(cron, now) : null;
}

/**
 * Next firing time for a 5-field cron expression.
 *
 * Walks day-by-day and only expands minutes on days that match, instead of
 * allocating a `Date` for all ~527k minutes in a year. A cron that never
 * matches (e.g. Feb 30) previously burned the entire loop on every render.
 */
export function nextCronTime(cron: string, from: Date): Date | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minExpr, hourExpr, dayExpr, monthExpr, weekdayExpr] = parts;

  const minutes = expandCron(minExpr, 0, 59);
  const hours = expandCron(hourExpr, 0, 23);
  if (!minutes.length || !hours.length) return null;

  const cursor = new Date(from.getTime() + 60_000);
  cursor.setSeconds(0, 0);

  // 366 day-steps covers any schedule that fires at least annually.
  for (let day = 0; day < 366; day += 1) {
    const probe = new Date(cursor);
    probe.setDate(cursor.getDate() + day);
    if (
      !cronMatches(probe.getDate(), dayExpr, 1, 31) ||
      !cronMatches(probe.getMonth() + 1, monthExpr, 1, 12) ||
      !cronMatches(probe.getDay(), weekdayExpr, 0, 6)
    ) {
      continue;
    }
    for (const h of hours) {
      for (const m of minutes) {
        const candidate = new Date(probe);
        candidate.setHours(h, m, 0, 0);
        if (candidate.getTime() >= cursor.getTime()) return candidate;
      }
    }
  }
  return null;
}

/** All values in [min, max] that satisfy a single cron field. */
function expandCron(expr: string, min: number, max: number): number[] {
  const out: number[] = [];
  for (let v = min; v <= max; v += 1) {
    if (cronMatches(v, expr, min, max)) out.push(v);
  }
  return out;
}

export function cronMatches(value: number, expr: string, min: number, max: number): boolean {
  if (expr === "*") return true;
  return expr.split(",").some((part) => {
    // Step values are relative to the field's start, not to zero. Treating
    // day-of-month `*/2` as `value % 2 === 0` matched even days instead of the
    // 1st, 3rd, 5th…
    const [rangePart, stepPart] = part.split("/");
    const step = stepPart ? Number(stepPart) : 1;
    if (!Number.isFinite(step) || step <= 0) return false;

    let lo = min;
    let hi = max;
    if (rangePart && rangePart !== "*") {
      if (rangePart.includes("-")) {
        const [a, b] = rangePart.split("-").map(Number);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
        lo = Math.max(min, a);
        hi = Math.min(max, b);
      } else {
        const exact = Number(rangePart);
        if (!Number.isFinite(exact)) return false;
        // A bare number with no step matches only itself.
        if (!stepPart) return exact === value;
        lo = Math.max(min, exact);
      }
    }
    if (value < lo || value > hi) return false;
    return (value - lo) % step === 0;
  });
}
