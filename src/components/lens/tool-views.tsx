"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Copy, Mail } from "lucide-react";
import type { InferUITools, UIMessage } from "ai";
import { CheckBadge } from "@/components/numbers/check-badge";
import type { CheckResult } from "@/lib/numbers/numbers";
import { RelianceBadge } from "@/components/product/reliance-badge";
import { CountBarChart, RelianceLineChart } from "@/components/teacher/charts";
import { flagTypeLabels, SeverityBadge } from "@/components/teacher/flag-meta";
import { TopicList } from "@/components/teacher/topic-list";
import { Button } from "@/components/ui/button";
import type { LensTools } from "@/lib/lens/tools";
import { formatDateTime, formatShortDate } from "@/lib/teacher/dates";
import { cn } from "@/lib/utils";

export type LensMessage = UIMessage<unknown, never, InferUITools<LensTools>>;
type Part = LensMessage["parts"][number];
type Output<K extends keyof LensTools> = InferUITools<LensTools>[K]["output"];

const toolLabels: Record<keyof LensTools, string> = {
  get_class_overview: "Looking at class activity",
  get_student_summary: "Looking up the student",
  get_topic_struggles: "Ranking topics",
  list_flags: "Checking flags",
  get_integrity_report: "Reading Trace summaries",
  get_answer_checks: "Checking answers",
  draft_message: "Drafting an email",
  generate_quiz: "Writing a quiz",
};

function Card({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border bg-surface p-4", className)}>
      {title ? <p className="mb-3 text-label text-muted-foreground">{title}</p> : null}
      {children}
    </div>
  );
}

function hasError<T>(output: T): output is Extract<T, { error: unknown }> {
  return typeof output === "object" && output !== null && "error" in output;
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard blocked: the text is on screen to select by hand.
        }
      }}
    >
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

function Overview({ o }: { o: Output<"get_class_overview"> }) {
  if (hasError(o)) return null;
  const stats = [
    { label: "Active students", value: `${o.activeStudents}/${o.enrolledStudents}` },
    { label: "Conversations", value: o.conversations },
    { label: "Avg Reliance", value: o.avgRelianceScore === null ? "—" : Math.round(o.avgRelianceScore) },
    { label: "Open flags", value: o.openFlags },
  ];
  const trend = o.weeklyTrend.map((p) => ({ label: formatShortDate(p.week), value: p.avgReliance }));
  return (
    <Card title={`Last ${o.days} ${o.days === 1 ? "day" : "days"}`}>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="text-small text-muted-foreground">{s.label}</dt>
            <dd className="font-mono text-title">{s.value}</dd>
          </div>
        ))}
      </dl>
      {trend.some((p) => p.value !== null) ? (
        <div className="mt-4">
          <p className="mb-1 text-small text-muted-foreground">Average Reliance Score by week</p>
          <RelianceLineChart data={trend} height={160} />
        </div>
      ) : null}
    </Card>
  );
}

function Topics({ o }: { o: Output<"get_topic_struggles"> }) {
  if (hasError(o) || o.topics.length === 0) return null;
  return (
    <Card title={`Struggling topics · last ${o.days} days`}>
      <CountBarChart
        title="Messages per topic"
        data={o.topics.map((t) => ({ label: t.topic, value: t.messages }))}
        height={180}
      />
      <div className="mt-4">
        <TopicList topics={o.topics} />
      </div>
    </Card>
  );
}

function Flags({ o }: { o: Output<"list_flags"> }) {
  if (hasError(o) || o.flags.length === 0) return null;
  return (
    <Card title="Flags">
      <div className="-mx-4 overflow-x-auto">
        <table className="w-full text-small">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="px-4 py-2 font-normal">Student</th>
              <th className="px-4 py-2 font-normal">Type</th>
              <th className="px-4 py-2 font-normal">Priority</th>
              <th className="hidden px-4 py-2 font-normal sm:table-cell">Raised</th>
            </tr>
          </thead>
          <tbody>
            {o.flags.map((f, i) => (
              <tr key={i} className="border-t">
                <td className="px-4 py-2">{f.student}</td>
                <td className="px-4 py-2">{flagTypeLabels[f.type]}</td>
                <td className="px-4 py-2">
                  <SeverityBadge value={f.severity} />
                </td>
                <td className="hidden px-4 py-2 text-muted-foreground sm:table-cell">{formatDateTime(f.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Link href="/teacher/flags" className="mt-3 inline-flex min-h-11 items-center text-small text-primary">
        Open the Flags page
      </Link>
    </Card>
  );
}

function Student({ o }: { o: Output<"get_student_summary"> }) {
  if (hasError(o)) return null;
  const trend = o.relianceTrend.map((p) => ({ label: formatShortDate(p.week), value: p.score }));
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/teacher/students/${o.id}`} className="text-label hover:text-primary">
          {o.name}
        </Link>
        {o.relianceScore === null ? null : <RelianceBadge score={o.relianceScore} />}
      </div>
      <p className="mt-1 text-small text-muted-foreground">
        {o.conversations30d} conversations · {o.messages30d} messages · {o.answerSeeking30d} answer-seeking (30 days)
      </p>
      {trend.some((p) => p.value !== null) ? (
        <div className="mt-3">
          <RelianceLineChart data={trend} height={140} title={`${o.name}'s Reliance Score by week`} />
        </div>
      ) : null}
    </Card>
  );
}

function Reports({ o }: { o: Output<"get_integrity_report"> }) {
  if (hasError(o) || o.reports.length === 0) return null;
  return (
    <Card title={`Trace summaries · ${o.student}`}>
      <ul className="grid gap-3">
        {o.reports.map((r, i) => (
          <li key={i}>
            <p className="text-label">{r.assignment}</p>
            <p className="text-small text-muted-foreground">
              {r.report ? r.report.summary : r.submittedAt ? "No summary yet." : "Still writing."}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AnswerChecks({ o }: { o: Output<"get_answer_checks"> }) {
  if (hasError(o) || !("rows" in o) || !o.rows) return null;
  return (
    <Card title={`Per-student numbers · ${o.assignment}`}>
      <p className="mb-3 text-small text-muted-foreground">
        <span className="font-mono text-mono">{o.answered}</span>/<span className="font-mono text-mono">{o.students}</span> answered ·{" "}
        <span className="font-mono text-mono">{o.matching}</span> match within {o.tolerancePct}%
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-small">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-3 font-normal">Student</th>
              <th className="py-2 pr-3 text-right font-normal">Expected</th>
              <th className="py-2 pr-3 font-normal">Given</th>
              <th className="py-2 font-normal">Check</th>
            </tr>
          </thead>
          <tbody>
            {o.rows.map((r) => (
              <tr key={r.student} className="border-b last:border-0">
                <td className="py-2 pr-3">{r.student}</td>
                <td className="py-2 pr-3 text-right font-mono">{r.expected ?? "—"}</td>
                <td className="py-2 pr-3 font-mono">{r.given ?? "—"}</td>
                <td className="py-2">
                  <CheckBadge result={r.check === "no answer" ? null : (r.check as CheckResult)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Draft({ o }: { o: Output<"draft_message"> }) {
  if (hasError(o)) return null;
  const text = `Subject: ${o.subject}\n\n${o.body}`;
  const mailto = `mailto:?subject=${encodeURIComponent(o.subject)}&body=${encodeURIComponent(o.body)}`;
  return (
    <Card title={`Draft email to ${o.to} · not sent`}>
      <p className="text-label">{o.subject}</p>
      <p className="mt-2 whitespace-pre-wrap">{o.body}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <CopyButton text={text} />
        <Button asChild variant="outline" size="sm">
          <a href={mailto}>
            <Mail aria-hidden="true" />
            Open in email app
          </a>
        </Button>
      </div>
    </Card>
  );
}

function Quiz({ o }: { o: Output<"generate_quiz"> }) {
  const [showAnswers, setShowAnswers] = useState(false);
  const letters = ["A", "B", "C", "D"];
  const text = [
    `Revision quiz: ${o.topic}`,
    ...o.questions.map(
      (q, i) => `\n${i + 1}. ${q.question}\n${q.options.map((opt, j) => `   ${letters[j]}. ${opt}`).join("\n")}`,
    ),
    "\nAnswers",
    ...o.questions.map((q, i) => `${i + 1}. ${letters[q.answer_index]} — ${q.explanation}`),
  ].join("\n");
  return (
    <Card title={`Revision quiz · ${o.topic}`}>
      <ol className="grid gap-4">
        {o.questions.map((q, i) => (
          <li key={i}>
            <p>
              <span className="mr-2 font-mono text-muted-foreground">{i + 1}</span>
              {q.question}
            </p>
            <ul className="mt-2 grid gap-1 pl-6">
              {q.options.map((opt, j) => (
                <li
                  key={j}
                  className={cn(
                    "rounded-sm px-2 py-1 text-small",
                    showAnswers && j === q.answer_index && "bg-primary-soft text-foreground",
                  )}
                >
                  <span className="mr-2 font-mono text-muted-foreground">{letters[j]}</span>
                  {opt}
                </li>
              ))}
            </ul>
            {showAnswers ? <p className="mt-1 pl-6 text-small text-muted-foreground">{q.explanation}</p> : null}
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setShowAnswers((v) => !v)} aria-pressed={showAnswers}>
          <ChevronDown className={cn("transition-transform duration-150", showAnswers && "rotate-180")} aria-hidden="true" />
          {showAnswers ? "Hide answers" : "Show answers"}
        </Button>
        <CopyButton text={text} label="Copy quiz" />
      </div>
    </Card>
  );
}

/** Renders one tool part of a Lens answer: progress while running, then a table, chart or draft. */
export function ToolView({ part }: { part: Part }) {
  if (!part.type.startsWith("tool-")) return null;
  const tool = part as Extract<Part, { type: `tool-${string}`; state: string }>;
  const name = tool.type.slice(5) as keyof LensTools;

  if (tool.state === "input-streaming" || tool.state === "input-available") {
    return (
      <p className="flex items-center gap-2 text-small text-muted-foreground" role="status">
        <span className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse" aria-hidden="true" />
        {toolLabels[name] ?? "Working"}…
      </p>
    );
  }
  if (tool.state === "output-error") {
    return <p className="text-small text-muted-foreground">Lens couldn&apos;t read that part of your data.</p>;
  }
  if (tool.state !== "output-available") return null;

  switch (tool.type) {
    case "tool-get_class_overview":
      return <Overview o={tool.output} />;
    case "tool-get_topic_struggles":
      return <Topics o={tool.output} />;
    case "tool-list_flags":
      return <Flags o={tool.output} />;
    case "tool-get_student_summary":
      return <Student o={tool.output} />;
    case "tool-get_integrity_report":
      return <Reports o={tool.output} />;
    case "tool-get_answer_checks":
      return <AnswerChecks o={tool.output} />;
    case "tool-draft_message":
      return <Draft o={tool.output} />;
    case "tool-generate_quiz":
      return <Quiz o={tool.output} />;
    default:
      return null;
  }
}
