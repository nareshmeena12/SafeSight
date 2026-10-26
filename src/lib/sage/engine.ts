import "server-only";
import { streamText, type ModelMessage } from "ai";
import { chatModel, type UsageTag } from "@/lib/ai/provider";
import { classifyMessage } from "./classify";
import { codeNamesIn, deterministicGuard, lastSafeBoundary, riskyWithoutModelCheck, type GuardContext } from "./guard";
import { modelGuard } from "./guard-model";
import { heuristicLabels, type Labels } from "./labels";
import type { SageAssignment } from "./match";
import { decidePolicy, type LadderState, type Policy } from "./policy";
import { buildSagePrompt, examModeReply, jailbreakReply, safeHint, type Passage } from "./prompt";
import type { CareData } from "./types";

/**
 * One Sage turn, without the database: classify ∥ notes search → policy →
 * generate → guard. The route (/api/sage) and the red-team evals
 * (pnpm eval:sage) both run exactly this code.
 */

export const DRAFT_TIMEOUT_MS = Number(process.env.SAGE_DRAFT_MS) || 25_000;
const SEARCH_TIMEOUT_MS = 2_500;
/** A regeneration needs about this much time left before the route's deadline. */
const REGENERATE_BUDGET_MS = 18_000;

export type TurnInput = {
  text: string;
  /** Conversation so far, oldest first. */
  history: ModelMessage[];
  /** The chat's own assignment, or null in Explore ("Ask Sage"). */
  home: SageAssignment | null;
  /** The student's active assignments in this course, home included. */
  candidates: SageAssignment[];
  ladderFor: (assignmentId: string) => LadderState | null;
  course: { name: string; code: string };
  studentFirstName: string;
  /** The student's earlier messages in this chat (values they wrote are theirs to see). */
  earlierStudentText: string;
  /** Notes search for this course, or null when it has no ready materials. */
  search: ((query: string) => Promise<(Passage & { materialId: string })[]>) | null;
  care: CareData;
  /** Jailbreak attempts so far (varies the fixed reply). */
  jailbreaks: number;
  /** Skip the classifier model (Exam-mode chats): keyword labels only, matched to the home assignment. */
  labelsOnly?: boolean;
  /** S21: the message is the student's own working, read from a photo they checked (numbered lines). */
  fromPhoto?: boolean;
  /** Whose tokens these are (ai_usage): features are `${prefix}_classify`, `_reply`, `_guard`. */
  usage: { userId: string | null; prefix: "sage" | "sage_preview" | "eval" };
};

export type Plan = {
  labels: Labels;
  policy: Policy;
  passages: (Passage & { materialId: string })[];
  system: string;
  guard: GuardContext;
  timings: { classifyMs: number; searchMs: number | null };
};

export type GuardOutcome = "pass" | "regenerated" | "safe_hint" | "fixed";

export type Reply = {
  text: string;
  guard: GuardOutcome;
  /** Why a draft was rejected, for logs and evals. */
  rejected: string[];
  /** Passages the reply refers to (for the page chips). */
  cited: (Passage & { materialId: string })[];
  timings: { draftMs: number; guardMs: number };
};

const needsNotes = (p: Policy) => !["care", "exam_off", "jailbreak"].includes(p.kind);

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

/** Classification and notes search run in parallel; the policy decides once both are in. */
export async function planTurn(input: TurnInput, signal?: AbortSignal): Promise<Plan> {
  const started = performance.now();
  let searchMs: number | null = null;
  const search =
    input.search && input.text.trim().length >= 12
      ? withTimeout(
          input.search(input.text.slice(0, 300)).catch(() => []),
          SEARCH_TIMEOUT_MS,
          [],
        ).then((r) => {
          searchMs = Math.round(performance.now() - started);
          return r;
        })
      : Promise.resolve([]);

  let labels: Labels =
    input.labelsOnly && input.home
      ? { ...heuristicLabels(input.text), match: { assignmentId: input.home.id, similarity: 1 } }
      : await classifyMessage({
          text: input.text,
          history: input.history,
          home: input.home,
          candidates: input.candidates,
          signal,
          usage: { feature: `${input.usage.prefix}_classify`, userId: input.usage.userId },
        });
  const classifyMs = Math.round(performance.now() - started);
  // A confirmed photo of working is the student's own steps, whatever the classifier thought.
  if (input.fromPhoto) labels = { ...labels, sharesWorking: true };

  const matched = input.candidates.find((a) => a.id === labels.match.assignmentId);
  const policy = decidePolicy({
    home: input.home,
    matched: matched ? { assignment: matched, similarity: labels.match.similarity } : null,
    labels,
    ladderFor: input.ladderFor,
  });
  const passages = needsNotes(policy) ? await search : [];

  const system = buildSagePrompt({
    policy,
    labels,
    courseName: input.course.name,
    courseCode: input.course.code,
    home: input.home,
    studentFirstName: input.studentFirstName,
    passages,
    care: input.care,
    fromPhoto: input.fromPhoto,
  });

  const all = dedupe([...(input.home ? [input.home] : []), ...input.candidates]);
  const guard: GuardContext = {
    policy,
    answerKeys: all.map((a) => a.answerKey).filter((k) => k.trim()),
    teacherNotes: all.map((a) => a.teacherNotes).filter((n) => n.trim()),
    systemPrompt: system,
    visibleText: [
      ...all.map((a) => `${a.title}\n${a.instructions}`),
      input.earlierStudentText,
      input.text,
      ...passages.map((p) => p.content),
    ].join("\n\n"),
    homeKind: input.home?.kind ?? null,
    codeNames: (policy.governing ? [policy.governing] : all)
      .filter((a) => a.kind === "code")
      .flatMap((a) => codeNamesIn(a.instructions)),
  };

  return { labels, policy, passages, system, guard, timings: { classifyMs, searchMs } };
}

function dedupe(list: SageAssignment[]) {
  return list.filter((a, i) => list.findIndex((b) => b.id === a.id) === i);
}

/**
 * Write the reply. Text goes out through `emit` as soon as it is safe:
 * sentence by sentence for free explanations (deterministic checks), or all
 * at once after the model guard for anything under an assignment's rules.
 */
export async function writeReply(
  plan: Plan,
  input: TurnInput,
  {
    signal,
    emit,
    stage,
    deadline = Date.now() + 55_000,
  }: {
    signal?: AbortSignal;
    emit: (text: string) => void;
    stage?: (stage: "writing" | "checking") => void;
    deadline?: number;
  },
): Promise<Reply> {
  const { policy } = plan;
  const timings = { draftMs: 0, guardMs: 0 };
  const rejected: string[] = [];

  if (policy.kind === "exam_off" || policy.kind === "jailbreak") {
    const text =
      policy.kind === "exam_off"
        ? examModeReply(policy.governing?.title ?? "This assignment")
        : jailbreakReply(policy, input.jailbreaks);
    emit(text);
    return { text, guard: "fixed", rejected, cited: [], timings };
  }

  const messages: ModelMessage[] = [...input.history, { role: "user", content: input.text }];
  const finish = (text: string, guard: GuardOutcome): Reply => ({
    text,
    guard,
    rejected,
    cited: citedPassages(text, plan.passages),
    timings,
  });

  stage?.("writing");
  if (policy.guard === "light") {
    const light = await streamLight(plan, messages, { signal, emit, timings, usage: replyUsage(input) });
    if (light.ok) return finish(light.text, "pass");
    rejected.push(light.reason);
    if (light.emitted) {
      const tail = "\n\nLet me stop there — have a go at the next step yourself and tell me what you get.";
      emit(tail);
      return finish(light.text + tail, "safe_hint");
    }
  }

  // Full guard: hold the draft, check it, regenerate once with stricter rules, then fall back.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0 || rejected.length) {
      if (deadline - Date.now() < REGENERATE_BUDGET_MS) break;
    }
    const system =
      rejected.length === 0
        ? plan.system
        : buildSagePrompt({
            policy,
            labels: plan.labels,
            courseName: input.course.name,
            courseCode: input.course.code,
            home: input.home,
            studentFirstName: input.studentFirstName,
            passages: plan.passages,
            care: input.care,
            fromPhoto: input.fromPhoto,
            rejected: rejected.at(-1),
          });
    const draft = await draftText(system, messages, signal, timings, rejected.length ? 0.2 : 0.4, replyUsage(input));
    stage?.("checking");
    const verdict = await check(draft, plan, input, signal, timings);
    if (verdict.ok) {
      emit(draft);
      return finish(draft, rejected.length ? "regenerated" : "pass");
    }
    rejected.push(verdict.reason);
  }

  const hint = safeHint(policy);
  emit(hint);
  return finish(hint, "safe_hint");
}

const replyUsage = (input: TurnInput): UsageTag => ({ feature: `${input.usage.prefix}_reply`, userId: input.usage.userId });

async function draftText(
  system: string,
  messages: ModelMessage[],
  signal: AbortSignal | undefined,
  timings: Reply["timings"],
  temperature: number,
  usage: UsageTag,
) {
  const started = performance.now();
  let error: unknown = null;
  const result = streamText({
    model: chatModel(usage),
    system,
    messages,
    temperature,
    maxOutputTokens: 900,
    maxRetries: 0,
    abortSignal: signal ? AbortSignal.any([signal, AbortSignal.timeout(DRAFT_TIMEOUT_MS)]) : AbortSignal.timeout(DRAFT_TIMEOUT_MS),
    onError: ({ error: e }) => {
      error = e;
    },
  });
  const text = (await result.text).trim();
  timings.draftMs += Math.round(performance.now() - started);
  if (!text) throw error ?? new Error("The model returned an empty reply.");
  return text;
}

async function check(
  draft: string,
  plan: Plan,
  input: TurnInput,
  signal: AbortSignal | undefined,
  timings: Reply["timings"],
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const fast = deterministicGuard(draft, plan.guard);
  if (!fast.ok) return { ok: false, reason: `${fast.category}: ${fast.reason}` };
  const started = performance.now();
  const verdict = await modelGuard({
    draft,
    policy: plan.policy,
    studentMessage: input.text,
    signal,
    usage: { feature: `${input.usage.prefix}_guard`, userId: input.usage.userId },
  });
  timings.guardMs += Math.round(performance.now() - started);
  if (!verdict) {
    // The guard model is unavailable: only clearly low-risk drafts go out.
    return riskyWithoutModelCheck(draft, plan.guard.visibleText)
      ? { ok: false, reason: "guard unavailable and the draft has new numbers or code" }
      : { ok: true };
  }
  return verdict.pass || verdict.category === "none" ? { ok: true } : { ok: false, reason: `${verdict.category}: ${verdict.reason}` };
}

/** Stream sentence by sentence; every sentence passes the deterministic checks before it goes out. */
async function streamLight(
  plan: Plan,
  messages: ModelMessage[],
  {
    signal,
    emit,
    timings,
    usage,
  }: { signal?: AbortSignal; emit: (t: string) => void; timings: Reply["timings"]; usage: UsageTag },
): Promise<{ ok: true; text: string } | { ok: false; reason: string; emitted: boolean; text: string }> {
  const started = performance.now();
  const local = new AbortController();
  let error: unknown = null;
  const result = streamText({
    model: chatModel(usage),
    system: plan.system,
    messages,
    temperature: 0.4,
    maxOutputTokens: 1200,
    maxRetries: 0,
    abortSignal: AbortSignal.any([
      local.signal,
      AbortSignal.timeout(DRAFT_TIMEOUT_MS),
      ...(signal ? [signal] : []),
    ]),
    onError: ({ error: e }) => {
      error = e;
    },
  });
  let full = "";
  let sent = 0;
  try {
    for await (const delta of result.textStream) {
      full += delta;
      const boundary = lastSafeBoundary(full);
      if (boundary > sent) {
        const verdict = deterministicGuard(full.slice(0, boundary), plan.guard);
        if (!verdict.ok) {
          local.abort();
          return { ok: false, reason: `${verdict.category}: ${verdict.reason}`, emitted: sent > 0, text: full.slice(0, sent) };
        }
        emit(full.slice(sent, boundary));
        sent = boundary;
      }
    }
  } finally {
    timings.draftMs += Math.round(performance.now() - started);
  }
  if (!full.trim()) throw error ?? new Error("The model returned an empty reply.");
  const verdict = deterministicGuard(full, plan.guard);
  if (!verdict.ok) {
    return { ok: false, reason: `${verdict.category}: ${verdict.reason}`, emitted: sent > 0, text: full.slice(0, sent) };
  }
  if (full.length > sent) emit(full.slice(sent));
  return { ok: true, text: full.trim() };
}

/** Pages the reply mentions; otherwise the top passage if the reply mentions the notes. */
export function citedPassages<T extends Passage>(text: string, passages: T[]): T[] {
  const named = passages.filter((p) => p.page && new RegExp(`\\bp(age|\\.)\\s*${p.page}\\b`, "i").test(text));
  if (named.length) return named.slice(0, 3);
  return /\bnotes?\b|\bpage\b/i.test(text) && passages[0] ? [passages[0]] : [];
}
