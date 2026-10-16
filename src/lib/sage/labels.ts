import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";

/**
 * classify_message labels. The model fills these with structured JSON output;
 * a keyword heuristic runs alongside it as a safety net, so a distress
 * message, a jailbreak or a "just give me the answer" is never missed because
 * the model was slow or wrong.
 */

export const intents = [
  "concept",
  "answer_seeking",
  "verify_answer",
  "attempt",
  "deliverable_request",
  "jailbreak",
  "distress",
  "off_topic",
] as const;
export type Intent = (typeof intents)[number];

export type DbIntent = Database["public"]["Enums"]["message_intent"];

/** "concept" is stored as concept_question so older rows and the dashboard SQL agree. */
export function toDbIntent(intent: Intent): DbIntent {
  return intent === "concept" ? "concept_question" : intent;
}

export function fromDbIntent(intent: DbIntent | null | undefined): Intent | null {
  if (!intent) return null;
  if (intent === "concept_question") return "concept";
  if (intent === "pasted_question") return "answer_seeking";
  return intent;
}

/** What the model returns. `match.ref` is one of the candidate refs ("A1", "A2", …) or null. */
export const classifierOutputSchema = z.object({
  intent: z.enum(intents),
  /** 0 no attempt (or only insisting/pasting) … 1 full worked attempt in the student's own words. */
  attemptQuality: z.number().min(0).max(1),
  /** The message contains the student's own working or reasoning for Sage to check. */
  sharesWorking: z.boolean(),
  /** Claims the rules don't apply: "my teacher allowed it", "this isn't graded". */
  claimsPermission: z.boolean(),
  distress: z.enum(["none", "low", "high"]),
  /** Short concept label, e.g. "first law sign convention". Empty if none. */
  topic: z.string().max(80),
  match: z.object({
    ref: z.string().max(8).nullable(),
    /** 0 unrelated … 0.3 same broad topic … 0.6 a part/step of the task … 1 the task itself. */
    similarity: z.number().min(0).max(1),
  }),
});
export type ClassifierOutput = z.infer<typeof classifierOutputSchema>;

export type Labels = {
  intent: Intent;
  attemptQuality: number;
  sharesWorking: boolean;
  claimsPermission: boolean;
  distress: "none" | "low" | "high";
  topic: string;
  /** Best-matching active assignment for this student, if any. */
  match: { assignmentId: string | null; similarity: number };
  /** Where the labels came from (model + heuristic, or heuristic only). */
  source: "model" | "heuristic";
};

/** Human-readable shape for the classifier prompt (json_object mode needs it in words). */
export const classifierJsonShape = `{
  "intent": "concept" | "answer_seeking" | "verify_answer" | "attempt" | "deliverable_request" | "jailbreak" | "distress" | "off_topic",
  "attemptQuality": number from 0 to 1,
  "sharesWorking": boolean,
  "claimsPermission": boolean,
  "distress": "none" | "low" | "high",
  "topic": string (at most 6 words, "" if none),
  "match": { "ref": "A1" | "A2" | … | null, "similarity": number from 0 to 1 }
}`;

const patterns = {
  distressHigh:
    /\b(kill (myself|me)|suicid\w*|end (my life|it all)|want to die|wanna die|self[- ]?harm|hurt(ing)? myself|cut(ting)? myself|no reason to live|better off dead|don'?t want to (live|be alive))\b/i,
  distressLow:
    /\b(hopeless|worthless|can'?t cope|can'?t take (it|this) anymore|panic attacks?|breaking down|so (stressed|anxious|depressed)|depress(ed|ion)|i'?m a failure|nobody cares|crying (all|every))\b/i,
  jailbreak:
    /(ignore|disregard|forget|override|bypass) (all |any |your |the |previous |prior |earlier |these |of )*(instructions|rules|prompt|guidelines|restrictions|system|programming)|pretend (you are|you're|to be)|you are now\b|from now on,? you|act as (chatgpt|gpt|an? (unrestricted|unfiltered|different))|jailbreak|\bDAN\b|(developer|dev|debug|admin|maintenance|god|unrestricted) mode|(reveal|show|print|repeat|tell me|what (is|are)|share|output|paste|dump) (me )?(your|the) (system |hidden |original |initial |secret |internal )?(prompt|instructions|rules|configuration|config|policy|policy variables|settings|reference solution|solution key)|teacher'?s? (private )?notes|answer key|\bsystem prompt\b|(above|previous) (text|message) verbatim/i,
  permission:
    /\b((my |the )?(teacher|professor|prof|sir|ma'?am|instructor|ta)\b[^.?!]{0,40}\b(allowed|said (it'?s|its|it is) (ok|okay|fine)|permitted|approved|lets? us|wants you to)|(this|it) (is ?n'?t|is not|isnt) graded|not (for|being) graded|ungraded|just for practice|already submitted|deadline (has )?passed)\b/i,
  deliverable:
    /\b(write|draft|compose|generate|produce|make|type)\b[^.?!]{0,40}\b(essay|report|paragraph|introduction|conclusion|outline|program|code|function|script|answer sheet|assignment|lab report|abstract|summary for submission)\b|\b(full|complete|whole|entire|working)\s+(code|program|essay|report|function)\b/i,
  answerSeeking:
    /\b((give|tell|show|send|share) me (the |a |an )?(final |full |complete |whole |exact |correct |numerical )?(answer|solution|answers|solutions|working|result|value)|(just|only) (the )?(answer|solution|number|final)|solve (it|this|these|the (whole|entire|full|question|problem))|do (it|this|my (homework|assignment)) for me|what('?s| is) the (final |correct |exact )?answer|what('?s| is) the (final|correct|exact) (value|result)|full solution|complete solution|step[- ]by[- ]step solution|answer key|fill in the blanks?)\b/i,
  verify:
    /\b(is (it|this|that|my answer) (right|correct)|am i (right|correct)|(check|verify|confirm) (my |this |the )?(answer|result|final)|is the answer|did i get it right|right answer\?|correct answer\?|just confirm|right or wrong|yes or no)\b|\bis (the|my) (root|answer|value|result|work|pressure|temperature|heat|output)\b[^?]{0,40}?(\d+\.\d+|\d{2,})|\bis\b[^?]{0,30}?(\d+\.\d+|\d{2,})[^?]{0,20}?\b(right|correct|wrong)\b/i,
  examStyle:
    /(\bQ\.?\s?\d|\bquestion\s?\d|\(\s?\d+\s?marks?\s?\)|\b\d+\s?marks\b|\b(calculate|determine|find|derive|evaluate|compute|show that|prove that)\b)/i,
  attempt:
    /\b(i (tried|got|think|did|calculated|used|applied|assumed|wrote|drew|took|substituted|found|started)|i'?m getting|i am getting|my (attempt|working|approach|steps?|reasoning|draft|code)|here'?s (what i|my)|so far i|first i)\b/i,
  concept: /\?|\b(what is|what are|why|how (does|do|is|can)|explain|difference between|meaning of|define|intuition)\b/i,
} as const;

/** Keyword labels. Cheap, offline, deliberately conservative. */
export function heuristicLabels(text: string): Labels {
  const t = text.trim();
  const distress = patterns.distressHigh.test(t) ? "high" : patterns.distressLow.test(t) ? "low" : "none";
  const jailbreak = patterns.jailbreak.test(t);
  const equations = t.match(/=/g)?.length ?? 0;
  const hasWork = patterns.attempt.test(t) && (equations >= 1 || /\d/.test(t) || t.length > 120);
  const attemptQuality = hasWork ? (equations >= 3 ? 0.7 : 0.5) : patterns.attempt.test(t) ? 0.2 : 0;
  const pasted = !hasWork && t.length > 280 && patterns.examStyle.test(t);

  let intent: Intent = patterns.concept.test(t) ? "concept" : "off_topic";
  if (hasWork) intent = "attempt";
  if (patterns.verify.test(t)) intent = "verify_answer";
  if (pasted || patterns.answerSeeking.test(t)) intent = "answer_seeking";
  if (patterns.deliverable.test(t)) intent = "deliverable_request";
  if (jailbreak) intent = "jailbreak";
  if (distress !== "none") intent = "distress";
  // Short follow-ups ("ok", "thanks", "hmm") are part of the conversation, not off-topic.
  if (intent === "off_topic" && t.length < 40) intent = "concept";

  return {
    intent,
    attemptQuality,
    sharesWorking: hasWork,
    claimsPermission: patterns.permission.test(t),
    distress,
    topic: "",
    match: { assignmentId: null, similarity: 0 },
    source: "heuristic",
  };
}

const distressRank = { none: 0, low: 1, high: 2 } as const;

/** Intents the heuristic may force over the model's choice, strongest first. */
const forced: Intent[] = ["distress", "jailbreak", "deliverable_request", "answer_seeking", "verify_answer"];

/**
 * Combine the model's labels with the heuristic. The model decides in general
 * (it sees the conversation and the assignments); the heuristic can only
 * raise safety signals: distress, jailbreaks, explicit requests for the
 * answer or the deliverable, and permission claims. It can also lower attempt
 * quality when the model was generous to a message with no work in it.
 */
export function mergeLabels(model: Omit<Labels, "source"> | null, heuristic: Labels): Labels {
  if (!model) return heuristic;
  const distress = distressRank[heuristic.distress] > distressRank[model.distress] ? heuristic.distress : model.distress;
  let intent = model.intent;
  for (const f of forced) {
    if (heuristic.intent === f && intent !== f && forced.indexOf(f) < rank(intent)) {
      intent = f;
      break;
    }
  }
  if (distress === "high") intent = "distress";
  // Insisting or asking for the deliverable is never itself an attempt.
  const noWork = intent === "answer_seeking" || intent === "deliverable_request" || intent === "jailbreak";
  return {
    ...model,
    intent,
    distress,
    attemptQuality: noWork ? Math.min(model.attemptQuality, heuristic.sharesWorking ? 0.5 : 0.2) : model.attemptQuality,
    claimsPermission: model.claimsPermission || heuristic.claimsPermission,
    topic: model.topic.trim().slice(0, 80),
    source: "model",
  };
}

function rank(intent: Intent) {
  const i = forced.indexOf(intent);
  return i === -1 ? forced.length : i;
}

/** Intents that count towards the repeated answer-seeking flag and the Reliance Score. */
export function isAnswerSeeking(intent: Intent | null | undefined) {
  return intent === "answer_seeking" || intent === "deliverable_request";
}

/** A genuine attempt: the only thing that climbs the hint ladder. */
export const GENUINE_ATTEMPT = 0.5;
