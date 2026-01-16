import React, { useState } from 'react';
import Footer from '@theme-original/Footer';
import styles from './Footer.module.css';
import { isValidEmail } from '@site/src/utils/emailValidation';
import { analytics } from '@site/src/utils/analytics';

// External link icon component
const ExternalLinkIcon = () => (
  <svg width="13.5" height="13.5" aria-hidden="true" viewBox="0 0 24 24" className="iconExternalLink_nPIU">
    <path fill="currentColor" d="M21 13v10h-21v-19h12v2h-10v15h17v-8h2zm3-12h-10.988l4.035 4-6.977 7.07 2.828 2.828 6.977-7.07 4.125 4.172v-11z"/>
  </svg>
);

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

          {/* Right side - Original Barretenberg footer content */}
          <div className={styles.footerRight}>
            <div className="row footer__links">
              <div className="col footer__col">
                <div className="footer__title">Community</div>
                <ul className="footer__items clean-list">
                  <li className="footer__item">
                    <a className="footer__link-item" href="https://forum.aztec.network">
                      Forum
                      <ExternalLinkIcon />
                    </a>
                  </li>
                  <li className="footer__item">
                    <a className="footer__link-item" href="https://discord.com/invite/aztec">
                      Discord
                      <ExternalLinkIcon />
                    </a>
                  </li>
                  <li className="footer__item">
                    <a className="footer__link-item" href="https://x.com/aztecnetwork">
                      X (Twitter)
                      <ExternalLinkIcon />
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
                      <ExternalLinkIcon />
                    </a>
                  </li>
                  <li className="footer__item">
                    <a className="footer__link-item" href="https://github.com/AztecProtocol/awesome-aztec">
                      Awesome Aztec
                      <ExternalLinkIcon />
                    </a>
                  </li>
                  <li className="footer__item">
                    <a className="footer__link-item" href="https://aztec.network/grants">
                      Grants
                      <ExternalLinkIcon />
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