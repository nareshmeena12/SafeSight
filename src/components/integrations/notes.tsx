import { CheckCircle2, CircleAlert } from "lucide-react";

/** Inline form feedback in the app style (the auth FormMessage is styled only inside the site). */
export function ErrorNote({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex gap-2 rounded-md bg-destructive/10 px-4 py-3 text-small text-destructive">
      <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
      {message}
    </p>
  );
}

export function SuccessNote({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="status" className="flex gap-2 rounded-md bg-primary-soft px-4 py-3 text-small text-foreground">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={1.5} aria-hidden="true" />
      {message}
    </p>
  );
}
