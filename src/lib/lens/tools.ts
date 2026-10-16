import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { daysAgo } from "@/lib/teacher/dates";
import {
  courseScope,
  findStudents,
  getClassOverview,
  getStudentDetail,
  getStudentRows,
  getTopicStruggles,
  listFlags,
  type Db,
} from "@/lib/teacher/queries";

/**
 * Lens's tools (PLAN.md §4). All of them are read-only: they call the same
 * queries as the dashboard with the signed-in teacher's client, so row-level
 * security and the explicit course filters keep every answer inside the
 * teacher's own courses. draft_message and generate_quiz only shape text for
 * the teacher to review; nothing is sent or saved.
 */

const courseId = z.uuid().optional().describe("Course id from get_class_overview. Omit for all of the teacher's courses.");
const studentRef = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .describe("The student's full name as shown in other tool results, or their id.");

const uuid = z.uuid();

const notFound = { error: "No such course among this teacher's courses." } as const;

export function createLensTools(db: Db, teacherId: string, defaultCourseId: string | null) {
  const scope = (id?: string) => id ?? defaultCourseId;

  /** Resolve a name or id to exactly one student on the teacher's rosters. */
  async function resolveStudent(ref: string) {
    if (uuid.safeParse(ref).success) {
      const byId = ((await getStudentRows(db, teacherId)) ?? []).find((s) => s.id === ref);
      return byId ? { student: byId } : { error: "No student with that id in your courses." };
    }
    const matches = await findStudents(db, teacherId, ref);
    if (matches.length === 0) return { error: `No student called "${ref}" in your courses.` };
    if (matches.length > 1) {
      return { error: "More than one student matches. Ask which one.", candidates: matches.map((m) => m.name) };
    }
    return { student: matches[0] };
  }

  return {
    get_class_overview: tool({
      description:
        "Usage, active students, average Reliance Score, open flags and an 8-week trend for a course (or all courses) over the last N days. Also lists the teacher's courses with ids.",
      inputSchema: z.object({
        course_id: courseId,
        days: z.number().int().min(1).max(120).default(7).describe("How many days back to count activity."),
      }),
      execute: async ({ course_id, days }) => {
        const now = new Date();
        const o = await getClassOverview(db, teacherId, { courseId: scope(course_id), from: daysAgo(now, days), now });
        if (!o) return notFound;
        return {
          courses: o.scope,
          days,
          enrolledStudents: o.enrolledStudents,
          activeStudents: o.activeStudents,
          conversations: o.conversations,
          studentMessages: o.messages,
          answerSeekingShare: o.answerSeekingShare === null ? null : Math.round(o.answerSeekingShare * 100) / 100,
          avgRelianceScore: o.avgReliance,
          relianceWeek: o.relianceWeek,
          openFlags: o.openFlags,
          highPriorityFlags: o.highSeverityFlags,
          weeklyTrend: o.trend,
        };
      },
    }),

    get_student_summary: tool({
      description:
        "One student's Sage usage (last 30 days), weekly Reliance Score trend, topics they ask about, flags and written work. Use the name from other results.",
      inputSchema: z.object({ student: studentRef }),
      execute: async ({ student }) => {
        const found = await resolveStudent(student);
        if (!found.student) return found;
        const d = await getStudentDetail(db, teacherId, found.student.id);
        if (!d) return { error: "No such student in your courses." };
        return {
          id: d.student.id,
          name: d.student.name,
          courses: d.student.courses.map((c) => c.code || c.name),
          conversations30d: d.student.conversations,
          messages30d: d.student.messages,
          answerSeeking30d: d.student.answerSeeking,
          lastActiveAt: d.student.lastActiveAt,
          relianceScore: d.student.reliance,
          relianceTrend: d.trend.map((p) => ({ week: p.week, score: p.avgReliance })),
          topics: d.topics,
          flags: d.flags.map((f) => ({ type: f.type, severity: f.severity, status: f.status, reason: f.reason, createdAt: f.createdAt })),
          submissions: d.submissions.map((s) => ({
            assignment: s.assignmentTitle,
            submittedAt: s.submittedAt,
            pasteRatio: s.report?.pasteRatio ?? null,
          })),
        };
      },
    }),

    get_topic_struggles: tool({
      description: "Concepts the class asks Sage about most, ranked by how much students struggle (messages plus answer-seeking).",
      inputSchema: z.object({
        course_id: courseId,
        days: z.number().int().min(1).max(120).default(28),
        limit: z.number().int().min(1).max(10).default(5),
      }),
      execute: async ({ course_id, days, limit }) => {
        const id = scope(course_id);
        if (id && !(await courseScope(db, teacherId, id))) return notFound;
        const topics = await getTopicStruggles(db, { courseId: id, from: daysAgo(new Date(), days), limit });
        return { days, topics };
      },
    }),

    list_flags: tool({
      description: "Flags raised by Sage, by type and severity. Defaults to open flags.",
      inputSchema: z.object({
        course_id: courseId,
        status: z.enum(["open", "resolved", "all"]).default("open"),
        type: z.enum(["answer_seeking", "exam_mode_attempt", "instruction_override", "wellbeing"]).optional(),
        severity: z.enum(["low", "medium", "high"]).optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      execute: async ({ course_id, status, type, severity, limit }) => {
        const flags = await listFlags(db, teacherId, { courseId: scope(course_id), status, type, severity, limit });
        if (!flags) return notFound;
        return {
          flags: flags.map((f) => ({
            student: f.student.name,
            course: f.course.code || f.course.name,
            type: f.type,
            severity: f.severity,
            status: f.status,
            reason: f.reason,
            createdAt: f.createdAt,
          })),
        };
      },
    }),

    get_integrity_report: tool({
      description:
        "Trace's neutral evidence summary (paste share, active minutes, sessions) for a student's submitted work, optionally one assignment.",
      inputSchema: z.object({
        student: studentRef,
        assignment: z.string().trim().max(200).optional().describe("Part of the assignment title."),
      }),
      execute: async ({ student, assignment }) => {
        const found = await resolveStudent(student);
        if (!found.student) return found;
        const d = await getStudentDetail(db, teacherId, found.student.id);
        if (!d) return { error: "No such student in your courses." };
        const q = assignment?.toLowerCase();
        const reports = d.submissions
          .filter((s) => !q || s.assignmentTitle.toLowerCase().includes(q))
          .map((s) => ({
            assignment: s.assignmentTitle,
            submittedAt: s.submittedAt,
            report: s.report,
          }));
        return { student: d.student.name, reports };
      },
    }),

    draft_message: tool({
      description:
        "Show the teacher an email draft to a student. Write the subject and body yourself: warm, specific, encouraging, no blame. Nothing is sent; the teacher reviews and sends it.",
      inputSchema: z.object({
        student: studentRef,
        subject: z.string().trim().min(1).max(160),
        body: z.string().trim().min(1).max(4000),
      }),
      execute: async ({ student, subject, body }) => {
        const found = await resolveStudent(student);
        if (!found.student) return found;
        return { to: found.student.name, subject, body, sent: false };
      },
    }),

    generate_quiz: tool({
      description:
        "Show the teacher a 5-question multiple-choice revision quiz on the class's weakest topic. Call get_topic_struggles first, then write the questions yourself.",
      inputSchema: z.object({
        topic: z.string().trim().min(1).max(120),
        questions: z
          .array(
            z.object({
              question: z.string().trim().min(1).max(600),
              options: z.array(z.string().trim().min(1).max(300)).length(4),
              answer_index: z.number().int().min(0).max(3),
              explanation: z.string().trim().min(1).max(600),
            }),
          )
          .length(5),
      }),
      execute: async ({ topic, questions }) => ({ topic, questions }),
    }),
  };
}

export type LensTools = ReturnType<typeof createLensTools>;
