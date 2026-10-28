import React, { useEffect } from 'react';
import useMatomo from '@site/src/components/Matomo/matomo';
import BrowserOnly from '@docusaurus/BrowserOnly';
import useIsBrowser from '@docusaurus/useIsBrowser';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import { AnalyticsManager } from '@site/src/utils/analytics';
import { OperatorConfigProvider } from '@site/src/components/OperatorConfig/context';

function useOpenDetailsOnHash() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const openMatching = () => {
      const id = window.location.hash.replace(/^#/, '');
      if (!id) return;
      const el = document.getElementById(id);
      if (el && el.tagName === 'DETAILS') {
        el.open = true;
        el.scrollIntoView({ block: 'start' });
      }
    };
    openMatching();
    window.addEventListener('hashchange', openMatching);
    return () => window.removeEventListener('hashchange', openMatching);
  }, []);
}

function OptOutForm() {
  const banner = useMatomo();

  return <>{banner}</>;
}

export default function Root({ children }) {
  const useIsBrowserValue = useIsBrowser();
  const { siteConfig } = useDocusaurusContext();
  useOpenDetailsOnHash();

  if (!useIsBrowserValue) return <OperatorConfigProvider>{children}</OperatorConfigProvider>;

  // Create analytics instance with environment from siteConfig
  if (typeof window !== 'undefined' && !window.analytics) {
    const analytics = new AnalyticsManager({
      env: siteConfig.customFields.ENV
    });
    window.analytics = analytics;
  }

  return (
    <OperatorConfigProvider>
      {children}
      <BrowserOnly>{() => <OptOutForm />}</BrowserOnly>
    </OperatorConfigProvider>
  );
}
