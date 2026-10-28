/**
 * Shared utilities for the Aztec Tutorial Wallet extension.
 * Extracted from multiple files to eliminate duplication.
 */

/**
 * Resolves the real Chrome runtime object.
 * Needed in offscreen documents where polyfills may shadow the global.
 */
export function getChromeRuntime(): typeof chrome {
  const candidates = [
    typeof self !== 'undefined' ? (self as any).chrome : undefined,
    typeof window !== 'undefined' ? (window as any).chrome : undefined,
    (globalThis as any).chrome,
  ];

  for (const candidate of candidates) {
    if (candidate?.runtime?.sendMessage) {
      return candidate;
    }
  }

  throw new Error('Chrome runtime API not available');
}

/**
 * Extracts a human-readable error message from any thrown value.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Extracts the hostname from an origin URL, falling back to the raw string.
 */
export function getOriginHost(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}

