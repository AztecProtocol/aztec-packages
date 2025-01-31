// Needed until we move off of Node v18.19.1
if (typeof globalThis.CustomEvent !== 'function') {
  class CustomEventPolyfill {
    constructor(event, params = {}) {
      const { bubbles = false, cancelable = false, detail = undefined } = params;
      this.type = event;
      this.bubbles = bubbles;
      this.cancelable = cancelable;
      this.detail = detail;
    }
  }
  globalThis.CustomEvent = CustomEventPolyfill;
}
