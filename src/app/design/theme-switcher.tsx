"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Theme = "system" | "light" | "dark";

/**
 * Forces light or dark on <html> while this page is open, so both themes can
 * be checked without changing the OS setting. The app itself always follows
 * the system.
 */
export function ThemeSwitcher() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);

  useEffect(() => () => void delete document.documentElement.dataset.theme, []);

  return (
    <Tabs value={theme} onValueChange={(v) => setTheme(v as Theme)}>
      <TabsList aria-label="Theme">
        <TabsTrigger value="system">
          <Monitor strokeWidth={1.5} aria-hidden="true" />
          System
        </TabsTrigger>
        <TabsTrigger value="light">
          <Sun strokeWidth={1.5} aria-hidden="true" />
          Light
        </TabsTrigger>
        <TabsTrigger value="dark">
          <Moon strokeWidth={1.5} aria-hidden="true" />
          Dark
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
