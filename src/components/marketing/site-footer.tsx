import Link from "next/link";
import { SiteLogo } from "./site-header";

const footerLinks = [
  { href: "/#product", label: "Product" },
  { href: "/#lab", label: "Lab Mode" },
  { href: "/privacy", label: "Privacy" },
  { href: "/about", label: "About" },
  { href: "/#pilot", label: "Contact" },
] as const;

export function SiteFooter() {
  return (
    <footer className="foot" aria-label="Footer">
      <div className="wrap">
        <div className="foot-grid">
          <div>
            <SiteLogo />
            <p className="foot-mission">
              Guide, don&apos;t guard. AI that helps every student learn, and helps every
              teacher see how.
            </p>
          </div>
          <nav aria-label="Footer">
            <ul className="foot-links">
              {footerLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="foot-bottom">
          <span className="made">
            <i aria-hidden="true">
              <span />
            </i>
            Made in India · Built at IIT Mandi
          </span>
          <span>© 2026 SafeSight. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}
