import React, { useContext, createContext, useRef } from "react";
import useMatomo from "@site/src/components/Matomo/matomo";
import BrowserOnly from "@docusaurus/BrowserOnly";
import useIsBrowser from "@docusaurus/useIsBrowser";

function OptOutForm() {
  const banner = useMatomo();

  return <>{banner}</>;
}

export const TestContext = createContext();

export function TestProvider({ children }) {
  const idRef = useRef(0);

  const getNewId = () => {
    idRef.current += 1;
    return idRef.current;
  };

  return (
    <TestContext.Provider value={{ getNewId }}>{children}</TestContext.Provider>
  );
}

export default function Root({ children }) {
  const useIsBrowserValue = useIsBrowser();
  if (!useIsBrowserValue) return <>{children}</>;

  return (
    <>
      {children}
      <BrowserOnly>{() => <OptOutForm />}</BrowserOnly>
    </>
  );
}
