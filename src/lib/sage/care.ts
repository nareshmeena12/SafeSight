import type { CareData } from "./types";

/**
 * Support contacts Sage shares when a student may be in distress (PLAN.md §9).
 * The college counselling contact comes from SAGE_COUNSELLING_CONTACT until
 * institutions have their own setting. Tele-MANAS is India's national
 * mental-health helpline (free, 24x7, 14416 or 1-800-891-4416).
 */
export function careData(): CareData {
  return {
    counselling:
      process.env.SAGE_COUNSELLING_CONTACT?.trim() ||
      "your college's student counselling centre (ask your mentor or the student welfare office)",
    helpline: "Tele-MANAS, free and available 24x7",
    helplineNumber: "14416",
  };
}

/** A fixed, caring reply for when the model can't answer a student in distress. */
export function careReply(care: CareData): string {
  return `I'm really glad you told me. What you're feeling matters, and you don't have to handle it alone.\n\nPlease reach out to ${care.counselling}, or call ${care.helpline} on **${care.helplineNumber}** — they're kind, it's free, and you can talk in your own language. If you might be in danger right now, please tell someone near you or call **112**.\n\nThe assignment can wait. Would you like to tell me a little about what's going on?`;
}
