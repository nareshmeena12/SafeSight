"use client";

import { ErrorView } from "@/components/app/error-view";

export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorView error={error} retry={retry} home="/admin" />;
}
