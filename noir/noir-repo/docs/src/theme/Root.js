import React from 'react';
import useMatomo from '@site/src/components/Matomo/matomo';
import BrowserOnly from '@docusaurus/BrowserOnly';
import useIsBrowser from '@docusaurus/useIsBrowser';
import AskCookbook from '@cookbookdev/docsbot/react';

function OptOutForm() {
  const banner = useMatomo();

  return <>{banner}</>;
}

/** It's a public API key, so it's safe to expose it here. */
const COOKBOOK_PUBLIC_API_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NzVhMGVkODQ4MGI5OThmNzlhNjNhOTciLCJpYXQiOjE3MzM5NTUyODgsImV4cCI6MjA0OTUzMTI4OH0.NzQlH2sfhJkjvnYxoaRgSY6nRyNClxHg57n3-JueN9Q';

export default function Root({ children }) {
  const useIsBrowserValue = useIsBrowser();
  if (!useIsBrowserValue) return <>{children}</>;

  return (
    <>
      {children}
      <BrowserOnly>{() => <OptOutForm />}</BrowserOnly>
      <BrowserOnly>{() => <AskCookbook apiKey={COOKBOOK_PUBLIC_API_KEY} />}</BrowserOnly>
    </>
  );
}
