import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

/**
 * The scope a fact collection belongs to.
 *
 * - `account`: only executions where `account` is in scope can access the collection.
 * - `public`: shared by all accounts, so any execution of the owning contract can access the collection.
 */
export type FactScope = { type: 'account'; account: AztecAddress } | { type: 'public' };

// Noir decodes these discriminants, so their values are part of the oracle interface.
const ACCOUNT = 1;
const PUBLIC = 2;

/** Serializes a {@link FactScope} to its Noir `[kind, account]` field layout. */
export function factScopeToFields(scope: FactScope): Fr[] {
  switch (scope.type) {
    case 'account':
      return [new Fr(ACCOUNT), scope.account.toField()];
    case 'public':
      return [new Fr(PUBLIC), Fr.ZERO];
  }
}

/** Deserializes a {@link FactScope}, rejecting malformed values. */
export function factScopeFromFields(kind: number, account: Fr): FactScope {
  switch (kind) {
    case ACCOUNT:
      return { type: 'account', account: AztecAddress.fromFieldUnsafe(account) };
    case PUBLIC:
      if (!account.isZero()) {
        throw new Error(`Public fact scope must not name an account, got ${account}`);
      }
      return { type: 'public' };
    default:
      throw new Error(`Unrecognized fact scope kind: ${kind}`);
  }
}
