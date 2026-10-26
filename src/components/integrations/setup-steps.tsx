import { Settings2 } from "lucide-react";

/** "Not configured yet": what SafeSight needs, in plain words, for whoever runs the deployment. */
export function SetupSteps({ title, description, steps }: { title: string; description: string; steps: React.ReactNode[] }) {
  return (
    <section className="rounded-lg border border-dashed bg-surface/60 p-6" aria-label={title}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
          <Settings2 className="size-5" strokeWidth={1.5} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-title">{title}</h2>
          <p className="text-small text-muted-foreground">{description}</p>
          <ol className="mt-3 grid list-decimal gap-1 pl-5 text-small">
            {steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
