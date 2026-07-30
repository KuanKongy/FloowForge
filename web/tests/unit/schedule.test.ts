import { describe, expect, it } from "vitest";
import { cronMatches, nextCronTime, nextScheduleTime } from "@/lib/schedule";

describe("cronMatches", () => {
  it("matches a wildcard", () => {
    expect(cronMatches(17, "*", 0, 59)).toBe(true);
  });

  it("matches an exact value", () => {
    expect(cronMatches(9, "9", 0, 23)).toBe(true);
    expect(cronMatches(10, "9", 0, 23)).toBe(false);
  });

  it("matches a comma list", () => {
    expect(cronMatches(5, "1,5,9", 0, 59)).toBe(true);
    expect(cronMatches(6, "1,5,9", 0, 59)).toBe(false);
  });

  it("matches a range", () => {
    expect(cronMatches(3, "1-5", 0, 59)).toBe(true);
    expect(cronMatches(7, "1-5", 0, 59)).toBe(false);
  });

  it("treats steps as relative to the field start, not zero", () => {
    // day-of-month is 1-based: */2 means the 1st, 3rd, 5th …
    // The old implementation used `value % step`, which matched even days.
    expect(cronMatches(1, "*/2", 1, 31)).toBe(true);
    expect(cronMatches(3, "*/2", 1, 31)).toBe(true);
    expect(cronMatches(2, "*/2", 1, 31)).toBe(false);
  });

  it("still anchors zero-based fields at zero", () => {
    expect(cronMatches(0, "*/15", 0, 59)).toBe(true);
    expect(cronMatches(15, "*/15", 0, 59)).toBe(true);
    expect(cronMatches(20, "*/15", 0, 59)).toBe(false);
  });

  it("supports step within a range", () => {
    expect(cronMatches(1, "1-5/2", 0, 59)).toBe(true);
    expect(cronMatches(3, "1-5/2", 0, 59)).toBe(true);
    expect(cronMatches(4, "1-5/2", 0, 59)).toBe(false);
    expect(cronMatches(7, "1-5/2", 0, 59)).toBe(false);
  });

  it("rejects malformed expressions instead of throwing", () => {
    expect(cronMatches(5, "abc", 0, 59)).toBe(false);
    expect(cronMatches(5, "*/0", 0, 59)).toBe(false);
  });
});

describe("nextCronTime", () => {
  it("finds the next daily occurrence", () => {
    const from = new Date(2026, 0, 15, 8, 0, 0);
    const next = nextCronTime("30 9 * * *", from);
    expect(next).not.toBeNull();
    expect(next!.getHours()).toBe(9);
    expect(next!.getMinutes()).toBe(30);
    expect(next!.getDate()).toBe(15);
  });

  it("rolls over to the next day when the time has passed", () => {
    const from = new Date(2026, 0, 15, 10, 0, 0);
    const next = nextCronTime("30 9 * * *", from);
    expect(next!.getDate()).toBe(16);
    expect(next!.getHours()).toBe(9);
  });

  it("honours weekday restrictions", () => {
    // 2026-01-15 is a Thursday; next Monday is the 19th.
    const from = new Date(2026, 0, 15, 12, 0, 0);
    const next = nextCronTime("0 9 * * 1", from);
    expect(next!.getDay()).toBe(1);
    expect(next!.getDate()).toBe(19);
  });

  it("returns null for a malformed expression", () => {
    expect(nextCronTime("not a cron", new Date())).toBeNull();
    expect(nextCronTime("0 9 * *", new Date())).toBeNull();
  });

  it("returns null rather than hanging on an impossible date", () => {
    // February 30th never occurs.
    expect(nextCronTime("0 9 30 2 *", new Date(2026, 0, 1))).toBeNull();
  });
});

describe("nextScheduleTime", () => {
  it("uses the configured delay rather than clamping to an hour", () => {
    const created = new Date(Date.now() - 5 * 60_000).toISOString();
    const next = nextScheduleTime({
      created_at: created,
      config: { schedule_mode: "delay", delay_minutes: 30 },
    });
    expect(next).not.toBeNull();
    const minutesOut = (next!.getTime() - Date.now()) / 60_000;
    // 30 minutes after creation, i.e. ~25 minutes from now.
    expect(minutesOut).toBeGreaterThan(20);
    expect(minutesOut).toBeLessThan(30);
  });

  it("falls back to one hour when no delay is configured", () => {
    const created = new Date().toISOString();
    const next = nextScheduleTime({
      created_at: created,
      config: { schedule_mode: "delay" },
    });
    const minutesOut = (next!.getTime() - Date.now()) / 60_000;
    expect(minutesOut).toBeGreaterThan(55);
    expect(minutesOut).toBeLessThan(61);
  });

  it("advances interval schedules to the next period", () => {
    const created = new Date(Date.now() - 90 * 60_000).toISOString();
    const next = nextScheduleTime({
      created_at: created,
      config: { schedule_mode: "interval", interval_hours: 1 },
    });
    expect(next!.getTime()).toBeGreaterThan(Date.now());
  });

  it("ignores a past one-shot schedule", () => {
    const next = nextScheduleTime({
      created_at: new Date().toISOString(),
      config: {
        schedule_mode: "once",
        once_at: new Date(Date.now() - 60_000).toISOString(),
      },
    });
    expect(next).toBeNull();
  });

  it("returns null for an interval of zero", () => {
    expect(
      nextScheduleTime({
        created_at: new Date().toISOString(),
        config: { schedule_mode: "interval" },
      })
    ).toBeNull();
  });
});
