import { describe, expect, it } from "vitest";
import {
  addDays,
  buildSchedule,
  countdownLabel,
  currentDay,
  daysBetween,
  istToday,
  missedTasks,
  mockTopics,
  planProgress,
  planTopics,
  scoreTopic,
  type StudentSignals,
} from "./plan";

const none: StudentSignals = { mastery: [], mistakes: [], asked: [] };

const signals: StudentSignals = {
  mastery: [
    { topic: "Entropy change", topicKey: "entropy change", mastery: 0.3, evidence: 2 },
    { topic: "First law", topicKey: "first law", mastery: 0.9, evidence: 3 },
  ],
  mistakes: [
    { label: "Sign errors in entropy change", topic: "Entropy change", count: 3, reviewed: false },
    { label: "Forgetting kelvin", topic: "Ideal gas law", count: 1, reviewed: true },
  ],
  asked: [{ topic: "entropy change", count: 4 }],
};

describe("scoreTopic", () => {
  it("weighs a weak topic with repeated mistakes above a strong one, and says why", () => {
    const weak = scoreTopic({ title: "Entropy change", source: "syllabus" }, signals);
    const strong = scoreTopic({ title: "First law", source: "syllabus" }, signals);
    expect(weak.mastery).toBe(0.3);
    expect(weak.mistakes).toBe(3);
    expect(weak.weight).toBeGreaterThan(strong.weight);
    expect(weak.reasons).toContain("Repeated slip: sign errors in entropy change (×3)");
    expect(weak.reasons).toContain("You asked Sage about it 4 times");
    expect(weak.reasons.at(-1)).toBe("On the official syllabus");
    expect(strong.reasons[0]).toBe("Mastery 90%, strong");
  });

  it("treats a topic with no practice as needing time, between weak and strong", () => {
    const fresh = scoreTopic({ title: "Rankine cycle", source: "notes" }, signals);
    expect(fresh.mastery).toBeNull();
    expect(fresh.reasons[0]).toBe("Not practised yet");
    expect(fresh.weight).toBe(1.6);
  });

  it("ignores reviewed mistakes", () => {
    expect(scoreTopic({ title: "Ideal gas law", source: "syllabus" }, signals).mistakes).toBe(0);
  });
});

describe("planTopics", () => {
  it("keeps the whole official list and adds only the student's weak extra topics", () => {
    const base = [
      { title: "First law", source: "syllabus" as const },
      { title: "Rankine cycle", source: "syllabus" as const },
    ];
    const topics = planTopics(base, {
      ...signals,
      mastery: [...signals.mastery, { topic: "Heat exchangers", topicKey: "heat exchangers", mastery: 0.85, evidence: 2 }],
    });
    expect(topics.map((t) => t.title)).toEqual(["Entropy change", "Rankine cycle", "First law"]);
    expect(topics[0].source).toBe("yours");
  });

  it("uses the student's own topics when there is no official list", () => {
    const topics = planTopics([], signals);
    expect(topics.map((t) => t.title).sort()).toEqual(["Entropy change", "First law"]);
  });

  it("drops duplicates by key and caps the student's own list", () => {
    const many: StudentSignals = {
      ...none,
      asked: "boiler turbine pump nozzle diffuser compressor condenser throttle mixing chamber kettle radiator piston cylinder valve fan heater cooler"
        .split(" ")
        .map((topic) => ({ topic, count: 1 })),
    };
    expect(planTopics([{ title: "Entropy", source: "notes" }, { title: "entropy", source: "notes" }], none)).toHaveLength(1);
    expect(planTopics([], many, 14)).toHaveLength(14);
  });
});

describe("dates", () => {
  it("counts India-time days", () => {
    // 20:00 UTC on 26 Oct is already 27 Oct in India.
    expect(istToday(new Date("2026-10-26T20:00:00Z"))).toBe("2026-10-27");
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(daysBetween("2026-10-26", "2026-11-05")).toBe(10);
    expect(countdownLabel(0)).toBe("Exam today");
    expect(countdownLabel(1)).toBe("Exam tomorrow");
    expect(countdownLabel(12)).toBe("Exam in 12 days");
  });
});

describe("buildSchedule", () => {
  const topics = planTopics(
    [
      { title: "Entropy change", source: "syllabus" },
      { title: "First law", source: "syllabus" },
      { title: "Rankine cycle", source: "syllabus" },
      { title: "Polytropic processes", source: "syllabus" },
    ],
    signals,
  );

  it("fills every day up to the exam and ends with a mock test", () => {
    const { days, skipped } = buildSchedule({ topics, today: "2026-10-26", examDate: "2026-11-05", minutesPerDay: 60, hasReview: true });
    expect(days).toHaveLength(10);
    expect(days[0].date).toBe("2026-10-26");
    expect(days.at(-1)!.date).toBe("2026-11-04");
    expect(days.at(-1)!.kind).toBe("mock");
    expect(days.at(-1)!.tasks[0]).toMatchObject({ kind: "mock", minutes: 45 });
    expect(skipped).toEqual([]);
    // A second mock past halfway, and a light day on day 7.
    expect(days.filter((d) => d.kind === "mock")).toHaveLength(2);
    expect(days[6].kind).toBe("light");
    // No study day goes more than 5 minutes over the daily budget.
    for (const d of days) expect(d.tasks.reduce((a, t) => a + t.minutes, 0)).toBeLessThanOrEqual(65);
  });

  it("starts with the weakest topic and gives strong topics only a quick practice", () => {
    const { days } = buildSchedule({ topics, today: "2026-10-26", examDate: "2026-11-05", minutesPerDay: 60 });
    const tasks = days.flatMap((d) => d.tasks);
    expect(tasks[0]).toMatchObject({ kind: "learn", topic: "Entropy change" });
    expect(tasks.filter((t) => t.topic === "First law" && t.kind === "learn")).toHaveLength(0);
    expect(tasks.some((t) => t.title === "Quick practice: First law")).toBe(true);
  });

  it("revisits a weak topic at least two days after the first time", () => {
    const { days } = buildSchedule({ topics, today: "2026-10-26", examDate: "2026-11-05", minutesPerDay: 60 });
    const first = days.findIndex((d) => d.tasks.some((t) => t.topic === "Entropy change"));
    const revisit = days.findIndex((d) => d.tasks.some((t) => t.kind === "revisit" && t.topic === "Entropy change"));
    expect(revisit).toBeGreaterThanOrEqual(first + 2);
  });

  it("combines tasks, then names topics it couldn't fit, when time is short", () => {
    const { days, skipped } = buildSchedule({ topics, today: "2026-10-26", examDate: "2026-10-28", minutesPerDay: 30 });
    expect(days).toHaveLength(2);
    expect(days[0].tasks.length).toBeGreaterThan(0);
    expect(skipped.length).toBeGreaterThan(0);
    expect(days[0].tasks.some((t) => t.title.includes("skim the notes"))).toBe(true);
  });

  it("uses spare minutes for topics the first pass couldn't reach before naming any as skipped", () => {
    const many = planTopics(
      "Systems,Properties,Zeroth law,Energy transfer,Boundary work,Pure substances,Property tables,Ideal gas,First law,Polytropic processes,Specific heats,Sign convention,Enthalpy"
        .split(",")
        .map((title) => ({ title, source: "notes" as const })),
      none,
    );
    const { days, skipped } = buildSchedule({ topics: many, today: "2026-10-26", examDate: "2026-11-09", minutesPerDay: 60 });
    expect(skipped).toEqual([]);
    for (const t of many) expect(days.some((d) => d.tasks.some((x) => x.key === t.key)), t.title).toBe(true);
  });

  it("puts study tasks next to the mock when the exam is tomorrow", () => {
    const { days } = buildSchedule({ topics, today: "2026-10-26", examDate: "2026-10-27", minutesPerDay: 90 });
    expect(days).toHaveLength(1);
    expect(days[0].tasks[0].kind).toBe("mock");
    expect(days[0].tasks.length).toBeGreaterThan(1);
  });

  it("gives every task a stable id and makes progress easy to read", () => {
    const { days } = buildSchedule({ topics, today: "2026-10-26", examDate: "2026-11-05", minutesPerDay: 45 });
    const ids = days.flatMap((d) => d.tasks.map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("2026-10-26-1");
    const p = planProgress(days, [ids[0], "not-a-task"]);
    expect(p.done).toBe(1);
    expect(p.total).toBe(ids.length);
    expect(currentDay(days, "2026-10-27")?.date).toBe("2026-10-27");
    expect(missedTasks(days, [ids[0]], "2026-10-27").every((t) => !t.id.startsWith("2026-10-26-1"))).toBe(true);
  });

  it("picks the heaviest topics for a mock test", () => {
    expect(mockTopics(topics, 2)).toEqual([topics[0].title, topics[1].title]);
  });
});
