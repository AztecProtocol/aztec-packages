import React from 'react';
import useMatomo from '@site/src/components/Matomo/matomo';
import BrowserOnly from '@docusaurus/BrowserOnly';
import useIsBrowser from '@docusaurus/useIsBrowser';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import { AnalyticsManager } from '@site/src/utils/analytics';

function OptOutForm() {
  const banner = useMatomo();

  return <>{banner}</>;
}

export default function Root({ children }) {
  const useIsBrowserValue = useIsBrowser();
  const { siteConfig } = useDocusaurusContext();

  if (!useIsBrowserValue) return <>{children}</>;

  // Create analytics instance with environment from siteConfig
  if (typeof window !== 'undefined' && !window.analytics) {
    const analytics = new AnalyticsManager({
      env: siteConfig.customFields.ENV
    });
    window.analytics = analytics;
  }

  return (
    <>
      {children}
      <BrowserOnly>{() => <OptOutForm />}</BrowserOnly>
    </>
  );
}
