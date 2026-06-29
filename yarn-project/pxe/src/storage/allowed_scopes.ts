import { AztecAddress } from '@aztec/stdlib/aztec-address';

/**
 * Asserts that `scope` is one of `allowedScopes`, throwing otherwise.
 */
export function assertAllowedScope(scope: AztecAddress, allowedScopes: AztecAddress[]): void {
  if (!allowedScopes.some((allowed: AztecAddress) => allowed.equals(scope))) {
    throw new Error(
      `Scope ${scope.toString()} is not in the allowed scopes list: [${allowedScopes
        .map((s: AztecAddress) => s.toString())
        .join(', ')}]. See https://docs.aztec.network/errors/10`,
    );
  }
}
