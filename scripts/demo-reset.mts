/**
 * Gets the class ready for (another run of) the demo in PLAN.md §12.
 *
 *   pnpm demo:reset               clear Riya's chats, Trace work and flags on problem set 3
 *   pnpm demo:reset --live-setup  also delete problem set 3 and the ME201 notes, so the
 *                                 teacher can create and upload them live (demo step 2)
 *
 * Everything else (the four weeks from `pnpm demo:data`) stays. Weekly
 * metrics for the last two weeks are recomputed at the end.
 */
import {
  COURSE,
  MATERIALS_BUCKET,
  PS3_TITLE,
  RIYA_EMAIL,
  db,
  deleteIn,
  demoStudents,
  fail,
  refreshMetrics,
} from "./demo/common";

const liveSetup = process.argv.includes("--live-setup");

const riyaId = (await demoStudents()).get(RIYA_EMAIL);
if (!riyaId) {
  console.error("Riya's account is missing. Run `pnpm seed` first.");
  process.exit(1);
}

const { data: ps3, error } = await db
  .from("assignments")
  .select("id")
  .eq("course_id", COURSE.thermo)
  .ilike("title", PS3_TITLE);
fail("assignments", error);
const ps3Ids = (ps3 ?? []).map((a) => a.id);

// Riya's chats on problem set 3, and the flags that point into them.
const { data: chats } = await db
  .from("conversations")
  .select("id")
  .eq("student_id", riyaId)
  .in("assignment_id", ps3Ids);
const chatIds = (chats ?? []).map((c) => c.id);
const { data: msgs } = chatIds.length
  ? await db.from("messages").select("id").in("conversation_id", chatIds)
  : { data: [] };
await deleteIn("flags", "message_id", (msgs ?? []).map((m) => m.id));
await deleteIn("conversations", "id", chatIds);

const { data: work } = await db
  .from("submissions")
  .select("id")
  .eq("student_id", riyaId)
  .in("assignment_id", ps3Ids);
await deleteIn("submissions", "id", (work ?? []).map((s) => s.id));

console.log(`Riya: removed ${chatIds.length} chat(s), ${work?.length ?? 0} Trace submission(s) and their flags on ${PS3_TITLE}.`);

if (liveSetup) {
  await deleteIn("assignments", "id", ps3Ids);
  const { data: materials } = await db.from("materials").select("id, file_path").eq("course_id", COURSE.thermo);
  if (materials?.length) {
    await db.storage.from(MATERIALS_BUCKET).remove(materials.map((m) => m.file_path));
    await deleteIn("materials", "id", materials.map((m) => m.id));
  }
  console.log(`Live setup: deleted ${ps3Ids.length} "${PS3_TITLE}" assignment(s) and ${materials?.length ?? 0} ME201 material(s).`);
  console.log("Create the assignment (Learn mode) and upload public/demo/me201-thermodynamics-notes.pdf on stage.");
}

const rows = await refreshMetrics(2);
console.log(`weekly_metrics: ${rows} rows for the last 2 weeks.`);
