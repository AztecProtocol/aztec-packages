import React from "react";
import BrowserOnly from "@docusaurus/BrowserOnly";
import useIsBrowser from "@docusaurus/useIsBrowser";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import { AnalyticsManager } from "../utils/analytics";
import MatomoTracking from "../components/Matomo/matomo";
import NPSWidget from "../components/NPSWidget";

export default function Root({ children }) {
  const useIsBrowserValue = useIsBrowser();
  const { siteConfig } = useDocusaurusContext();

  if (!useIsBrowserValue) return <>{children}</>;

  // Initialize analytics when in browser
  if (typeof window !== 'undefined' && !window.analytics) {
    const analytics = new AnalyticsManager({
      env: siteConfig.customFields.ENV
    });
    window.analytics = analytics;

    // Add global debug function for non-production environments
    if (siteConfig.customFields.ENV !== "prod") {
      window.forceNPS = () => {
        const event = new CustomEvent('forceShowNPS');
        window.dispatchEvent(event);
        console.log('🔧 Forcing NPS widget to show');
      };
    }
  }

  return (
    <>
      <BrowserOnly>
        {() => (
          <>
            <MatomoTracking />
            <NPSWidget />
          </>
        )}
      </BrowserOnly>
      {children}
    </>
  );
}
