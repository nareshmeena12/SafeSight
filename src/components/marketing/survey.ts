/**
 * Survey results shown on the landing page ("The problem").
 *
 * Never invent these (CLAUDE.md). While a value is `null` the page shows a
 * `[XX]%` or `[N]` placeholder; fill in real numbers once the student and
 * professor surveys (PLAN.md §14) are in.
 */
export const survey: {
  /** % of students who use AI for assignments every week. */
  weeklyUse: number | null;
  /** % of students who feel they learn less when AI does the work. */
  learnLess: number | null;
  /** % of professors with no view into how AI is used in their course. */
  noView: number | null;
  /** Number of students surveyed. */
  students: number | null;
  /** Number of professors surveyed. */
  professors: number | null;
} = {
  weeklyUse: null,
  learnLess: null,
  noView: null,
  students: null,
  professors: null,
};
