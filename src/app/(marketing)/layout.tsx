import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteThemeScope } from "@/components/marketing/site-theme";
import "@/components/marketing/site.css";

/** Public site: landing, /about, /privacy (design/landing/Main.dc.html). */
export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="ss" id="top">
      <SiteThemeScope />
      <a className="skip" href="#main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </div>
  );
}
