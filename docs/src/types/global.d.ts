// Global type declarations for Aztec Docs

declare global {
  interface Window {
    _paq?: Array<Array<string | number | boolean | null>>;
    analytics?: {
      trackNPSResponse: (data: any) => void;
      trackNPSWidgetEvent: (action: string, metadata?: any) => void;
      syncFallbackEvents: () => void;
    };
  }
}

// Matomo tracking interface
export interface MatomoTracker {
  push: (instruction: Array<string | number | boolean | null>) => void;
  trackEvent: (category: string, action: string, name?: string, value?: number) => void;
  trackGoal: (goalId: number, customRevenue?: number) => void;
  setCustomVariable: (index: number, name: string, value: string, scope?: 'visit' | 'page') => void;
}

export {};