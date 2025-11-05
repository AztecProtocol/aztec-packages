import React, { useState } from 'react';
import Footer from '@theme-original/Footer';
import styles from './Footer.module.css';
import { isValidEmail } from '@site/src/utils/emailValidation';
import { analytics } from '@site/src/utils/analytics';

export default function FooterWrapper(props) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Clear previous messages
    setError('');

    if (!email.trim()) {
      setError('Email address is required');
      return;
    }

    // Validate email using marketing's validation logic
    if (!isValidEmail(email)) {
      setError('Please provide a valid email address');
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Track subscription attempt
      analytics.trackEvent('Email Subscription', 'Attempted', 'footer');

      // Call the real Brevo API endpoint
      const response = await fetch('/.netlify/functions/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          email: email.trim(),
          source: 'docs-footer',
          timestamp: Date.now(),
          url: window.location.href
        }),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.alreadySubscribed) {
          // Handle already subscribed case - show as success with different message
          setIsSubscribed(true);
          setSuccessMessage("It looks like you're already subscribed, good for you! 🎉");
          setEmail('');

          // Track already subscribed event
          analytics.trackEvent('Email Subscription', 'Already Subscribed', 'footer');
        } else {
          // Handle new subscription success
          setIsSubscribed(true);
          setSuccessMessage("Thanks for subscribing! 🎉");
          setEmail('');

          // Track successful subscription
          analytics.trackEvent('Email Subscription', 'Successful', 'footer');
        }

        console.log('✅ Subscription response:', data.message);
      } else if (response.status === 429) {
        // Rate limited
        const retryAfter = data.retryAfter || 60;
        const minutes = Math.ceil(retryAfter / 60);
        throw new Error(`Please wait ${minutes} minute${minutes > 1 ? 's' : ''} before trying again.`);
      } else {
        throw new Error(data.error || 'Subscription failed');
      }
      
    } catch (err) {
      console.error('Subscription error:', err);
      setError(err.message || 'Failed to subscribe. Please try again.');
      
      // Track subscription error
      analytics.trackEvent('Email Subscription', 'Failed', 'footer');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <footer className="footer footer--dark">
      <div className="container">
        <div className={styles.footerGrid}>
          
          {/* Left side - Email subscription */}
          <div className={styles.footerLeft}>
            <h3 className={styles.footerTitle}>Build the future with Aztec</h3>
            
            {isSubscribed ? (
              <div className={styles.successMessage}>
                <p>{successMessage}</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className={styles.subscriptionForm}>
                <div className={styles.inputContainer}>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter email"
                    className={styles.emailInput}
                    disabled={isSubmitting}
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting || !email.trim()}
                    className={styles.submitButton}
                  >
                    {isSubmitting ? (
                      <div className={styles.spinner} />
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                    )}
                  </button>
                </div>
                {error && (
                  <div className={styles.errorMessage}>
                    {error}
                  </div>
                )}
              </form>
            )}
          </div>

          {/* Right side - Original Docusaurus footer content */}
          <div className={styles.footerRight}>
            <div className="row footer__links">
              <div className="col footer__col">
                <div className="footer__title">Docs</div>
                <ul className="footer__items clean-list">
                  <li className="footer__item">
                    <a className="footer__link-item" href="/">Introduction</a>
                  </li>
                  <li className="footer__item">
                    <a className="footer__link-item" href="/developers/getting_started">Developer Getting Started</a>
                  </li>
                  <li className="footer__item">
                    <a className="footer__link-item" href="https://github.com/AztecProtocol/aztec-nr">
                      Aztec.nr
                      <svg width="13.5" height="13.5" aria-hidden="true" className="iconExternalLink_nPIU">
                        <use href="#theme-svg-external-link"></use>
                      </svg>
                    </a>
                  </li>
                </ul>
              </div>

              <div className="col footer__col">
                <div className="footer__title">Community</div>
                <ul className="footer__items clean-list">
                  <li className="footer__item">
                    <a className="footer__link-item" href="https://forum.aztec.network">
                      Forum
                      <svg width="13.5" height="13.5" aria-hidden="true" className="iconExternalLink_nPIU">
                        <use href="#theme-svg-external-link"></use>
                      </svg>
                    </a>
                  </li>
                  <li className="footer__item">
                    <a className="footer__link-item" href="https://discord.com/invite/JtqzkdeQ6G">
                      Noir Discord
                      <svg width="13.5" height="13.5" aria-hidden="true" className="iconExternalLink_nPIU">
                        <use href="#theme-svg-external-link"></use>
                      </svg>
                    </a>
                  </li>
                  <li className="footer__item">
                    <a className="footer__link-item" href="https://x.com/aztecnetwork">
                      X (Twitter)
                      <svg width="13.5" height="13.5" aria-hidden="true" className="iconExternalLink_nPIU">
                        <use href="#theme-svg-external-link"></use>
                      </svg>
                    </a>
                  </li>
                </ul>
              </div>

              <div className="col footer__col">
                <div className="footer__title">More</div>
                <ul className="footer__items clean-list">
                  <li className="footer__item">
                    <a className="footer__link-item" href="https://github.com/AztecProtocol">
                      GitHub
                      <svg width="13.5" height="13.5" aria-hidden="true" className="iconExternalLink_nPIU">
                        <use href="#theme-svg-external-link"></use>
                      </svg>
                    </a>
                  </li>
                  <li className="footer__item">
                    <a className="footer__link-item" href="https://github.com/AztecProtocol/awesome-aztec">
                      Awesome Aztec
                      <svg width="13.5" height="13.5" aria-hidden="true" className="iconExternalLink_nPIU">
                        <use href="#theme-svg-external-link"></use>
                      </svg>
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
        
        {/* Bottom copyright - using original Docusaurus styling */}
        <div className="footer__bottom text--center">
          <div className="footer__copyright">
            © {new Date().getFullYear()} Aztec Labs. Built with privacy in mind.
          </div>
        </div>
      </div>
    </footer>
  );
}