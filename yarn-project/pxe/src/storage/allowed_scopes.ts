import { AztecAddress } from '@aztec/stdlib/aztec-address';

/**
 * Asserts that `scope` is permitted by `allowedScopes`. The zero address is always permitted (it denotes the global
 * scope). Throws otherwise.
 */
export function assertAllowedScope(scope: AztecAddress, allowedScopes: AztecAddress[]): void {
  if (scope.equals(AztecAddress.ZERO)) {
    return;
  }
  if (!allowedScopes.some((allowed: AztecAddress) => allowed.equals(scope))) {
    throw new Error(
      `Scope ${scope.toString()} is not in the allowed scopes list: [${allowedScopes
        .map((s: AztecAddress) => s.toString())
        .join(', ')}]. See https://docs.aztec.network/errors/10`,
    );
  }
}
