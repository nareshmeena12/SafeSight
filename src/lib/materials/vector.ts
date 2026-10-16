/** Dimensions of material_chunks.embedding. Another size needs a migration. */
export const EMBEDDING_DIMENSIONS = 1024;

/** pgvector's text format, checked against material_chunks.embedding's size. */
export function toPgVector(embedding: number[]): string {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `The embedding model returned ${embedding.length} dimensions; material_chunks needs ${EMBEDDING_DIMENSIONS}. Use a 1024-dimension model such as BAAI/bge-m3, or add a migration for the new size.`,
    );
  }
  return `[${embedding.join(",")}]`;
}
