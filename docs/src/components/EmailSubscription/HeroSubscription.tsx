import React, { useState } from 'react';
import styles from './HeroSubscription.module.css';

interface HeroSubscriptionProps {
  title?: string;
  subtitle?: string;
  placeholder?: string;
  source?: string;
}

export default function HeroSubscription({
  title = "Build the future with Aztec",
  subtitle = "",
  placeholder = "Enter email",
  source = "hero-footer"
}: HeroSubscriptionProps) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState('');

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      setError('Email address is required');
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      // Track subscription attempt
      if (typeof window !== 'undefined' && window.analytics) {
        window.analytics.trackEvent('Email Subscription', 'Attempted', source);
      }

      // Demo mode - simulate success
      console.log('📧 Hero subscription:', { email, source, timestamp: Date.now() });
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setIsSubscribed(true);
      setEmail('');
      
      // Track successful subscription
      if (typeof window !== 'undefined' && window.analytics) {
        window.analytics.trackEvent('Email Subscription', 'Successful', source);
      }
      
      console.log('✅ Hero subscription successful for:', email);
      
    } catch (err) {
      setError('Something went wrong. Please try again.');
      console.error('Subscription error:', err);
      
      // Track subscription error
      if (typeof window !== 'undefined' && window.analytics) {
        window.analytics.trackEvent('Email Subscription', 'Failed', source);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubscribed) {
    return (
      <div className={styles.heroContainer}>
        <div className={styles.heroContent}>
          <div className={styles.successState}>
            <h2 className={styles.heroTitle}>Thank you!</h2>
            <p className={styles.successMessage}>You'll hear from us soon with the latest updates.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.heroContainer}>
      <div className={styles.heroContent}>
        <h2 className={styles.heroTitle}>{title}</h2>
        {subtitle && <p className={styles.heroSubtitle}>{subtitle}</p>}
        
        <form onSubmit={handleSubmit} className={styles.heroForm}>
          <div className={styles.inputContainer}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={placeholder}
              className={styles.heroInput}
              disabled={isSubmitting}
              aria-label="Email address"
            />
            <button
              type="submit"
              disabled={isSubmitting || !email.trim()}
              className={styles.heroButton}
              aria-label="Subscribe"
            >
              {isSubmitting ? (
                <div className={styles.loadingSpinner} />
              ) : (
                <svg 
                  width="24" 
                  height="24" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2"
                >
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              )}
            </button>
          </div>
          
          {error && (
            <div className={styles.errorMessage} role="alert">
              {error}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}