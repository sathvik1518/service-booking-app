import { countBulkSlots, dateParts, fmtRange, fmtTime, groupBy, initials, spotsInfo } from "../utils";

describe("time and date helpers", () => {
  it("formats times in 12 hour style", () => {
    expect(fmtTime("09:00:00")).toBe("9:00 AM");
    expect(fmtTime("12:30:00")).toBe("12:30 PM");
    expect(fmtTime("00:15:00")).toBe("12:15 AM");
    expect(fmtTime("17:45:00")).toBe("5:45 PM");
  });

  it("formats a time range, sharing AM/PM when it can", () => {
    expect(fmtRange("09:00:00", "09:30:00")).toBe("9:00 – 9:30 AM");
    expect(fmtRange("11:30:00", "12:15:00")).toBe("11:30 AM – 12:15 PM");
  });

  it("splits a date into calendar block parts without a time zone shift", () => {
    expect(dateParts("2026-11-09")).toEqual({ weekday: "Mon", day: "9", month: "Nov" });
  });

  it("makes initials", () => {
    expect(initials("Ananya Reddy")).toBe("AR");
    expect(initials("Priya")).toBe("P");
    expect(initials("  ")).toBe("?");
  });

  it("groups items", () => {
    const groups = groupBy([1, 2, 3, 4], (n) => (n % 2 ? "odd" : "even"));
    expect(groups.get("odd")).toEqual([1, 3]);
    expect(groups.get("even")).toEqual([2, 4]);
  });
});

describe("spotsInfo", () => {
  it("says Full when nothing is left", () => {
    expect(spotsInfo({ spots_left: 0, capacity: 1 })).toEqual({ text: "Full", tone: "full" });
  });
  it("says Available for a single-seat slot that is free", () => {
    expect(spotsInfo({ spots_left: 1, capacity: 1 }).text).toBe("Available");
  });
  it("warns about the last spot of a bigger slot", () => {
    expect(spotsInfo({ spots_left: 1, capacity: 2 })).toEqual({ text: "Last spot", tone: "low" });
  });
  it("counts spots", () => {
    expect(spotsInfo({ spots_left: 3, capacity: 5 }).text).toBe("3 spots left");
  });
});

describe("countBulkSlots (the preview on the Generate dialog)", () => {
  const base = { date_from: "2026-11-09", date_to: "2026-11-13", start_time: "09:00", end_time: "12:00", duration_minutes: 30, weekdays_only: true };
  it("counts slots per day times days", () => {
    expect(countBulkSlots(base)).toBe(6 * 5); // Mon-Fri, six 30 minute slots
  });
  it("skips weekends when asked", () => {
    expect(countBulkSlots({ ...base, date_to: "2026-11-15" })).toBe(6 * 5);
    expect(countBulkSlots({ ...base, date_to: "2026-11-15", weekdays_only: false })).toBe(6 * 7);
  });
  it("is zero when the window is shorter than one slot", () => {
    expect(countBulkSlots({ ...base, end_time: "09:20" })).toBe(0);
  });
});
