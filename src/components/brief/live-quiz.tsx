"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Check, CircleAlert, Eye, EyeOff, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TeacherQuizView } from "@/lib/brief/quiz";

const letters = ["A", "B", "C", "D"];
const POLL_MS = 3000;

/** One question's answers as a bar per option. Counts only; who chose what is never shown. */
function OptionBars({ options, counts, answer, reveal }: { options: string[]; counts: number[]; answer: number; reveal: boolean }) {
  const data = options.map((o, i) => ({ label: letters[i], option: o, value: counts[i] ?? 0 }));
  return (
    <figure className="m-0 grid gap-2">
      <div aria-hidden="true" style={{ height: 32 + options.length * 36 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 0 }}>
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="label"
              width={28}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 14, fill: "var(--ss-text-muted)" }}
            />
            <Bar dataKey="value" radius={[0, 6, 6, 0]} isAnimationActive={false} minPointSize={2}>
              {data.map((d, i) => (
                <Cell key={d.label} fill={reveal && i === answer ? "var(--ss-good)" : "var(--ss-primary)"} fillOpacity={reveal && i !== answer ? 0.45 : 1} />
              ))}
              <LabelList dataKey="value" position="right" style={{ fontSize: 14, fill: "var(--ss-text)", fontFamily: "var(--font-geist-mono)" }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="grid gap-1 text-small">
        {options.map((o, i) => (
          <li key={i} className="flex min-w-0 items-start gap-2">
            <span className="font-mono text-mono text-muted-foreground">{letters[i]}</span>
            <span className="min-w-0 break-words">{o}</span>
            <span className="sr-only">: {counts[i] ?? 0} answers</span>
            {reveal && i === answer ? <Check className="size-4 shrink-0 text-good" strokeWidth={1.5} aria-label="Correct" /> : null}
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** The live results screen: big code, how many joined, a bar chart per question, polled every 3 s while open. */
export function LiveQuiz({ initial, joinUrl }: { initial: TeacherQuizView; joinUrl: string }) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [reveal, setReveal] = useState(!initial.open);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!view.open) return;
    const timer = setInterval(async () => {
      if (document.hidden) return;
      const res = await fetch(`/api/brief/quiz/${view.id}`, { cache: "no-store" }).catch(() => null);
      if (res?.ok) setView(await res.json());
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [view.id, view.open]);

  async function close() {
    setClosing(true);
    setError(null);
    const res = await fetch(`/api/brief/quiz/${view.id}`, { method: "PATCH" }).catch(() => null);
    if (!res?.ok) {
      setError("That didn't save. Please try again.");
      setClosing(false);
      return;
    }
    setView((v) => ({ ...v, open: false }));
    setReveal(true);
    setClosing(false);
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      <section aria-label="How to join" className="grid gap-4 rounded-lg border bg-surface p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:p-6">
        <div>
          <p className="text-label text-muted-foreground">{view.open ? "Code" : "Quiz closed"}</p>
          <p id="live-code" className="font-mono text-[clamp(2.5rem,10vw,4.5rem)] leading-none tracking-widest">{view.code}</p>
        </div>
        <p className="text-muted-foreground">
          {view.open ? (
            <>
              On your phone, open <span className="font-mono text-mono text-foreground break-all">{joinUrl}</span> and type the code.
            </>
          ) : (
            "Students can now see the right answers on their phones."
          )}
        </p>
        <p className="font-mono text-mono-stat" aria-live="polite">
          {view.participants}
          <span className="font-sans text-small text-muted-foreground"> of {view.enrolled} joined</span>
        </p>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" aria-pressed={reveal} onClick={() => setReveal((r) => !r)}>
          {reveal ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          {reveal ? "Hide answers" : "Show answers"}
        </Button>
        {view.open ? (
          <Button type="button" onClick={close} disabled={closing}>
            <Square aria-hidden="true" />
            {closing ? "Closing…" : "Close quiz"}
          </Button>
        ) : null}
        {error ? (
          <p role="alert" className="flex items-center gap-2 text-small text-destructive">
            <CircleAlert className="size-4" strokeWidth={1.5} aria-hidden="true" />
            {error}
          </p>
        ) : null}
      </div>

      <ol className="grid gap-4 lg:grid-cols-2">
        {view.questions.map((q, i) => (
          <li key={i} className="grid content-start gap-3 rounded-lg border bg-surface p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <p className="flex gap-2">
                <span className="font-mono text-mono text-muted-foreground">{i + 1}</span>
                <span className="min-w-0">{q.question}</span>
              </p>
              <p className="shrink-0 text-small text-muted-foreground">
                <span className="font-mono text-mono text-foreground">{view.results[i]?.answered ?? 0}</span>{" "}
                {(view.results[i]?.answered ?? 0) === 1 ? "answer" : "answers"}
              </p>
            </div>
            <OptionBars options={q.options} counts={view.results[i]?.counts ?? []} answer={q.answer} reveal={reveal} />
            {reveal ? <p className="text-small text-muted-foreground">{q.explanation}</p> : null}
          </li>
        ))}
      </ol>
      <p className="text-small text-muted-foreground">Answers are anonymous: you see how many chose each option, not who.</p>
    </div>
  );
}
