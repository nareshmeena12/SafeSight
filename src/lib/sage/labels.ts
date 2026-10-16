import { z } from "zod";

/**
 * classify_message labels (PLAN.md §4). The model fills these with structured
 * JSON output; a keyword heuristic runs alongside it as a safety net, so a
 * distress message or an "ignore your instructions" attempt is never missed
 * because the model was slow or wrong.
 */

export const intents = [
  "concept_question",
  "answer_seeking",
  "pasted_question",
  "off_topic",
  "distress",
] as const;
export type Intent = (typeof intents)[number];

export const labelsSchema = z.object({
  intent: z.enum(intents),
  /** The student showed real work of their own (a step, a formula applied, a number they got). */
  attempted: z.boolean(),
  /** The student shared a full worked attempt for Sage to check. */
  sharesSolution: z.boolean(),
  /** Tries to change Sage's rules: "ignore your instructions", "pretend you are ChatGPT". */
  instructionOverride: z.boolean(),
  distress: z.enum(["none", "low", "high"]),
  /** Short concept label, e.g. "first law sign convention". Empty if none. */
  topic: z.string().max(80),
});
export type Labels = z.infer<typeof labelsSchema>;

/** Human-readable shape for the classifier prompt (json_object mode needs it in words). */
export const labelsJsonShape = `{
  "intent": "concept_question" | "answer_seeking" | "pasted_question" | "off_topic" | "distress",
  "attempted": boolean,
  "sharesSolution": boolean,
  "instructionOverride": boolean,
  "distress": "none" | "low" | "high",
  "topic": string (at most 6 words, "" if none)
}`;

const patterns = {
  distressHigh:
    /\b(kill (myself|me)|suicid\w*|end (my|it all)|want to die|wanna die|self[- ]?harm|hurt(ing)? myself|cut(ting)? myself|no reason to live|better off dead|don'?t want to (live|be alive))\b/i,
  distressLow:
    /\b(hopeless|worthless|can'?t cope|can'?t take (it|this) anymore|panic attacks?|breaking down|so (stressed|anxious|depressed)|depress(ed|ion)|i'?m a failure|nobody cares|crying (all|every))\b/i,
  override:
    /(ignore|disregard|forget|override|bypass) (all |any |your |the |previous |prior |earlier |these )*(instructions|rules|prompt|guidelines|restrictions|system)|pretend (you are|you're|to be)|you are now\b|from now on you|act as (chatgpt|gpt|an? (unrestricted|unfiltered))|jailbreak|\bDAN\b|developer mode|(reveal|show|print|repeat) (me )?(your|the) (system )?(prompt|instructions)|teacher'?s? notes/i,
  answerSeeking:
    /\b((give|tell|show|send|write|share) me (the |a |an )?(final |full |complete |whole |exact |correct )?(answer|solution|answers|solutions|code|essay|working)|(just|only) (the )?(answer|solution)|solve (it|this|these|the (whole|entire|full))|do (it|this|my (homework|assignment)) for me|write (the|my|an?|this) (essay|report|answer|program|code)|what('?s| is) the (final |correct )?answer|full solution|complete solution|step[- ]by[- ]step solution|answer key)\b/i,
  examStyle:
    /(\bQ\.?\s?\d|\bquestion\s?\d|\(\s?\d+\s?marks?\s?\)|\b\d+\s?marks\b|\b(calculate|determine|find|derive|evaluate|compute|show that|prove that)\b)/i,
  attempt:
    /\b(i (tried|got|think|did|calculated|used|applied|assumed|wrote|drew|took|substituted|found)|i'?m getting|i am getting|my (answer|attempt|working|approach|solution|result)|here'?s (what|my)|so far i)\b/i,
  concept: /\?|\b(what is|what are|why|how (does|do|is)|explain|difference between|meaning of|define)\b/i,
} as const;

/** Keyword labels. Cheap, offline, deliberately conservative. */
export function heuristicLabels(text: string): Labels {
  const t = text.trim();
  const distress = patterns.distressHigh.test(t)
    ? "high"
    : patterns.distressLow.test(t)
      ? "low"
      : "none";
  const instructionOverride = patterns.override.test(t);
  const hasEquation = /[=]\s*-?\d/.test(t);
  const attempted = patterns.attempt.test(t) || (hasEquation && t.length > 40);
  const sharesSolution = attempted && t.length > 200 && (t.match(/=/g)?.length ?? 0) >= 2;
  const answerSeeking = patterns.answerSeeking.test(t);
  const pasted = !attempted && t.length > 280 && patterns.examStyle.test(t);

  let intent: Intent = patterns.concept.test(t) ? "concept_question" : "off_topic";
  if (pasted) intent = "pasted_question";
  if (answerSeeking) intent = "answer_seeking";
  if (distress !== "none") intent = "distress";
  // Short follow-ups ("ok", "thanks", "I got 25 kJ") are part of the problem, not off-topic.
  if (intent === "off_topic" && (attempted || t.length < 40)) intent = "concept_question";

  return { intent, attempted, sharesSolution, instructionOverride, distress, topic: "" };
}

const distressRank = { none: 0, low: 1, high: 2 } as const;

/**
 * Combine the model's labels with the heuristic. The model decides in general
 * (it sees the conversation); the heuristic can only raise safety signals:
 * distress, instruction overrides and an explicit "give me the answer".
 */
export function mergeLabels(model: Labels | null, heuristic: Labels): Labels {
  if (!model) return heuristic;
  const distress =
    distressRank[heuristic.distress] > distressRank[model.distress] ? heuristic.distress : model.distress;
  let intent = model.intent;
  if (heuristic.intent === "answer_seeking" && intent !== "distress") intent = "answer_seeking";
  if (distress === "high") intent = "distress";
  return {
    ...model,
    intent,
    distress,
    instructionOverride: model.instructionOverride || heuristic.instructionOverride,
    topic: model.topic.trim().slice(0, 80),
  };
}

/** Intents that count towards the repeated answer-seeking flag. */
export function isAnswerSeeking(intent: Intent | null | undefined) {
  return intent === "answer_seeking" || intent === "pasted_question";
}
