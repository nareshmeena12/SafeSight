import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Building2, ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { DomainSettings } from "@/components/institution/domain-settings";
import { StaffInvites } from "@/components/institution/staff-invites";
import { SetupSteps } from "@/components/integrations/setup-steps";
import { EmptyState } from "@/components/product/empty-state";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth/dal";
import { ssoProviders } from "@/lib/auth/sso";
import { emailConfigured } from "@/lib/email/send";
import { adminInstitutionId, institutionSettings } from "@/lib/institution/server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sign-in and domains" };

export default function InstitutionPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-4 rounded-lg border bg-surface p-6">
      <div>
        <h2 id={id} className="text-title">
          {title}
        </h2>
        <p className="text-small text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

async function Content() {
  const user = await requireRole(["admin"]);
  const institutionId = await adminInstitutionId(user);
  const back = (
    <Link href="/teacher/integrations" className="mb-4 inline-flex min-h-11 items-center gap-1 text-small text-muted-foreground hover:text-foreground">
      <ChevronLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
      Import classes
    </Link>
  );
  if (!institutionId) {
    return (
      <>
        {back}
        <PageHeader eyebrow="Admin" title="Sign-in and domains" />
        <EmptyState
          icon={Building2}
          title="Your account isn't linked to an institution yet"
          description="Ask the SafeSight team to link your admin account to your college, then come back here."
        />
      </>
    );
  }
  const [settings, sso] = await Promise.all([institutionSettings(await createClient(), institutionId), ssoProviders()]);
  if (!settings) return null;
  const emailReady = emailConfigured();

  return (
    <>
      {back}
      <PageHeader
        eyebrow={settings.name}
        title="Sign-in and domains"
        description="How people sign in to SafeSight at your college, which email domains are yours, and who teaches here."
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="grid min-w-0 content-start gap-6 lg:col-span-7">
          <Section
            id="domains-title"
            title="Your email domains"
            description="Anyone who signs in with an address at these domains joins your institution, including with Google or Microsoft."
          >
            <DomainSettings domains={settings.domains} domainsOnly={settings.domainsOnly} />
          </Section>
          <Section
            id="staff-title"
            title="Invite teachers"
            description="Google and Microsoft sign-in make new accounts students. Invite teachers here so they get teacher access when they sign in."
          >
            <StaffInvites invites={settings.invites} emailReady={emailReady} />
          </Section>
        </div>
        <div className="grid min-w-0 content-start gap-6 lg:col-span-5">
          <Section id="sso-title" title="One-click sign-in" description="Buttons on the log-in and sign-up pages.">
            <ul className="grid gap-3 text-small">
              {(
                [
                  ["google", "Google (Workspace or Gmail)"],
                  ["microsoft", "Microsoft (Office 365 / Entra ID)"],
                ] as const
              ).map(([key, label]) => (
                <li key={key} className="flex items-center justify-between gap-3">
                  <span>{label}</span>
                  {sso[key] ? <Badge variant="good">On</Badge> : <Badge variant="secondary">Not configured yet</Badge>}
                </li>
              ))}
            </ul>
          </Section>
          {sso.google && sso.microsoft ? null : (
            <SetupSteps
              title="Turning sign-in on"
              description="Done once by whoever runs SafeSight, in the Google, Microsoft and Supabase consoles. The buttons appear by themselves afterwards."
              steps={[
                "Google Cloud console: create an OAuth client (Web application) with Supabase's callback URL as its redirect URI.",
                "Microsoft Entra admin center: register an app with the same Supabase callback URL, and add the email and xms_edov optional claims.",
                "Supabase dashboard → Authentication → Sign In / Providers: paste each client ID and secret and enable Google and Azure.",
              ]}
            />
          )}
        </div>
      </div>
    </>
  );
}
