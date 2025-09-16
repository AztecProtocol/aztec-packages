import { useEffect, useState } from "react";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Link from "@docusaurus/Link";
import { useLocation } from "@docusaurus/router";

function getSiteId(env) {
  if (env == "dev") {
    return "4";
  } else if (env == "staging") {
    return "5";
  } else {
    return "6";
  }
}
function pushInstruction(name, ...args) {
  return window._paq.push([name, ...args]);
}

export default function useMatomo() {
  const { siteConfig } = useDocusaurusContext();
  const [showBanner, setShowBanner] = useState(false);
  const location = useLocation();

  const env = siteConfig.customFields.MATOMO_ENV;
  
  // Use proxy endpoints to avoid adblockers
  const urlBase = "/.netlify/functions/";
  const trackerUrl = `${urlBase}track`;
  const srcUrl = `${urlBase}analytics.js`;

  window._paq = window._paq || [];

  useEffect(() => {
    const storedConsent = localStorage.getItem("matomoConsent");
    if (storedConsent === null) {
      setShowBanner(true);
    }
  }, []);

  useEffect(() => {
    pushInstruction("setTrackerUrl", trackerUrl);
    pushInstruction("setSiteId", getSiteId(env));
    if (env !== "prod") {
      pushInstruction("setSecureCookie", false);
    }

    const doc = document;
    const scriptElement = doc.createElement("script");
    const scripts = doc.getElementsByTagName("script")[0];

    scriptElement.type = "text/javascript";
    scriptElement.async = true;
    scriptElement.defer = true;
    scriptElement.src = srcUrl;

    if (scripts && scripts.parentNode) {
      scripts.parentNode.insertBefore(scriptElement, scripts);
    }

    // Debug logging for development
    const isDev = window.location.hostname === 'localhost' || window.location.hostname.includes('127.0.0.1');
    if (isDev) {
      const checkMatomoStatus = () => {
        console.group('📊 Matomo Analytics Debug');
        
        const paqExists = typeof window !== 'undefined' && !!window._paq;
        const matomoScript = document.querySelector('script[src*="analytics.js"]') || document.querySelector('script[src*="matomo.js"]');
        const scriptLoaded = matomoScript && matomoScript.readyState === 'complete';
        const isUsingProxy = !!document.querySelector('script[src*="analytics.js"]');
        
        console.log('📊 _paq exists:', paqExists);
        console.log('📊 Script found:', !!matomoScript);
        console.log('📊 Script loaded:', scriptLoaded);
        console.log('🔧 Using proxy:', isUsingProxy);
        console.log('🔒 Consent:', localStorage.getItem("matomoConsent"));
        console.log('🏷️ Site ID:', getSiteId(env));
        console.log('📍 Tracker URL:', trackerUrl);
        
        if (matomoScript) {
          console.log('📄 Script source:', matomoScript.src);
        }
        
        if (paqExists) {
          if (typeof window._paq.push === 'function') {
            console.log('✅ Matomo is functional');
          }
        } else {
          console.warn('🚫 Matomo not found - might be blocked');
        }
        
        console.groupEnd();
      };
      
      // Check after script has time to load
      setTimeout(checkMatomoStatus, 2000);
    }
  }, []);

  useEffect(() => {
    pushInstruction("trackPageView");
  }, [location]);

  const optIn = () => {
    pushInstruction("rememberConsentGiven");
    localStorage.setItem("matomoConsent", true);
    setShowBanner(false);
    
    // Sync any pending analytics events
    if (typeof window !== 'undefined' && window.analytics) {
      setTimeout(() => window.analytics.syncFallbackEvents(), 1000);
    }
  };

  const optOut = () => {
    pushInstruction("forgetConsentGiven");
    localStorage.setItem("matomoConsent", false);
    setShowBanner(false);
  };

  const debug = () => {
    pushInstruction(function () {
      console.log(this.getRememberedConsent());
      console.log(localStorage.getItem("matomoConsent"));
    });
  };

  const reset = () => {
    pushInstruction("forgetConsentGiven");
    localStorage.clear("matomoConsent");
  };

  if (!showBanner && env === "dev") {
    return (
      <div id="optout-form">
        <div className="homepage_footer">
          <p>Debugging analytics</p>
          <div className="homepage_cta_footer_container">
            <button
              className="cta-button button button--secondary button--sm"
              onClick={debug}
            >
              Debug
            </button>
            <button
              className="cta-button button button--secondary button--sm"
              onClick={reset}
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    );
  } else if (!showBanner) {
    return null;
  }

  return (
    <div id="optout-form">
      <div className="homepage_footer">
        <p>
          We value your privacy and we only collect statistics and essential
          cookies. If you'd like to help us improve our websites, you can allow
          cookies for tracking page views, time on site, and other analytics.
          <br />
          <br />
          <Link to="https://aztec.network/privacy-policy/">
            Find out how we use cookies and how you can change your settings.
          </Link>
        </p>
        <div className="homepage_cta_footer_container">
          <button
            className="cta-button button button--primary button--sm"
            onClick={optIn}
          >
            I accept cookies
          </button>
          <button
            className="cta-button button button--secondary button--sm"
            onClick={optOut}
          >
            I refuse cookies
          </button>
          {env === "dev" && (
            <button
              className="cta-button button button--secondary button--sm"
              onClick={debug}
            >
              Debug
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
