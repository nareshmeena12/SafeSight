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
