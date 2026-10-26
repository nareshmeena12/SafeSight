/**
 * The college AI policy (S23). Pure, so the assignment form, the server
 * actions and the tests share one set of rules; the database trigger
 * `enforce_assignment_policy` applies the same rules as a backstop.
 *
 * Stricter means: fewer modes allowed, a lower highest hint step, worked
 * examples off. Teachers may always be stricter; they may only be looser when
 * the admin turned on `teachersCanLoosen`. Lab Mode is a plain yes/no.
 */

export const policyModes = ["learn", "assist", "exam"] as const;
export type PolicyMode = (typeof policyModes)[number];

export type AiPolicy = {
  allowedModes: PolicyMode[];
  defaultMode: PolicyMode;
  maxHintLevel: number;
  workedExamples: boolean;
  labModeAllowed: boolean;
  teachersCanLoosen: boolean;
};

/** Where the policy came from, for the teacher's form. */
export type CoursePolicy = AiPolicy & { scope: "department" | "college"; departmentName: string };

/** What applies when the admin hasn't set anything: today's behaviour. */
export const openPolicy: AiPolicy = {
  allowedModes: ["learn", "assist", "exam"],
  defaultMode: "learn",
  maxHintLevel: 4,
  workedExamples: true,
  labModeAllowed: true,
  teachersCanLoosen: false,
};

export const modeLabels: Record<PolicyMode, string> = { learn: "Learn", assist: "Assist", exam: "Exam" };

export type AssignmentSettings = { aiMode: PolicyMode; maxHintLevel: number; workedExamples: boolean };

export type PolicyProblem = "mode" | "hint" | "examples";

/**
 * What a new assignment starts with: the policy's default mode, its highest
 * hint step and its worked-examples setting.
 */
export function assignmentDefaults(policy: AiPolicy | null): AssignmentSettings {
  const p = policy ?? openPolicy;
  return { aiMode: p.defaultMode, maxHintLevel: p.maxHintLevel, workedExamples: p.workedExamples };
}

/**
 * Settings that break the policy. On an edit, pass `previous`: only changed
 * settings are checked (a mode change re-checks the rest), so an assignment
 * made before the policy tightened can still be renamed. Exam mode turns Sage
 * off, so its hint settings are never a problem.
 */
export function policyProblems(
  policy: AiPolicy | null,
  next: AssignmentSettings,
  previous?: AssignmentSettings,
): PolicyProblem[] {
  if (!policy || policy.teachersCanLoosen) return [];
  const modeChanged = !previous || previous.aiMode !== next.aiMode;
  const problems: PolicyProblem[] = [];
  if (modeChanged && !policy.allowedModes.includes(next.aiMode)) problems.push("mode");
  if (next.aiMode !== "exam") {
    if ((modeChanged || previous?.maxHintLevel !== next.maxHintLevel) && next.maxHintLevel > policy.maxHintLevel) {
      problems.push("hint");
    }
    if ((modeChanged || previous?.workedExamples !== next.workedExamples) && next.workedExamples && !policy.workedExamples) {
      problems.push("examples");
    }
  }
  return problems;
}

/** Friendly text for one problem, naming whose policy it is. */
export function problemMessage(problem: PolicyProblem, policy: AiPolicy, source: string): string {
  switch (problem) {
    case "mode":
      return `${source} allows ${listModes(policy.allowedModes)} for assignments. Choose one of those.`;
    case "hint":
      return `${source} lets Sage go up to hint step ${policy.maxHintLevel}. Choose that step or a lower one.`;
    case "examples":
      return `${source} keeps worked examples off. Turn them off to save.`;
  }
}

/** "Mechanical's AI policy" or "Your college's AI policy". */
export function policySource(policy: Pick<CoursePolicy, "scope" | "departmentName"> | null): string {
  if (policy?.scope === "department" && policy.departmentName) return `The ${policy.departmentName} AI policy`;
  return "Your college's AI policy";
}

export function listModes(modes: readonly PolicyMode[]): string {
  const names = policyModes.filter((m) => modes.includes(m)).map((m) => modeLabels[m]);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** The database trigger raises `ai_policy: …` with a hint naming the rule. */
export function policyProblemFromDbError(error: { message?: string; hint?: string } | null): PolicyProblem | "lab" | null {
  if (!error?.message?.startsWith("ai_policy")) return null;
  switch (error.hint) {
    case "ai_policy_mode":
      return "mode";
    case "ai_policy_hint":
      return "hint";
    case "ai_policy_examples":
      return "examples";
    case "ai_policy_lab":
      return "lab";
    default:
      return "mode";
  }
}

/** One line per setting, for tables and the teacher's form. */
export function describePolicy(policy: AiPolicy): string[] {
  return [
    `Modes: ${listModes(policy.allowedModes)} (new assignments start in ${modeLabels[policy.defaultMode]})`,
    `Highest hint step: ${policy.maxHintLevel}`,
    `Worked examples: ${policy.workedExamples ? "on" : "off"}`,
    `Lab Mode: ${policy.labModeAllowed ? "allowed" : "not allowed"}`,
    policy.teachersCanLoosen ? "Teachers may change these" : "Teachers can only be stricter",
  ];
}

/** True when `a` is at least as strict as `b` on every setting. */
export function isAtLeastAsStrict(a: AiPolicy, b: AiPolicy): boolean {
  return (
    a.allowedModes.every((m) => b.allowedModes.includes(m)) &&
    a.maxHintLevel <= b.maxHintLevel &&
    (!a.workedExamples || b.workedExamples) &&
    (!a.labModeAllowed || b.labModeAllowed)
  );
}

type PolicyRow = {
  allowed_modes: PolicyMode[];
  default_mode: PolicyMode;
  max_hint_level: number;
  worked_examples: boolean;
  lab_mode_allowed: boolean;
  teachers_can_loosen: boolean;
};

export function policyFromRow(row: PolicyRow): AiPolicy {
  return {
    allowedModes: policyModes.filter((m) => row.allowed_modes.includes(m)),
    defaultMode: row.default_mode,
    maxHintLevel: row.max_hint_level,
    workedExamples: row.worked_examples,
    labModeAllowed: row.lab_mode_allowed,
    teachersCanLoosen: row.teachers_can_loosen,
  };
}
