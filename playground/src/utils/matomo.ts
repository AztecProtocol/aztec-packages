declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _paq: any[];
  }
}

export const trackButtonClick = (buttonName: string, category: string = 'Button Clicks') => {
  if (typeof window._paq !== 'undefined') {
    window._paq.push(['trackEvent', category, buttonName]);
  }
};

