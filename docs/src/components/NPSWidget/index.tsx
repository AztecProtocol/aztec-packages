import React, { useState, useEffect } from 'react';
import styles from './styles.module.css';
import { analytics } from '@site/src/utils/analytics';

interface NPSWidgetProps {
  siteId?: string;
  showAfterSeconds?: number;
  scrollThreshold?: number;
  pageViewsBeforeShow?: number;
  timeOnPageBeforeShow?: number;
}

interface NPSData {
  score: number;
  feedback: string;
  url: string;
  timestamp: number;
  userAgent: string;
}

// Research sources for timing best practices:
// - https://www.asknicely.com/blog/timing-is-everything-whens-the-best-time-to-ask-for-customer-feedback
// - https://survicate.com/blog/nps-best-practices/
// - https://delighted.com/blog/when-to-send-your-nps-survey

export default function NPSWidget({ 
  siteId = 'aztec-docs',
  showAfterSeconds = 180, // 3 minutes total session time (production default)
  scrollThreshold = 50, // Show when 50% through content (production default)
  pageViewsBeforeShow = 2, // Show after 2nd page view (production default)
  timeOnPageBeforeShow = 120 // 2 minutes actively on current page (production default)
}: NPSWidgetProps) {
  const [score, setScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isAnimatingIn, setIsAnimatingIn] = useState(false);
  const [debugMode, setDebugMode] = useState(false);

  // Debug mode toggle (only in development)
  useEffect(() => {
    const isDev = window.location.hostname === 'localhost' || window.location.hostname.includes('127.0.0.1');
    setDebugMode(isDev);
  }, []);

  // Force show NPS for debugging
  const forceShowNPS = () => {
    console.log('🔧 Force showing NPS widget');
    setIsVisible(true);
    setTimeout(() => setIsAnimatingIn(true), 50);
    
    // Track as debug event
    analytics.trackNPSWidgetEvent('shown', {
      debug: true,
      forced: true,
      timestamp: Date.now()
    });
  };

  // Check if user has already interacted with NPS
  useEffect(() => {
    const storageKey = `nps-${siteId}`;
    const lastResponse = localStorage.getItem(storageKey);
    
    if (lastResponse) {
      const responseData = JSON.parse(lastResponse);
      const daysSinceResponse = (Date.now() - responseData.timestamp) / (1000 * 60 * 60 * 24);
      
      // Show again after 90 days
      if (daysSinceResponse < 90) {
        return;
      }
    }

    // Check if user dismissed recently (don't show for 7 days)
    const dismissedKey = `nps-dismissed-${siteId}`;
    const lastDismissed = localStorage.getItem(dismissedKey);
    if (lastDismissed) {
      const daysSinceDismissed = (Date.now() - parseInt(lastDismissed)) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed < 7) {
        return;
      }
    }

    // Track page views
    const pageViewsKey = `nps-pageviews-${siteId}`;
    const currentPageViews = parseInt(localStorage.getItem(pageViewsKey) || '0');
    const newPageViews = currentPageViews + 1;
    localStorage.setItem(pageViewsKey, newPageViews.toString());

    // Don't show if not enough page views yet
    if (newPageViews < pageViewsBeforeShow) {
      return;
    }

    // Tracking variables for multiple conditions
    let timeoutId: NodeJS.Timeout;
    let timeOnPageId: NodeJS.Timeout;
    let startTime = Date.now();
    let hasShown = false;
    let timeConditionMet = false;
    let scrollConditionMet = false;
    let timeOnPageConditionMet = false;
    
    const checkAllConditions = () => {
      // Require BOTH scroll engagement AND time investment
      if (scrollConditionMet && (timeConditionMet || timeOnPageConditionMet)) {
        showWidget();
      }
    };
    
    const showWidget = () => {
      if (hasShown) return;
      hasShown = true;
      setIsVisible(true);
      
      // Track widget shown event
      analytics.trackNPSWidgetEvent('shown', {
        pageViews: newPageViews,
        timeOnSite: Math.round((Date.now() - startTime) / 1000),
        scrollPercentage: Math.round((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100)
      });
      
      // Add animation delay
      setTimeout(() => {
        setIsAnimatingIn(true);
      }, 50);
    };

    const handleScroll = () => {
      const scrolled = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
      if (scrolled > scrollThreshold && !scrollConditionMet) {
        scrollConditionMet = true;
        checkAllConditions();
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // User switched tabs/minimized - pause timer
        startTime = Date.now();
      }
    };

    // Condition 1: After specified time of total session
    timeoutId = setTimeout(() => {
      timeConditionMet = true;
      checkAllConditions();
    }, showAfterSeconds * 1000);

    // Condition 2: After time actively on current page
    timeOnPageId = setTimeout(() => {
      if (!document.hidden && (Date.now() - startTime) >= timeOnPageBeforeShow * 1000) {
        timeOnPageConditionMet = true;
        checkAllConditions();
      }
    }, timeOnPageBeforeShow * 1000);

    // Always listen for scroll
    window.addEventListener('scroll', handleScroll);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimeout(timeoutId);
      clearTimeout(timeOnPageId);
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [siteId, showAfterSeconds, scrollThreshold, pageViewsBeforeShow, timeOnPageBeforeShow]);

  const handleScoreClick = (selectedScore: number) => {
    setScore(selectedScore);
  };

  const handleSubmit = () => {
    if (score === null) return;

    const npsData: NPSData = {
      score,
      feedback,
      url: window.location.href,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
    };

    // Store response to prevent showing again
    localStorage.setItem(`nps-${siteId}`, JSON.stringify(npsData));

    // Send to analytics (replace with your preferred service)
    sendNPSData(npsData);
    
    setIsSubmitted(true);
    
    // Hide the widget after 4 seconds with animation
    setTimeout(() => {
      setIsAnimatingIn(false);
      setTimeout(() => {
        setIsVisible(false);
      }, 300); // Wait for exit animation
    }, 4000);
  };

  const handleClose = () => {
    // Track dismissal
    analytics.trackNPSWidgetEvent('dismissed', {
      hadScore: score !== null,
      hadFeedback: feedback.length > 0
    });
    
    // Store dismissal to prevent showing for a week
    localStorage.setItem(`nps-dismissed-${siteId}`, Date.now().toString());
    setIsDismissed(true);
    
    // Animate out
    setIsAnimatingIn(false);
    setTimeout(() => {
      setIsVisible(false);
    }, 300);
  };

  // Send NPS data using improved analytics
  const sendNPSData = (data: NPSData) => {
    analytics.trackNPSResponse(data);
  };

  if (!isVisible || isDismissed) {
    // Show debug button in development
    if (debugMode) {
      return (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          left: '20px',
          zIndex: 9999,
          backgroundColor: '#007acc',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '4px',
          fontSize: '12px',
          cursor: 'pointer',
          fontFamily: 'monospace'
        }} onClick={forceShowNPS}>
          🔧 Force NPS
        </div>
      );
    }
    return null;
  }

  return (
    <>
      <div className={`${styles.npsWidget} ${isAnimatingIn ? styles.visible : styles.hidden}`}>
      <div className={styles.npsWidgetContent}>
        <button className={styles.npsCloseBtn} onClick={handleClose}>×</button>
        
        {!isSubmitted ? (
          <div>
            <h4>How likely are you to recommend this documentation to a friend or colleague?</h4>
            
            <div className={styles.npsScale}>
              <div className={styles.npsScaleLabels}>
                <span className={styles.npsScaleLabel}>Not at all likely</span>
                <span className={styles.npsScaleLabel}>Extremely likely</span>
              </div>
              <div className={styles.npsScores}>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                  <button
                    key={num}
                    className={`${styles.npsScoreBtn} ${score === num ? styles.selected : ''}`}
                    onClick={() => handleScoreClick(num)}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            {score !== null && (
              <div className={styles.npsFeedbackSection}>
                <label htmlFor="nps-feedback">
                  What's the main reason for your score?
                </label>
                <textarea
                  id="nps-feedback"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Optional: Help us understand your rating..."
                  rows={3}
                />
                <button className={styles.npsSubmitBtn} onClick={handleSubmit}>
                  Submit
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className={styles.npsThankYou}>
            <h4>Thank you for your feedback!</h4>
            <p>Your input helps us improve our documentation.</p>
          </div>
        )}
      </div>
      </div>
      
      {/* Debug info panel in development */}
      {debugMode && isVisible && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '12px',
          borderRadius: '4px',
          fontSize: '11px',
          fontFamily: 'monospace',
          maxWidth: '300px',
          zIndex: 10000
        }}>
          <div>🛠️ NPS Debug Info</div>
          <div>_paq exists: {typeof window !== 'undefined' && !!window._paq ? '✅' : '❌'}</div>
          <div>Script loaded: {typeof window !== 'undefined' && !!document.querySelector('script[src*="matomo.js"]') ? '✅' : '❌'}</div>
          <div>Consent: {typeof window !== 'undefined' ? localStorage.getItem("matomoConsent") || 'none' : 'n/a'}</div>
          <div>Score: {score ?? 'not set'}</div>
          <div>Feedback: {feedback.length} chars</div>
        </div>
      )}
    </>
  );
}