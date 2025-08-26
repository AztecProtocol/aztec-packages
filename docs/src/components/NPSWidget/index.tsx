import React, { useState, useEffect } from 'react';
import styles from './styles.module.css';

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
    // Store dismissal to prevent showing for a week
    localStorage.setItem(`nps-dismissed-${siteId}`, Date.now().toString());
    setIsDismissed(true);
    
    // Animate out
    setIsAnimatingIn(false);
    setTimeout(() => {
      setIsVisible(false);
    }, 300);
  };

  // Replace this with your actual analytics integration
  const sendNPSData = (data: NPSData) => {
    // Example integrations:
    
    // 1. Console log for development
    console.log('NPS Response:', data);
    
    // 2. Google Analytics 4
    // if (typeof gtag !== 'undefined') {
    //   gtag('event', 'nps_response', {
    //     score: data.score,
    //     feedback: data.feedback,
    //     custom_parameter_url: data.url
    //   });
    // }
    
    // 3. PostHog
    // if (typeof posthog !== 'undefined') {
    //   posthog.capture('nps_response', {
    //     score: data.score,
    //     feedback: data.feedback,
    //     url: data.url
    //   });
    // }
    
    // 4. Custom API endpoint
    // fetch('/api/nps', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(data)
    // });
    
    // 5. Matomo (if you prefer to use your existing setup)
    // if (typeof _paq !== 'undefined') {
    //   _paq.push(['trackEvent', 'NPS', 'Response', `Score: ${data.score}`, data.score]);
    //   if (data.feedback) {
    //     _paq.push(['trackEvent', 'NPS', 'Feedback', data.feedback]);
    //   }
    // }
  };

  if (!isVisible || isDismissed) return null;

  return (
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
  );
}