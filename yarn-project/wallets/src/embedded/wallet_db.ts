import type { Aliased } from '@aztec/aztec.js/wallet';
import { Fq, Fr } from '@aztec/foundation/curves/bn254';
import type { LogFn } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

export const AccountTypes = ['schnorr', 'schnorr_initializerless', 'ecdsasecp256r1', 'ecdsasecp256k1'] as const;
export type AccountType = (typeof AccountTypes)[number];

function accountKey(field: string, address: AztecAddress | string): string {
  return `${field}:${address.toString()}`;
}

/** Bump when the WalletDB layout changes; a new version selects a fresh store, leaving the old one intact. */
export const WALLET_DATA_SCHEMA_VERSION = 1;

export class WalletDB {
  private accounts: AztecAsyncMap<string, Buffer>;
  private aliases: AztecAsyncMap<string, Buffer>;

  constructor(
    private store: AztecAsyncKVStore,
    private userLog: LogFn,
  ) {
    this.accounts = store.openMap<string, Buffer>('accounts');
    this.aliases = store.openMap<string, Buffer>('aliases');
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
    await this.store.transactionAsync(async () => {
      if (alias) {
        await this.aliases.set(`accounts:${alias}`, Buffer.from(address.toString()));
      }
      await this.accounts.set(accountKey('type', address), Buffer.from(type));
      await this.accounts.set(accountKey('sk', address), secretKey.toBuffer());
      await this.accounts.set(accountKey('salt', address), salt.toBuffer());
      await this.accounts.set(
        accountKey('signingKey', address),
        'toBuffer' in signingKey ? signingKey.toBuffer() : signingKey,
      );
    });
    log(`Account stored in database${alias ? ` with alias ${alias}` : ''}`);
  }

  async storeSender(address: AztecAddress, alias: string, log: LogFn = this.userLog) {
    await this.aliases.set(`senders:${alias}`, Buffer.from(address.toString()));
    log(`Sender stored in database with alias ${alias}`);
  }

  async retrieveAccount(address: AztecAddress | string) {
    const secretKeyBuffer = await this.accounts.getAsync(accountKey('sk', address));
    if (!secretKeyBuffer) {
      throw new Error(`Account "${address.toString()}" does not exist on this wallet.`);
    }
    const [saltBuffer, typeBuffer, signingKey] = await Promise.all([
      this.accounts.getAsync(accountKey('salt', address)),
      this.accounts.getAsync(accountKey('type', address)),
      this.accounts.getAsync(accountKey('signingKey', address)),
    ]);
    const secretKey = Fr.fromBuffer(secretKeyBuffer);
    const salt = Fr.fromBuffer(saltBuffer!);
    const type = typeBuffer!.toString('utf8') as AccountType;
    return { address, secretKey, salt, type, signingKey: signingKey! };
  }

  async listAccounts(): Promise<Aliased<AztecAddress>[]> {
    // Read aliases and account addresses in parallel using range queries
    const [aliasesByAddress, accountAddresses] = await Promise.all([
      this.#readAccountAliases(),
      this.#readAccountAddresses(),
    ]);

    return accountAddresses.map(addressStr => ({
      alias: aliasesByAddress.get(addressStr) ?? '',
      item: AztecAddress.fromStringUnsafe(addressStr),
    }));
  }

  async listSenders(): Promise<Aliased<AztecAddress>[]> {
    const result: Aliased<AztecAddress>[] = [];
    for await (const [alias, item] of this.aliases.entriesAsync({ start: 'senders:', end: 'senders:\uffff' })) {
      result.push({
        alias: alias.slice('senders:'.length),
        item: AztecAddress.fromStringUnsafe(item.toString()),
      });
    }
    return result;
  }

  async #readAccountAliases(): Promise<Map<string, string>> {
    const aliasesByAddress = new Map<string, string>();
    for await (const [alias, item] of this.aliases.entriesAsync({ start: 'accounts:', end: 'accounts:\uffff' })) {
      const address = item.toString();
      aliasesByAddress.set(address, alias.slice('accounts:'.length));
    }
    return aliasesByAddress;
  }

  async #readAccountAddresses(): Promise<string[]> {
    const addresses: string[] = [];
    // Range query on 'type:' prefix — one entry per account, avoids scanning sk/salt/signingKey entries
    for await (const [key] of this.accounts.entriesAsync({ start: 'type:', end: 'type:\uffff' })) {
      addresses.push(key.slice('type:'.length));
    }
    return addresses;
  }

  /**
   * Deletes an account's stored data and its alias atomically. Deletion is local to this store;
   * any state the PXE holds for the account is unaffected.
   */
  async deleteAccount(address: AztecAddress) {
    await this.store.transactionAsync(async () => {
      await Promise.all([
        this.accounts.delete(accountKey('sk', address)),
        this.accounts.delete(accountKey('salt', address)),
        this.accounts.delete(accountKey('type', address)),
        this.accounts.delete(accountKey('signingKey', address)),
      ]);
      // Clean up alias if one exists
      const aliasesByAddress = await this.#readAccountAliases();
      const alias = aliasesByAddress.get(address.toString());
      if (alias) {
        await this.aliases.delete(`accounts:${alias}`);
      }
    });
  }

  async close() {
    await this.store.close();
  }
}
