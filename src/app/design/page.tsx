import type { Metadata } from "next";
import { ArrowRight, Flag, MessageCircle, Plus, Sparkles } from "lucide-react";
import { NavLinks } from "@/components/app/nav-links";
import { PageHeader } from "@/components/app/page-header";
import { UserMenu } from "@/components/app/user-menu";
import { Field } from "@/components/auth/field";
import { Logo, LogoMark } from "@/components/logo";
import { FadeUp } from "@/components/motion/fade-up";
import { EmptyState } from "@/components/product/empty-state";
import { ModeBadge } from "@/components/product/mode-badge";
import { RelianceBadge } from "@/components/product/reliance-badge";
import { StatCard } from "@/components/product/stat-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  LineTabsDemo,
  ModeSelect,
  Overlays,
  SwitchRow,
  TabsDemo,
} from "./interactive";
import { ThemeSwitcher } from "./theme-switcher";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false },
};

const colours = [
  { name: "background", cls: "bg-background", light: "#FAF8F3", dark: "#0E1015", usage: "Page ground" },
  { name: "surface", cls: "bg-surface", light: "#FFFFFF", dark: "#171A22", usage: "Cards, panels, inputs" },
  { name: "text", cls: "bg-text", light: "#14161F", dark: "#ECEDEE", usage: "Headlines and body" },
  { name: "text-muted", cls: "bg-text-muted", light: "#6B6F7B", dark: "#9BA0AB", usage: "Labels, metadata" },
  { name: "border", cls: "bg-border", light: "#E7E3DA", dark: "#262A35", usage: "1px hairlines" },
  { name: "primary", cls: "bg-primary", light: "#1F6F5C", dark: "#4FB59A", usage: "Sage: buttons, links, active" },
  { name: "primary-soft", cls: "bg-primary-soft", light: "#E5EFEA", dark: "#15302A", usage: "Bubbles, selected chips" },
  { name: "insight (accent)", cls: "bg-insight", light: "#F2A93B", dark: "#F5B95A", usage: "Once per screen. Fill only" },
  { name: "insight-soft", cls: "bg-insight-soft", light: "#FDF0DA", dark: "#33270F", usage: "Behind an amber highlight" },
  { name: "good", cls: "bg-good", light: "#2E9D6A", dark: "#4CC28B", usage: "Healthy state" },
  { name: "warning", cls: "bg-warning", light: "#D99A00", dark: "#E8B030", usage: "Needs a look" },
  { name: "critical", cls: "bg-critical", light: "#D14B45", dark: "#E8706A", usage: "Errors, flags" },
];

const typeStyles = [
  { name: "display", cls: "font-serif text-display", sample: "AI that teaches, not answers." },
  { name: "headline", cls: "font-serif text-headline", sample: "Same question. Very different outcome." },
  { name: "headline-sm", cls: "font-serif text-headline-sm", sample: "Bring SafeSight to your course." },
  { name: "lead", cls: "text-lead", sample: "A tutor that builds real understanding." },
  { name: "title", cls: "text-title", sample: "Sage" },
  { name: "body", cls: "text-body", sample: "Hints, questions and explanations grounded in course notes." },
  { name: "label", cls: "text-label", sample: "Request a pilot" },
  { name: "small", cls: "text-small", sample: "Trace reports evidence. Teachers decide." },
  { name: "eyebrow", cls: "text-eyebrow uppercase", sample: "Now piloting" },
  { name: "mono", cls: "font-mono text-mono", sample: "Hint 2 of 5 · 14:32" },
  { name: "mono-stat", cls: "font-mono text-mono-stat", sample: "1,284" },
];

const students = [
  { name: "Riya Sharma", roll: "21ME042", chats: 18, score: 34, flags: 0 },
  { name: "Arjun Mehta", roll: "21ME011", chats: 41, score: 72, flags: 2 },
  { name: "Sneha Iyer", roll: "21ME057", chats: 9, score: 51, flags: 0 },
  { name: "Kabir Singh", roll: "21ME033", chats: 25, score: 18, flags: 0 },
];

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 border-t py-12">
      <div className="mb-6">
        <h2 id={`${id}-title`} className="text-title">
          {title}
        </h2>
        {note ? <p className="mt-1 max-w-2xl text-small text-muted-foreground">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default function DesignPage() {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Logo />
        <ThemeSwitcher />
      </header>

      <PageHeader
        eyebrow="Design system"
        title="Calm, warm and academic"
        description="Every token and component in SafeSight, in one place. Check both themes, then resize to 375px."
      />

      <Section id="colour" title="Colour" note="Light and dark values from design/tokens.json. Amber appears once per screen.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {colours.map((c) => (
            <div key={c.name} className="overflow-hidden rounded-lg border bg-surface">
              <div className={`h-16 border-b ${c.cls}`} />
              <div className="p-3">
                <p className="text-label">{c.name}</p>
                <p className="font-mono text-mono text-muted-foreground">
                  {c.light} / {c.dark}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{c.usage}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section id="type" title="Type" note="Instrument Serif for large headlines only; Geist for interface and body (16px / 1.6); Geist Mono for numbers.">
        <div className="grid gap-6">
          {typeStyles.map((t) => (
            <div key={t.name} className="grid gap-2 sm:grid-cols-[140px_1fr] sm:items-baseline">
              <p className="font-mono text-mono text-muted-foreground">{t.name}</p>
              <p className={`${t.cls} min-w-0 break-words`}>{t.sample}</p>
            </div>
          ))}
          <p className="font-serif text-headline-sm">
            Guide, <em>don&apos;t</em> guard.
          </p>
        </div>
      </Section>

      <Section id="buttons" title="Buttons" note="44px by default. Press scales to .98. Insight amber is for the single most important action, if any.">
        <div className="grid gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button>
              Try Sage
              <ArrowRight strokeWidth={1.5} />
            </Button>
            <Button variant="secondary">
              <Sparkles strokeWidth={1.5} />
              Request a pilot
            </Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="insight">Review 3 flags</Button>
            <Button variant="destructive">Remove</Button>
            <Button variant="link">Read the notes</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg">Large</Button>
            <Button>Default</Button>
            <Button size="sm">Small</Button>
            <Button size="xs">Extra small</Button>
            <Button size="icon" variant="secondary" aria-label="Add">
              <Plus strokeWidth={1.5} />
            </Button>
            <Button disabled>Disabled</Button>
          </div>
        </div>
      </Section>

      <Section id="forms" title="Form controls" note="Visible labels, inline helpful errors, 44px fields.">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="grid gap-5">
            <Field name="design-name" label="Full name" placeholder="Riya Sharma" />
            <Field
              name="design-email"
              label="College email"
              type="email"
              defaultValue="riya@college"
              error="That email looks incomplete. Try name@college.edu.in."
            />
            <Field name="design-code" label="Class code" hint="Six letters, from your teacher." />
          </div>
          <div className="grid content-start gap-5">
            <ModeSelect />
            <div className="grid gap-2">
              <Label htmlFor="design-notes">Notes for Sage</Label>
              <Textarea
                id="design-notes"
                defaultValue="Focus on the first law. Students often mix up work done by and on the system."
              />
            </div>
            <SwitchRow />
          </div>
        </div>
      </Section>

      <Section id="badges" title="Badges" note="States carry colour in a dot and always have a label.">
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="solid">Solid</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="insight">Insight</Badge>
            <Badge variant="good">On track</Badge>
            <Badge variant="warning">Needs a look</Badge>
            <Badge variant="critical">Flagged</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <ModeBadge mode="learn" withHint />
            <ModeBadge mode="assist" withHint />
            <ModeBadge mode="exam" withHint />
          </div>
          <div className="flex flex-wrap gap-2">
            <RelianceBadge score={22} />
            <RelianceBadge score={54} />
            <RelianceBadge score={78} />
          </div>
        </div>
      </Section>

      <Section id="cards" title="Cards" note="16px radius, 1px border, no shadow at rest. Interactive cards rise and lift on hover.">
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <FadeUp>
              <StatCard label="Active students" value="28" note="of 30 enrolled" />
            </FadeUp>
            <FadeUp delay={0.06}>
              <StatCard label="AI conversations" value="212" note="this week" />
            </FadeUp>
            <FadeUp delay={0.12}>
              <StatCard label="Avg. Reliance Score" value="41" note="down 6 from last week" />
            </FadeUp>
            <FadeUp delay={0.18}>
              <StatCard label="Open flags" value="3" note="2 need a look today" highlight />
            </FadeUp>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Thermodynamics problem set 3</CardTitle>
                <CardDescription>ME201 · Due Friday, 6 pm</CardDescription>
                <CardAction>
                  <ModeBadge mode="learn" />
                </CardAction>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                Sage will give hints and ask questions back. It won&apos;t give final answers.
              </CardContent>
              <CardFooter className="justify-end gap-2">
                <Button variant="ghost" size="sm">
                  Details
                </Button>
                <Button size="sm">
                  <MessageCircle strokeWidth={1.5} />
                  Continue with Sage
                </Button>
              </CardFooter>
            </Card>
            <a
              href="#cards"
              className="group grid content-start gap-2 rounded-lg border bg-surface p-6 transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-1 hover:shadow-lift"
            >
              <span className="grid size-10 place-items-center rounded-full bg-primary-soft text-primary">
                <Sparkles className="size-5" strokeWidth={1.5} aria-hidden="true" />
              </span>
              <span className="text-title">Lens</span>
              <span className="text-muted-foreground">
                Ask in plain English and get answers with names, numbers and a small chart.
              </span>
            </a>
          </div>
        </div>
      </Section>

      <Section id="table" title="Table">
        <div className="rounded-lg border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead className="text-right">Conversations</TableHead>
                <TableHead>Reliance Score</TableHead>
                <TableHead className="text-right">Flags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((s) => (
                <TableRow key={s.roll}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar size="sm">
                        <AvatarFallback>
                          {s.name.split(" ").map((p) => p[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{s.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">{s.roll}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">{s.chats}</TableCell>
                  <TableCell>
                    <RelianceBadge score={s.score} />
                  </TableCell>
                  <TableCell className="text-right font-mono">{s.flags}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section id="navigation" title="Tabs, overlays and menus">
        <div className="grid gap-8">
          <TabsDemo />
          <LineTabsDemo />
          <Overlays />
        </div>
      </Section>

      <Section id="states" title="Loading and empty states" note="Skeletons instead of spinners. Empty states say something useful.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid content-start gap-3 rounded-lg border bg-surface p-6" aria-hidden="true">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <EmptyState
            icon={Flag}
            title="No flags this week"
            description="Your class is doing well. New flags show up here as they happen."
          />
        </div>
      </Section>

      <Section id="shell" title="App shell" note="Sidebar from 1024px up; below that a menu button opens the same links in a sheet. Open /student or /teacher signed in to see it live.">
        <div className="overflow-hidden rounded-lg border bg-background">
          <div className="flex">
            <div className="hidden w-60 shrink-0 border-r md:block">
              <div className="flex h-16 items-center border-b px-5">
                <span className="inline-flex items-center gap-2 font-semibold">
                  <LogoMark />
                  SafeSight
                </span>
              </div>
              <nav aria-label="Preview navigation" className="p-3">
                <p className="px-3 pt-2 pb-2 text-eyebrow text-muted-foreground uppercase">Teacher</p>
                <NavLinks area="teacher" currentPath="/teacher" />
              </nav>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex h-16 items-center border-b px-4">
                <span className="inline-flex items-center gap-2 font-semibold md:hidden">
                  <LogoMark />
                  SafeSight
                </span>
                <div className="ml-auto">
                  <UserMenu
                    user={{ fullName: "Kavita Sharma", email: "teacher@demo.safesight.in", role: "teacher" }}
                  />
                </div>
              </div>
              <div className="p-6">
                <PageHeader
                  className="mb-6 lg:mb-6"
                  eyebrow="Overview"
                  title="Welcome, Kavita Sharma"
                  description="Here's where you'll see how your class learns with Sage."
                />
                <div className="grid grid-cols-2 gap-4">
                  <StatCard label="Active students" value="28" />
                  <StatCard label="Open flags" value="3" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Separator />
      <p className="py-8 text-small text-muted-foreground">
        Icons: Lucide at 1.5px stroke. Motion: 150–600ms, ease-out, opacity / position / scale only, off under reduced motion.
      </p>
    </div>
  );
}
