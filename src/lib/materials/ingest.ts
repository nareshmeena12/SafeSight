import "server-only";
import { embedMany } from "ai";
import { extractText, getDocumentProxy } from "unpdf";
import { embeddingModel } from "@/lib/ai/provider";
import { createAdminClient } from "@/lib/supabase/admin";
import { chunkPages } from "./chunk";
import { MATERIALS_BUCKET, MAX_PDF_BYTES } from "./constants";
import { toPgVector } from "./vector";

const EMBED_BATCH = 32;
const INSERT_BATCH = 100;

export type IngestResult =
  | { status: "ready"; pages: number; chunks: number; embedded: boolean }
  | { status: "failed"; error: string };

/**
 * Reads an uploaded PDF from Storage, extracts text page by page, chunks it,
 * embeds the chunks (when an embedding model is configured) and stores them
 * in material_chunks. Without an embedding model, chunks are still stored and
 * found by keyword search; re-run this later to add vectors.
 */
export async function ingestMaterial(materialId: string): Promise<IngestResult> {
  const admin = createAdminClient();
  const fail = async (error: string): Promise<IngestResult> => {
    await admin.from("materials").update({ status: "failed", error: error.slice(0, 500) }).eq("id", materialId);
    return { status: "failed", error };
  };

  try {
    const { data: material, error } = await admin
      .from("materials")
      .select("id, file_path")
      .eq("id", materialId)
      .single();
    if (error || !material) return fail("We couldn't find this material.");

    const { data: file, error: downloadError } = await admin.storage.from(MATERIALS_BUCKET).download(material.file_path);
    if (downloadError || !file) return fail("We couldn't read the uploaded file. Try uploading it again.");
    if (file.size > MAX_PDF_BYTES) return fail("This PDF is larger than 25 MB. Try splitting it into smaller files.");

    let pages: string[];
    try {
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
      ({ text: pages } = await extractText(pdf, { mergePages: false }));
    } catch {
      return fail("This file doesn't look like a readable PDF.");
    }

    const chunks = chunkPages(pages);
    if (!chunks.length) {
      return fail("We couldn't find any text in this PDF. Scanned pages need to be run through text recognition (OCR) first.");
    }

    const model = embeddingModel();
    let vectors: (string | null)[] = chunks.map(() => null);
    if (model) {
      vectors = [];
      for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
        const { embeddings } = await embedMany({
          model,
          values: chunks.slice(i, i + EMBED_BATCH).map((c) => c.content),
          maxRetries: 2,
        });
        vectors.push(...embeddings.map(toPgVector));
      }
    }

    await admin.from("material_chunks").delete().eq("material_id", materialId);
    const rows = chunks.map((c, i) => ({
      material_id: materialId,
      page: c.page,
      content: c.content,
      embedding: vectors[i],
    }));
    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      const { error: insertError } = await admin.from("material_chunks").insert(rows.slice(i, i + INSERT_BATCH));
      if (insertError) throw new Error(insertError.message);
    }

    await admin
      .from("materials")
      .update({ status: "ready", page_count: pages.length, error: null })
      .eq("id", materialId);
    return { status: "ready", pages: pages.length, chunks: chunks.length, embedded: Boolean(model) };
  } catch (error) {
    console.error("ingest material:", error);
    const message = error instanceof Error ? error.message : String(error);
    return fail(
      message.includes("dimensions")
        ? message
        : "Something went wrong while reading this PDF. Please try again in a minute.",
    );
  }
}
