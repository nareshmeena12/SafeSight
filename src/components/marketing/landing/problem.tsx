import { ChartNoAxesColumn } from "lucide-react";
import { survey } from "../survey";
import { CountUp } from "./count-up";
import { Section, SectionHead } from "./section";

function StatNumber({ value }: { value: number | null }) {
  if (value === null || value <= 0) return <p className="stat-num is-ph">[XX]%</p>;
  return (
    <p className="stat-num">
      <CountUp value={value} suffix="%" />
    </p>
  );
}

const count = (n: number | null) => (n && n > 0 ? n.toLocaleString("en-IN") : "[N]");

export function Problem() {
  const stats = [
    {
      value: survey.weeklyUse,
      label: "of students use AI for their assignments every week.",
      source: `From our survey of ${count(survey.students)} students`,
    },
    {
      value: survey.learnLess,
      label: "feel they learn less when AI does the work for them.",
      source: `From our survey of ${count(survey.students)} students`,
    },
    {
      value: survey.noView,
      label: "of professors have no view into how AI is used in their course.",
      source: `From our survey of ${count(survey.professors)} professors`,
    },
  ];

  return (
    <Section id="problem" labelledBy="problem-title">
      <div className="wrap">
        <SectionHead
          className="rv"
          eyebrow="The problem"
          titleId="problem-title"
          title={
            <>
              Students are using AI. <em>Most aren&apos;t learning from it.</em>
            </>
          }
        />
        <div className="stats rv">
          {stats.map((stat, i) => (
            <article
              key={stat.label}
              className="card stat rc"
              style={{ transitionDelay: `${80 + i * 100}ms` }}
            >
              <StatNumber value={stat.value} />
              <p className="stat-label">{stat.label}</p>
              <p className="stat-src">
                <ChartNoAxesColumn size={14} strokeWidth={1.5} aria-hidden="true" />
                {stat.source}
              </p>
            </article>
          ))}
        </div>
      </div>
    </Section>
  );
}
