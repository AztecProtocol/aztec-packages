import type { Aliased } from '@aztec/aztec.js/wallet';
import { Fq, Fr } from '@aztec/foundation/curves/bn254';
import type { LogFn } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { Buffer } from 'buffer';

export const AccountTypes = ['schnorr', 'ecdsasecp256r1', 'ecdsasecp256k1'] as const;
export type AccountType = (typeof AccountTypes)[number];

/** Stored shape of an account record. All byte fields are `toBuffer()`-encoded so
 *  they round-trip cleanly through msgpackr. */
type StoredAccount = {
  type: AccountType;
  secretKey: Buffer;
  salt: Buffer;
  signingKey: Buffer;
};

/**
 * Persists wallet account data and user-defined aliases.
 *
 * Layout (opaqueKeys on all three maps — keys are user account addresses and
 * user-chosen alias strings, which this design keeps out of on-disk plaintext
 * when the backing store is encrypted):
 *   - `accounts`: address.toString() → StoredAccount
 *   - `account_aliases`: alias → address bytes
 *   - `sender_aliases`:  alias → address bytes
 *
 * The two alias maps are separate (instead of a shared map with `accounts:` /
 * `senders:` prefixes, as before) because opaqueKeys HMACs the keys — prefix
 * range queries no longer work over HMAC'd keys. One map per namespace is both
 * cleaner structurally and enables opaqueKeys uniformly.
 */
export class WalletDB {
  private constructor(
    private accounts: AztecAsyncMap<string, StoredAccount>,
    private accountAliases: AztecAsyncMap<string, Buffer>,
    private senderAliases: AztecAsyncMap<string, Buffer>,
    private userLog: LogFn,
  ) {}

  static init(store: AztecAsyncKVStore, userLog: LogFn) {
    const accounts = store.openMap<string, StoredAccount>('accounts', { opaqueKeys: true });
    const accountAliases = store.openMap<string, Buffer>('account_aliases', { opaqueKeys: true });
    const senderAliases = store.openMap<string, Buffer>('sender_aliases', { opaqueKeys: true });
    return new WalletDB(accounts, accountAliases, senderAliases, userLog);
  }

  async storeAccount(
    address: AztecAddress,
    {
      type,
      secretKey,
      salt,
      alias,
      signingKey,
    }: {
      type: AccountType;
      secretKey: Fr;
      salt: Fr;
      signingKey: Fq | Buffer;
      alias: string | undefined;
    },
    log: LogFn = this.userLog,
  ) {
    const addressStr = address.toString();
    if (alias) {
      await this.accountAliases.set(alias, Buffer.from(addressStr));
    }
    await this.accounts.set(addressStr, {
      type,
      secretKey: secretKey.toBuffer(),
      salt: salt.toBuffer(),
      signingKey: 'toBuffer' in signingKey ? signingKey.toBuffer() : signingKey,
    });
    log(`Account stored in database${alias ? ` with alias ${alias}` : ''}`);
  }

  async storeSender(address: AztecAddress, alias: string, log: LogFn = this.userLog) {
    await this.senderAliases.set(alias, Buffer.from(address.toString()));
    log(`Sender stored in database with alias ${alias}`);
  }

  async retrieveAccount(address: AztecAddress | string) {
    const addressStr = typeof address === 'string' ? address : address.toString();
    const stored = await this.accounts.getAsync(addressStr);
    if (!stored) {
      throw new Error(`Account "${addressStr}" does not exist on this wallet.`);
    }
    // msgpackr returns Uint8Array for Buffer fields after the browser round-trip;
    // wrap back to Buffer at the boundary so downstream `Fr.fromBuffer` / consumers
    // that rely on Buffer methods keep working.
    return {
      address,
      secretKey: Fr.fromBuffer(Buffer.from(stored.secretKey)),
      salt: Fr.fromBuffer(Buffer.from(stored.salt)),
      type: stored.type,
      signingKey: Buffer.from(stored.signingKey),
    };
  }

  async listAccounts(): Promise<Aliased<AztecAddress>[]> {
    const aliasesByAddress = await this.#readAccountAliases();
    const result: Aliased<AztecAddress>[] = [];
    for await (const addressStr of this.accounts.keysAsync()) {
      result.push({
        alias: aliasesByAddress.get(addressStr) ?? '',
        item: AztecAddress.fromString(addressStr),
      });
    }
    return result;
  }

  async listSenders(): Promise<Aliased<AztecAddress>[]> {
    const result: Aliased<AztecAddress>[] = [];
    for await (const [alias, item] of this.senderAliases.entriesAsync()) {
      result.push({
        alias,
        item: AztecAddress.fromString(Buffer.from(item).toString()),
      });
    }
    return result;
  }

  async #readAccountAliases(): Promise<Map<string, string>> {
    const aliasesByAddress = new Map<string, string>();
    for await (const [alias, item] of this.accountAliases.entriesAsync()) {
      aliasesByAddress.set(Buffer.from(item).toString(), alias);
    }
    return aliasesByAddress;
  }

  async deleteAccount(address: AztecAddress) {
    const addressStr = address.toString();
    await this.accounts.delete(addressStr);
    // Clean up any alias pointing at this address. Opaque-keys maps don't support
    // reverse indexing, so iterate and match — the alias set per user is small.
    for await (const [alias, item] of this.accountAliases.entriesAsync()) {
      if (Buffer.from(item).toString() === addressStr) {
        await this.accountAliases.delete(alias);
      }
    }
  }
}
