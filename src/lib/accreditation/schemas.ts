import { z } from "zod";
import { questionsSchema } from "./marks";
import { programOutcomesSchema, programSchema } from "./outcomes";

/** zod schemas for the accreditation forms (S24). Every server action re-checks its input with these. */

const weight = z.coerce.number().min(0, "Weights can't be negative.").max(10, "Keep weights between 0 and 10.");

export const outcomesFormSchema = z.object({
  courseId: z.uuid(),
  text: z.string().max(20_000),
});

export const linkProgramSchema = z.object({
  courseId: z.uuid(),
  programId: z.union([z.uuid(), z.literal("")]),
});

export const matrixSchema = z.object({
  courseId: z.uuid(),
  cells: z
    .array(
      z.object({
        outcomeId: z.uuid(),
        programOutcomeId: z.uuid(),
        level: z.number().int().min(1).max(3),
        justification: z.string().trim().max(400).optional().default(""),
      }),
    )
    .max(20 * 30),
});

export const createProgramSchema = programSchema.extend({
  template: z.enum(["nba", "empty"]),
});

export const saveProgramSchema = programSchema.extend({
  programId: z.uuid(),
  outcomes: programOutcomesSchema,
});

export const assignmentMappingSchema = z.object({
  courseId: z.uuid(),
  assignmentId: z.uuid(),
  include: z.boolean(),
  outcomeIds: z.array(z.uuid()).max(20),
  weight,
});

export const testSchema = z.object({
  courseId: z.uuid(),
  testId: z.uuid().optional(),
  title: z.string().trim().min(1, "Give the test a name.").max(200, "Keep the name under 200 characters."),
  heldOn: z.union([z.iso.date(), z.literal("")]).optional().default(""),
  weight,
  questions: questionsSchema,
});

export const importMarksSchema = z.object({
  courseId: z.uuid(),
  testId: z.uuid(),
  text: z.string().min(1, "Paste or choose a file first.").max(500_000, "That file is too large. Keep it under 500 KB."),
});

export const topicOutcomesSchema = z.object({
  courseId: z.uuid(),
  pairs: z.array(z.object({ topicId: z.uuid(), outcomeId: z.uuid() })).max(3000),
});

const pct = (label: string) =>
  z.coerce
    .number({ message: `${label} must be a number.` })
    .gt(0, `${label} must be more than 0.`)
    .max(100, `${label} can be at most 100.`);

export const settingsSchema = z
  .object({
    courseId: z.uuid(),
    targetPct: pct("The target score"),
    level1Pct: pct("Level 1"),
    level2Pct: pct("Level 2"),
    level3Pct: pct("Level 3"),
    targetLevel: z.coerce.number().min(1, "The target level is between 1 and 3.").max(3, "The target level is between 1 and 3."),
    practiceWeight: weight,
    mockWeight: weight,
    academicYear: z.string().trim().max(40, "Keep the academic year short, like 2026–27."),
  })
  .refine((s) => s.level1Pct <= s.level2Pct && s.level2Pct <= s.level3Pct, {
    message: "Level 1 needs the lowest share of students and level 3 the highest.",
    path: ["level3Pct"],
  });
