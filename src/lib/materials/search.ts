import "server-only";
import { embed } from "ai";
import { embeddingModel } from "@/lib/ai/provider";
import { createAdminClient } from "@/lib/supabase/admin";
import { toPgVector } from "./vector";

export type MaterialPassage = {
  materialId: string;
  title: string;
  page: number | null;
  content: string;
};

const EXCERPT_CHARS = 1500;

/**
 * search_course_material: hybrid search (keywords, plus vectors when an
 * embedding model is configured) over one course's ready materials. The
 * caller must already have checked that the user belongs to the course.
 */
export async function searchCourseMaterial(courseId: string, query: string, limit = 4): Promise<MaterialPassage[]> {
  let embedding: string | null = null;
  const model = embeddingModel();
  if (model) {
    try {
      const result = await embed({ model, value: query, maxRetries: 1, abortSignal: AbortSignal.timeout(8_000) });
      embedding = toPgVector(result.embedding);
    } catch (error) {
      console.warn("search_course_material: embedding failed, using keywords only:", error instanceof Error ? error.message : error);
    }
  }

  const { data, error } = await createAdminClient().rpc("match_material_chunks", {
    p_course_id: courseId,
    p_query: query,
    p_embedding: embedding ?? undefined,
    p_match_count: limit,
  });
  if (error) throw new Error(`search_course_material: ${error.message}`);

  return (data ?? []).map((row) => ({
    materialId: row.material_id,
    title: row.title,
    page: row.page,
    content: row.content.length > EXCERPT_CHARS ? `${row.content.slice(0, EXCERPT_CHARS)}…` : row.content,
  }));
}
