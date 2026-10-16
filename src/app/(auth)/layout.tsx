import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { SiteLogo } from "@/components/marketing/site-header";
import { SiteThemeScope, ThemeToggle } from "@/components/marketing/site-theme";
import "@/components/marketing/site.css";

/** Log in and sign up (design/landing/Auth.dc.html): story on the left, form on the right. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="ss">
      <SiteThemeScope />
      <div className="auth">
        <aside className="auth-art" aria-label="About SafeSight">
          <div className="glow" aria-hidden="true" />
          <SiteLogo />
          <div>
            <p className="auth-quote">
              Guide, <em>don&apos;t guard.</em>
            </p>
            <p className="auth-sub">
              A tutor that helps students think for themselves, and a clear view of AI use for the
              teachers who guide them.
            </p>
          </div>
          <div className="card auth-demo" aria-hidden="true">
            <div className="msg msg--student">
              <div className="bubble bubble--student">
                <p>Is my free-body diagram right?</p>
              </div>
            </div>
            <div className="msg msg--sage">
              <span className="avatar avatar--sm">
                <LogoMark className="size-[15px]" />
              </span>
              <div className="bubble bubble--sage">
                <p>Almost. Count the forces on the block again. Which one acts along the incline?</p>
              </div>
            </div>
          </div>
          <p className="auth-foot-note">Built at IIT Mandi · Now piloting</p>
        </aside>

        <main className="auth-side">
          <div className="auth-top">
            <SiteLogo className="logo mobile-logo" />
            <div className="auth-top-right">
              <ThemeToggle />
              <Link href="/">Back to site</Link>
            </div>
          </div>
          <div className="auth-form">{children}</div>
        </main>
      </div>
    </div>
  );
}
