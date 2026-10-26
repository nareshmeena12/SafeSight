import { z } from "zod";

/**
 * Programme outcomes (S24): limits, the editor's schema and the standard NBA
 * engineering POs a programme can start from. Pure.
 */

export const PO_LIMITS = { outcomes: 30, code: 16, title: 120, description: 800, name: 200, department: 120 } as const;

/**
 * The twelve NBA graduate attributes for undergraduate engineering
 * programmes (PO1–PO12), as most Indian universities print them. Universities
 * word them slightly differently and NBA revises them, so the editor says to
 * check them against the version in use.
 */
export const NBA_ENGINEERING_POS: { code: string; title: string; description: string }[] = [
  {
    code: "PO1",
    title: "Engineering knowledge",
    description:
      "Apply the knowledge of mathematics, science, engineering fundamentals and an engineering specialisation to the solution of complex engineering problems.",
  },
  {
    code: "PO2",
    title: "Problem analysis",
    description:
      "Identify, formulate, review research literature and analyse complex engineering problems, reaching substantiated conclusions using first principles of mathematics, natural sciences and engineering sciences.",
  },
  {
    code: "PO3",
    title: "Design and development of solutions",
    description:
      "Design solutions for complex engineering problems and design system components or processes that meet specified needs, with appropriate consideration for public health and safety and for cultural, societal and environmental concerns.",
  },
  {
    code: "PO4",
    title: "Conduct investigations of complex problems",
    description:
      "Use research-based knowledge and research methods, including design of experiments, analysis and interpretation of data and synthesis of the information, to provide valid conclusions.",
  },
  {
    code: "PO5",
    title: "Modern tool usage",
    description:
      "Create, select and apply appropriate techniques, resources and modern engineering and IT tools, including prediction and modelling, to complex engineering activities with an understanding of their limitations.",
  },
  {
    code: "PO6",
    title: "The engineer and society",
    description:
      "Apply reasoning informed by contextual knowledge to assess societal, health, safety, legal and cultural issues and the consequent responsibilities relevant to professional engineering practice.",
  },
  {
    code: "PO7",
    title: "Environment and sustainability",
    description:
      "Understand the impact of professional engineering solutions in societal and environmental contexts, and demonstrate the knowledge of, and need for, sustainable development.",
  },
  {
    code: "PO8",
    title: "Ethics",
    description: "Apply ethical principles and commit to professional ethics, responsibilities and norms of engineering practice.",
  },
  {
    code: "PO9",
    title: "Individual and team work",
    description: "Function effectively as an individual, and as a member or leader in diverse teams and in multidisciplinary settings.",
  },
  {
    code: "PO10",
    title: "Communication",
    description:
      "Communicate effectively on complex engineering activities with the engineering community and with society at large: write effective reports and design documentation, make effective presentations, and give and receive clear instructions.",
  },
  {
    code: "PO11",
    title: "Project management and finance",
    description:
      "Demonstrate knowledge and understanding of engineering and management principles and apply them to one's own work, as a member and leader in a team, to manage projects in multidisciplinary environments.",
  },
  {
    code: "PO12",
    title: "Life-long learning",
    description:
      "Recognise the need for, and have the preparation and ability to engage in, independent and life-long learning in the broadest context of technological change.",
  },
];

/** "po 3", "PSO-1", "pso.2" → "PO3", "PSO1". Anything else: no spaces, upper case. */
export function normalisePoCode(code: string): string {
  const m = code.trim().match(/^(p\s*s?\s*o)\s*[-.:]?\s*(\d{1,2})$/i);
  if (m) return `${m[1].replace(/\s+/g, "").toUpperCase()}${Number(m[2])}`;
  return code.replace(/\s+/g, "").toUpperCase().slice(0, PO_LIMITS.code);
}

export function poKind(code: string): "po" | "pso" {
  return /^PSO/i.test(code) ? "pso" : "po";
}

/** POs first (PO1, PO2 … PO12), then PSOs, each in number order; others keep their place at the end. */
export function sortProgramOutcomes<T extends { code: string; kind: "po" | "pso" }>(outcomes: T[]): T[] {
  const num = (code: string) => Number(code.match(/(\d+)$/)?.[1] ?? 999);
  return [...outcomes].sort((a, b) => (a.kind === b.kind ? num(a.code) - num(b.code) : a.kind === "po" ? -1 : 1));
}

export const programSchema = z.object({
  name: z.string().trim().min(2, "Give the programme a name.").max(PO_LIMITS.name, "Keep the name under 200 characters."),
  department: z.string().trim().max(PO_LIMITS.department, "Keep the department under 120 characters."),
});

export const programOutcomesSchema = z
  .array(
    z.object({
      id: z.uuid().optional(),
      code: z
        .string()
        .trim()
        .min(1, "Every outcome needs a code (PO1, PSO1 …).")
        .max(PO_LIMITS.code)
        .transform(normalisePoCode),
      title: z.string().trim().max(PO_LIMITS.title, "Keep titles under 120 characters."),
      description: z
        .string()
        .trim()
        .min(1, "Every outcome needs a statement.")
        .max(PO_LIMITS.description, "Keep each statement under 800 characters."),
    }),
  )
  .max(PO_LIMITS.outcomes, `Keep it to ${PO_LIMITS.outcomes} outcomes.`)
  .superRefine((rows, ctx) => {
    const seen = new Set<string>();
    for (const r of rows) {
      if (seen.has(r.code)) ctx.addIssue({ code: "custom", message: `${r.code} appears twice. Each code once, please.` });
      seen.add(r.code);
    }
  });

export type ProgramOutcomeInput = z.infer<typeof programOutcomesSchema>[number];
