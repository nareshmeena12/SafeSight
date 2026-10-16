/** Private Storage bucket for course PDFs, laid out as <course_id>/<file>.pdf. */
export const MATERIALS_BUCKET = "course-materials";
/** Matches the bucket's file_size_limit (migration 20261018040000). */
export const MAX_PDF_BYTES = 25 * 1024 * 1024;
