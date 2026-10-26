/**
 * The guided setup checklist on a new course: syllabus → notes → first
 * assignment → invite students. Pure: the course page passes the counts.
 */

export type SetupProgress = {
  topics: number;
  notes: number;
  assignments: number;
  students: number;
  invites: number;
};

export type SetupStep = {
  key: "syllabus" | "notes" | "assignment" | "students";
  title: string;
  description: string;
  done: boolean;
  href: string;
  action: string;
};

export function setupSteps(courseId: string, p: SetupProgress): SetupStep[] {
  const base = `/teacher/courses/${courseId}`;
  return [
    {
      key: "syllabus",
      title: "Add the syllabus",
      description: p.topics
        ? `${p.topics} ${p.topics === 1 ? "topic" : "topics"} in the topic map.`
        : "Upload or paste it. SafeSight reads the units, topics and course outcomes for you to check.",
      done: p.topics > 0,
      href: `${base}/setup`,
      action: p.topics ? "Open topic map" : "Add syllabus",
    },
    {
      key: "notes",
      title: "Upload your notes",
      description: p.notes
        ? `${p.notes} ${p.notes === 1 ? "file" : "files"} Sage can search and cite.`
        : "Lecture notes and PDFs, so Sage explains with your material and cites the page.",
      done: p.notes > 0,
      href: `${base}/setup#notes`,
      action: "Add notes",
    },
    {
      key: "assignment",
      title: "Create the first assignment",
      description: p.assignments
        ? `${p.assignments} ${p.assignments === 1 ? "assignment" : "assignments"} set up.`
        : "Pick a suggested one from your topic map, or write your own and choose how Sage may help.",
      done: p.assignments > 0,
      href: `${base}/setup#suggestions`,
      action: "Create assignment",
    },
    {
      key: "students",
      title: "Invite your students",
      description:
        p.students || p.invites
          ? `${p.students} joined${p.invites ? `, ${p.invites} invited` : ""}.`
          : "Import your class list from a CSV file, or share the join code.",
      done: p.students > 0 || p.invites > 0,
      href: `${base}/students`,
      action: "Invite students",
    },
  ];
}

/** Steps finished, out of four. */
export function setupDone(steps: SetupStep[]) {
  return steps.filter((s) => s.done).length;
}
