import type { Metadata } from "next";
import { Agents } from "@/components/marketing/landing/agents";
import { Compare } from "@/components/marketing/landing/compare";
import { DashboardPreview } from "@/components/marketing/landing/dashboard-preview";
import { Faq } from "@/components/marketing/landing/faq";
import { Hero } from "@/components/marketing/landing/hero";
import { HowItWorks } from "@/components/marketing/landing/how-it-works";
import { LabMode } from "@/components/marketing/landing/lab-mode";
import { PilotPanel } from "@/components/marketing/landing/pilot-panel";
import { PrivacySection } from "@/components/marketing/landing/privacy-section";
import { Problem } from "@/components/marketing/landing/problem";
import { TraceReplay } from "@/components/marketing/landing/trace-replay";

export const metadata: Metadata = {
  title: { absolute: "SafeSight — AI that teaches, not answers" },
  description:
    "SafeSight gives every student a tutor that builds real understanding, and gives every teacher a clear view of how AI is used in their class.",
};

// Section order follows design/landing/Main.dc.html.
export default function LandingPage() {
  return (
    <>
      <Hero />
      <Problem />
      <Compare />
      <HowItWorks />
      <Agents />
      <DashboardPreview />
      <TraceReplay />
      <LabMode />
      <PrivacySection />
      <Faq />
      <PilotPanel />
    </>
  );
}
