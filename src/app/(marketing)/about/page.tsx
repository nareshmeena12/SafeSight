import { HandHeart, Scale, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand } from "@/components/marketing/cta-band";
import { Section, SectionHead } from "@/components/marketing/landing/section";
import { team } from "@/components/marketing/team";

export const metadata: Metadata = {
  title: "About",
  description:
    "Why we are building SafeSight: an AI tutor that coaches students instead of doing their work, built at IIT Mandi.",
};

const principles = [
  {
    Icon: HandHeart,
    title: "Guide, don't guard",
    body: "Bans don't work when every student has a phone. A tutor that is genuinely useful for coursework does, so that is what we build.",
  },
  {
    Icon: Scale,
    title: "Evidence, not verdicts",
    body: "AI-text detectors guess, and honest students pay for wrong guesses. SafeSight shows how work was made. Teachers decide what it means.",
  },
  {
    Icon: UserRound,
    title: "Students see their own data",
    body: "Everything a teacher can see about a student, the student can see too. Teachers get summaries by default, not chat logs.",
  },
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export default function AboutPage() {
  return (
    <>
      <header className="page-head">
        <div className="glow" aria-hidden="true" />
        <div className="wrap">
          <p className="eyebrow rise">About SafeSight</p>
          <h1 className="h-page rise" style={{ animationDelay: "80ms" }}>
            We want AI to make students <em>think harder,</em> not less.
          </h1>
          <p className="page-lead rise" style={{ animationDelay: "160ms" }}>
            SafeSight gives every student an AI that makes them think, and every teacher a clear
            view of how AI is used in their class.
          </p>
        </div>
      </header>

      <Section id="story" labelledBy="story-title">
        <div className="wrap split">
          <SectionHead
            className="rv"
            align="left"
            eyebrow="Our story"
            titleId="story-title"
            title={
              <>
                It started with <em>our own assignments.</em>
              </>
            }
          />
          <div className="prose rv">
            <p>
              We are engineering students. We have watched classmates paste an assignment into a
              chatbot and submit whatever comes back. They pass the course, but they skip the
              learning the assignment was there for.
            </p>
            <p>
              Teachers can&apos;t see any of this. Banning AI doesn&apos;t work, because every
              student has a phone. AI-text detectors are unreliable and accuse honest students, so
              teachers stop trusting them.
            </p>
            <p>
              Meanwhile fast open models have become cheap enough that a personal tutor for every
              student is affordable for an Indian college for the first time.
            </p>
            <p>
              So we are building the tutor we wish we had: <strong>Sage</strong> coaches with
              hints and questions instead of handing over answers, and follows the rule the
              teacher sets for each assignment. <strong>Lens</strong> answers a teacher&apos;s
              questions about their class in plain English. <strong>Trace</strong> shows how a
              piece of writing was made, so a conversation can start from evidence instead of
              suspicion.
            </p>
          </div>
        </div>
      </Section>

      <Section id="principles" labelledBy="principles-title">
        <div className="wrap">
          <SectionHead
            className="rv"
            eyebrow="What we believe"
            titleId="principles-title"
            title={
              <>
                Three ideas <em>behind every screen.</em>
              </>
            }
          />
          <div className="principles rv">
            {principles.map(({ Icon, title, body }, i) => (
              <article
                key={title}
                className="card principle rc"
                style={{ transitionDelay: `${80 + i * 100}ms` }}
              >
                <span className="pv-ic">
                  <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
                </span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </Section>

      <Section id="different" labelledBy="different-title">
        <div className="wrap split">
          <SectionHead
            className="rv"
            align="left"
            eyebrow="Why it's different"
            titleId="different-title"
            title={
              <>
                A tool students choose, <em>not one that watches them.</em>
              </>
            }
          />
          <div className="prose rv">
            <p>
              Most products in this space sell monitoring and filtering to schools, on devices the
              school controls. They watch students.
            </p>
            <p>
              SafeSight is built for Indian colleges and coaching institutes, and it works the
              other way round. Students use Sage because it helps: it knows their course notes,
              the assignment and where they are stuck. The teacher&apos;s view comes from that
              use, not from surveillance.
            </p>
            <ul>
              <li>Teachers see summaries and scores by default. Full chats open only for flagged items, or when a student shares one.</li>
              <li>Live Lab Mode runs only during announced exams on college lab PCs, and switches off when the session ends.</li>
              <li>Student data is never used to train AI models.</li>
            </ul>
            <p>
              Read the details in plain English in our <Link href="/privacy">privacy policy</Link>.
            </p>
          </div>
        </div>
      </Section>

      <Section id="team" labelledBy="team-title">
        <div className="wrap">
          <SectionHead
            className="rv"
            align="left"
            eyebrow="Team"
            titleId="team-title"
            title={
              <>
                Built at IIT Mandi, <em>made in India.</em>
              </>
            }
            lead="We are a small student team. We are starting with departments at our own college, and we are looking for professors who want to try SafeSight in one course next semester."
          />
          <ul className="team rv" style={{ padding: 0, listStyle: "none" }}>
            {team.map((member, i) => (
              <li
                key={member.name}
                className="card member rc"
                style={{ transitionDelay: `${80 + i * 80}ms` }}
              >
                <span className="initials" aria-hidden="true">
                  {initials(member.name)}
                </span>
                <div>
                  <b>{member.name}</b>
                  <span>{member.role}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
