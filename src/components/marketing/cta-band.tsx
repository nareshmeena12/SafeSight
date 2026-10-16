import { ArrowRight } from "lucide-react";
import Link from "next/link";

/** Closing call to action for /about and /privacy; points at the landing pilot form. */
export function CtaBand() {
  return (
    <section className="sec" aria-labelledby="cta-title">
      <div className="wrap">
        <div className="cta-band">
          <div>
            <h2 id="cta-title">
              Bring SafeSight to your course <em>next semester.</em>
            </h2>
            <p>Start with a single course. We do the setup with you, and it is always free for students.</p>
          </div>
          <Link className="btn" href="/#pilot">
            Request a pilot
            <ArrowRight className="nudge" size={18} strokeWidth={1.5} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
