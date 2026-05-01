import { createLogger } from '@aztec/foundation/log';
import { FunctionSelector } from '@aztec/stdlib/abi';

const MAX_FUNCTION_SIGNATURES = 1000;
const MAX_FUNCTION_NAME_LEN = 256;

/**
 * In-memory cache mapping public function selectors to function names.
 *
 * Populated opportunistically (e.g. by PXE registering signatures from artifacts) so the
 * archiver can attach human-readable names to logs and traces. Bounded by
 * {@link MAX_FUNCTION_SIGNATURES} to avoid unbounded growth from untrusted callers.
 */
export class FunctionNamesCache {
  private readonly log = createLogger('archiver:data-stores');
  private readonly names: Map<string, string> = new Map();

  /** Adds the given public function signatures to the cache. */
  public async register(signatures: string[]): Promise<void> {
    for (const sig of signatures) {
      if (this.names.size > MAX_FUNCTION_SIGNATURES) {
        return;
      }
      try {
        const selector = await FunctionSelector.fromSignature(sig);
        this.names.set(selector.toString(), sig.slice(0, sig.indexOf('(')).slice(0, MAX_FUNCTION_NAME_LEN));
      } catch {
        this.log.warn(`Failed to parse signature: ${sig}. Ignoring`);
      }
    }
  }

  /** Looks up a function name for the given selector, or returns undefined if not registered. */
  public get(selector: FunctionSelector): string | undefined {
    return this.names.get(selector.toString());
  }
}
