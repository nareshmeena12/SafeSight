"use client";

import { ArrowRight, Menu, X } from "lucide-react";
import { useMotionValueEvent, useScroll } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/logo";
import { ThemeToggle, useSiteTheme } from "./site-theme";

export const siteNav = [
  { href: "/#product", label: "Product" },
  { href: "/#how", label: "How it works" },
  { href: "/#lab", label: "Lab Mode" },
  { href: "/#privacy", label: "Privacy" },
  { href: "/#teachers", label: "For teachers" },
] as const;

export function SiteLogo({
  onClick,
  className = "logo",
}: {
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Link className={className} href="/#top" aria-label="SafeSight home" onClick={onClick}>
      <LogoMark />
      <span>SafeSight</span>
    </Link>
  );
}

/** Sticky top bar; turns frosted once the page scrolls. Full-screen menu on phones. */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 8));

  return (
    <>
      <header className={scrolled ? "nav is-scrolled" : "nav"}>
        <div className="wrap nav-inner">
          <SiteLogo />
          <nav aria-label="Main" style={{ display: "contents" }}>
            <ul className="nav-links">
              {siteNav.map((item) => (
                <li key={item.href}>
                  <Link href={item.href}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="nav-actions">
            <ThemeToggle className="icon-btn theme-btn" />
            <Link className="nav-login" href="/login">
              Log in
            </Link>
            <Link className="btn btn--primary btn--sm" href="/#pilot">
              Request a pilot
            </Link>
            <button
              type="button"
              className="icon-btn burger"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              aria-controls="site-menu"
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={22} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>
      {menuOpen ? <MobileMenu onClose={() => setMenuOpen(false)} /> : null}
    </>
  );
}

function MobileMenu({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const { isDark, label, toggle } = useSiteTheme();

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [onClose]);

  return (
    <div className="menu" id="site-menu" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="menu-top">
        <SiteLogo onClick={onClose} />
        <button
          ref={closeRef}
          type="button"
          className="icon-btn"
          aria-label="Close menu"
          onClick={onClose}
        >
          <X size={22} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
      <ul className="menu-links">
        {siteNav.map((item, i) => (
          <li key={item.href} style={{ animationDelay: `${40 + i * 60}ms` }}>
            <Link href={item.href} onClick={onClose}>
              {item.label}
              <ArrowRight size={20} strokeWidth={1.5} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <div className="menu-row">
        <span>Appearance</span>
        <button type="button" className="theme-switch" onClick={toggle} aria-label={label}>
          {isDark ? "Dark" : "Light"}
        </button>
      </div>
      <div className="menu-foot">
        <Link className="btn btn--secondary btn--block" href="/login" onClick={onClose}>
          Log in
        </Link>
        <Link className="btn btn--primary btn--block" href="/#pilot" onClick={onClose}>
          Request a pilot
        </Link>
      </div>
    </div>
  );
}
