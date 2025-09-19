// Analytics utilities for Aztec Docs
// Provides type-safe Matomo integration with fallback handling

interface NPSAnalyticsData {
  score: number;
  feedback: string;
  url: string;
  timestamp: number;
  userAgent: string;
  category?: 'promoter' | 'passive' | 'detractor';
}

interface AnalyticsConfig {
  enableConsoleLogging?: boolean;
  enableMatomo?: boolean;
  requireConsent?: boolean;
}

class AnalyticsManager {
  private config: AnalyticsConfig;
  
  constructor(config: AnalyticsConfig = {}) {
    this.config = {
      enableConsoleLogging: true,
      enableMatomo: true,
      requireConsent: true,
      ...config
    };
  }

  /**
   * Check if Matomo is available and user has consented
   */
  private isMatomoAvailable(): boolean {
    if (!this.config.enableMatomo) return false;
    
    // Check if _paq exists
    if (typeof window === 'undefined' || !window._paq) return false;
    
    // Check consent if required
    if (this.config.requireConsent) {
      const consent = localStorage.getItem("matomoConsent");
      return consent === "true";
    }
    
    return true;
  }

  /**
   * Get NPS category from score
   */
  private getNPSCategory(score: number): 'promoter' | 'passive' | 'detractor' {
    if (score >= 9) return 'promoter';
    if (score >= 7) return 'passive';
    return 'detractor';
  }

  /**
   * Track NPS response with comprehensive analytics
   */
  trackNPSResponse(data: NPSAnalyticsData): void {
    const category = this.getNPSCategory(data.score);
    const enhancedData = { ...data, category };

    // Console logging (for development and debugging)
    if (this.config.enableConsoleLogging) {
      console.group('📊 NPS Response Tracked');
      console.table({
        Score: data.score,
        Category: category,
        'Has Feedback': data.feedback.length > 0,
        URL: data.url,
        Timestamp: new Date(data.timestamp).toISOString()
      });
      if (data.feedback) {
        console.log('💬 Feedback:', data.feedback);
      }
      console.groupEnd();
    }

    // Matomo tracking
    if (this.isMatomoAvailable()) {
      try {
        // Main NPS event
        window._paq!.push([
          'trackEvent',
          'NPS Survey',
          'Score Submitted',
          `Score ${data.score} (${category})`,
          data.score
        ]);

        // Category-specific event
        window._paq!.push([
          'trackEvent',
          'NPS Category',
          category.charAt(0).toUpperCase() + category.slice(1),
          window.location.pathname,
          data.score
        ]);

        // Feedback tracking (if provided)
        if (data.feedback && data.feedback.trim().length > 0) {
          window._paq!.push([
            'trackEvent',
            'NPS Feedback',
            'Feedback Provided',
            `${category} - ${data.feedback.slice(0, 100)}...`,
            data.feedback.length
          ]);
        }

        // Custom dimensions for better analysis
        window._paq!.push(['setCustomVariable', 1, 'NPS Score', data.score.toString(), 'page']);
        window._paq!.push(['setCustomVariable', 2, 'NPS Category', category, 'page']);
        
        // Track as goal if it's a promoter (assuming goal ID 1 for high satisfaction)
        if (category === 'promoter') {
          window._paq!.push(['trackGoal', 1, data.score]);
        }

      } catch (error) {
        console.warn('Matomo tracking failed:', error);
        this.trackFallback('matomo_error', { error: error.message, data: enhancedData });
      }
    } else {
      // Fallback tracking when Matomo is unavailable
      this.trackFallback('nps_response', enhancedData);
    }
  }

  /**
   * Track NPS widget events (shown, dismissed, etc.)
   */
  trackNPSWidgetEvent(action: 'shown' | 'dismissed' | 'timeout', metadata?: Record<string, any>): void {
    if (this.config.enableConsoleLogging) {
      console.log(`📋 NPS Widget: ${action}`, metadata);
    }

    if (this.isMatomoAvailable()) {
      window._paq!.push([
        'trackEvent',
        'NPS Widget',
        action.charAt(0).toUpperCase() + action.slice(1),
        window.location.pathname,
        metadata ? JSON.stringify(metadata).length : undefined
      ]);
    } else {
      this.trackFallback('nps_widget_event', { action, metadata });
    }
  }

  /**
   * Fallback tracking when main analytics is unavailable
   */
  private trackFallback(event: string, data: any): void {
    // Store in localStorage for later sync (when analytics becomes available)
    try {
      const fallbackEvents = JSON.parse(localStorage.getItem('analytics_fallback') || '[]');
      fallbackEvents.push({
        event,
        data,
        timestamp: Date.now(),
        url: window.location.href
      });
      
      // Keep only last 50 events to prevent storage bloat
      if (fallbackEvents.length > 50) {
        fallbackEvents.splice(0, fallbackEvents.length - 50);
      }
      
      localStorage.setItem('analytics_fallback', JSON.stringify(fallbackEvents));
    } catch (error) {
      console.warn('Fallback tracking failed:', error);
    }
  }

  /**
   * Send any stored fallback events to Matomo (call when Matomo becomes available)
   */
  syncFallbackEvents(): void {
    if (!this.isMatomoAvailable()) return;

    try {
      const fallbackEvents = JSON.parse(localStorage.getItem('analytics_fallback') || '[]');
      
      fallbackEvents.forEach((storedEvent: any) => {
        if (storedEvent.event === 'nps_response') {
          this.trackNPSResponse(storedEvent.data);
        } else if (storedEvent.event === 'nps_widget_event') {
          this.trackNPSWidgetEvent(storedEvent.data.action, storedEvent.data.metadata);
        }
      });

      // Clear fallback events after successful sync
      localStorage.removeItem('analytics_fallback');
      
      if (fallbackEvents.length > 0) {
        console.log(`📤 Synced ${fallbackEvents.length} fallback analytics events`);
      }
    } catch (error) {
      console.warn('Failed to sync fallback events:', error);
    }
  }
}

// Export singleton instance
export const analytics = new AnalyticsManager();

// Export types
export type { NPSAnalyticsData, AnalyticsConfig };