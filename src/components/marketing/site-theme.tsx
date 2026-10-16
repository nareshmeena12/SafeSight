"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

/**
 * Light/dark switch for the public site and the auth pages (design/landing).
 * The choice is stored per browser and applied as <html data-theme>, which
 * globals.css already understands. It only applies while a marketing or auth
 * page is open: <SiteThemeScope> removes it again on the way into the apps,
 * which always follow the system setting.
 */
type Theme = "light" | "dark";
const STORAGE_KEY = "ss-site-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function stored(): Theme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function current(): Theme {
  const forced = document.documentElement.dataset.theme;
  if (forced === "light" || forced === "dark") return forced;
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ["data-theme"] });
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}

function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode: the switch still works for this page view.
  }
}

export function useSiteTheme() {
  const theme = useSyncExternalStore(subscribe, current, () => "light" as Theme);
  const isDark = theme === "dark";
  return {
    theme,
    isDark,
    label: isDark ? "Switch to light mode" : "Switch to dark mode",
    toggle: () => setTheme(isDark ? "light" : "dark"),
  };
}

/** Applies the stored choice while mounted; removes it on unmount. */
export function SiteThemeScope() {
  useEffect(() => {
    const root = document.documentElement;
    const theme = stored();
    if (theme) root.dataset.theme = theme;
    return () => {
      delete root.dataset.theme;
    };
  }, []);
  return null;
}

export function ThemeToggle({ className = "icon-btn" }: { className?: string }) {
  const { isDark, label, toggle } = useSiteTheme();
  const Icon = isDark ? Sun : Moon;
  return (
    <button type="button" className={className} aria-label={label} onClick={toggle}>
      <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
    </button>
  );
}
