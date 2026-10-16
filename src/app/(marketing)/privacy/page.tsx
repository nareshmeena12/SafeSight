import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand } from "@/components/marketing/cta-band";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What SafeSight stores, who can see it, how long we keep it, and what we never do. In plain English.",
};

const sections = [
  { id: "short", title: "The short version" },
  { id: "collect", title: "What we collect" },
  { id: "who", title: "Who sees what" },
  { id: "ai", title: "How we use AI" },
  { id: "keep", title: "How long we keep it" },
  { id: "choices", title: "Your choices" },
  { id: "security", title: "Keeping it safe" },
  { id: "contact", title: "Changes and contact" },
];

export default function PrivacyPage() {
  return (
    <>
      <header className="page-head">
        <div className="glow" aria-hidden="true" />
        <div className="wrap">
          <p className="eyebrow rise">Privacy policy</p>
          <h1 className="h-page rise" style={{ animationDelay: "80ms" }}>
            Built to guide students, <em>not to watch them.</em>
          </h1>
          <p className="page-lead rise" style={{ animationDelay: "160ms" }}>
            Privacy is part of the product, not an afterthought. This page explains what SafeSight
            stores, who can see it and what we never do, in plain words.
          </p>
          <p className="page-meta rise" style={{ animationDelay: "220ms" }}>
            Last updated 16 October 2026
          </p>
        </div>
      </header>

      <div className="sec">
        <div className="wrap split">
          <nav className="toc-nav" aria-label="On this page">
            <p className="eyebrow">On this page</p>
            <ul className="toc">
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}>{s.title}</a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="policy prose">
            <section id="short" aria-labelledby="short-title">
              <h2 id="short-title">The short version</h2>
              <ul>
                <li>Teachers see summaries and scores by default, not your chats.</li>
                <li>Students can see all of their own data, including everything a teacher can see about them.</li>
                <li>Student work and conversations are never used to train any AI model.</li>
                <li>Live Lab Mode records activity only during an announced exam session on a college lab PC, and stops when the session ends.</li>
                <li>SafeSight never labels anyone as dishonest. It shows neutral evidence, and teachers decide.</li>
                <li>Chats and writing events are deleted after 180 days. Only aggregate numbers are kept.</li>
              </ul>
            </section>

            <section id="collect" aria-labelledby="collect-title">
              <h2 id="collect-title">What we collect</h2>
              <h3>Your account</h3>
              <p>
                Your name, email address and role (student or teacher), and the institution and
                courses you belong to.
              </p>
              <h3>Conversations with Sage</h3>
              <p>
                The messages you send Sage and its replies, saved with the assignment they belong
                to. Each message also gets a short label (for example &ldquo;concept
                question&rdquo;) and the hint step Sage used, so the class dashboard can show
                patterns.
              </p>
              <h3>Writing in Trace</h3>
              <p>
                When you write an assignment in the Trace editor, it records how the text was
                made: typing, pasting, deleting, and when the editor was in focus, with times and
                sizes. It also stores what you submit. Trace runs only inside its own editor; it
                does not see anything else on your device.
              </p>
              <h3>Live Lab Mode</h3>
              <p>
                During an announced lab exam, the SafeSight Lab extension on a college PC records
                tab switches, copy and paste, attempts to open blocked sites, idle time and a
                regular heartbeat for that seat. Outside a session it records nothing.
              </p>
              <h3>Course material</h3>
              <p>
                Notes and PDFs a teacher uploads, split into searchable passages so Sage can cite
                them.
              </p>
              <h3>Pilot requests</h3>
              <p>
                If you request a pilot on our website, we store your name, role, institution and
                email so we can plan the pilot with you. We use it for nothing else.
              </p>
            </section>

            <section id="who" aria-labelledby="who-title">
              <h2 id="who-title">Who sees what</h2>
              <table className="who">
                <thead>
                  <tr>
                    <th scope="col">Who</th>
                    <th scope="col">What they can see</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">A student</th>
                    <td>
                      All of their own data: every chat, score, flag about them and replay of
                      their writing. Never another student&apos;s.
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Their teacher</th>
                    <td>
                      For their own courses only: usage summaries, Reliance Scores, topics the
                      class asks about, flags and Trace evidence summaries. The full text of a
                      chat opens only for a flagged item, or when the student chooses to share
                      it.
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Other teachers</th>
                    <td>Nothing about students outside their own courses.</td>
                  </tr>
                  <tr>
                    <th scope="row">The SafeSight team</th>
                    <td>
                      Only what we need to run and fix the service, and never to sell or
                      advertise.
                    </td>
                  </tr>
                </tbody>
              </table>
              <p>
                If a chat shows signs that a student is in distress, Sage responds with care,
                shares the college counselling contact and a helpline, and raises a private flag
                for the teacher. Students don&apos;t see that flag on their own list, so it can
                be followed up gently.
              </p>
            </section>

            <section id="ai" aria-labelledby="ai-title">
              <h2 id="ai-title">How we use AI</h2>
              <p>
                Sage, Lens and Trace run on large language models that we call from our own
                servers through a model provider&apos;s API. Your browser never talks to the model
                directly, and our keys never leave the server.
              </p>
              <p>
                <strong>Student data is never used to train AI models</strong>, by us or by the
                provider. For each pilot we share the exact model and hosting region in writing
                before it starts.
              </p>
              <p>
                The AI never decides anything about a student. Trace writes neutral evidence such
                as &ldquo;one paste at 14:32 made up 78% of the final text&rdquo;. What that means
                is the teacher&apos;s call.
              </p>
            </section>

            <section id="keep" aria-labelledby="keep-title">
              <h2 id="keep-title">How long we keep it</h2>
              <p>
                Chats and writing events are deleted after 180 days. After that we keep only
                aggregate numbers, such as weekly message counts and Reliance Scores, so teachers
                can still see trends over a semester.
              </p>
              <p>
                Pilot requests are kept until the pilot conversation is over, or until you ask us
                to delete them.
              </p>
            </section>

            <section id="choices" aria-labelledby="choices-title">
              <h2 id="choices-title">Your choices</h2>
              <ul>
                <li>See everything SafeSight holds about your learning on your own pages in the student app.</li>
                <li>Choose whether to share a chat with your teacher. Nothing is shared unless you share it or it is flagged.</li>
                <li>Ask for your data to be corrected or deleted, through your teacher or institution, or by writing to us.</li>
              </ul>
              <p>
                Before anyone uses SafeSight, a one-time screen at sign-up explains what is
                recorded and who sees it. Real students take part in testing only with their
                consent, and our demo data uses invented names only.
              </p>
            </section>

            <section id="security" aria-labelledby="security-title">
              <h2 id="security-title">Keeping it safe</h2>
              <p>
                Every table in our database has row-level security, so the database itself checks
                that a student can read only their own rows and a teacher only their own courses.
                We test this rule automatically. Connections are encrypted, and API keys live only
                on the server.
              </p>
            </section>

            <section id="contact" aria-labelledby="contact-title">
              <h2 id="contact-title">Changes and contact</h2>
              <p>
                If we change this policy, we will update the date at the top and tell the teachers
                and institutions we work with before the change applies to them.
              </p>
              <p>
                Questions about your data? <Link href="/#pilot">Write to us</Link> and a real
                person will reply.
              </p>
            </section>
          </div>
        </div>
      </div>

      <CtaBand />
    </>
  );
}
