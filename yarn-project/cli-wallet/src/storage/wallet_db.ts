import { AztecAddress, Fr } from '@aztec/circuits.js';
import { type AztecKVStore, type AztecMap } from '@aztec/kv-store';

import { AccountType } from '../utils/accounts.js';

export class WalletDB {
  #accounts!: AztecMap<string, Buffer>;

  private static instance: WalletDB;

  static getInstance() {
    if (!WalletDB.instance) {
      WalletDB.instance = new WalletDB();
    }

    return WalletDB.instance;
  }

  init(store: AztecKVStore) {
    this.#accounts = store.openMap('accounts');
  }

  async storeAccount(
    address: AztecAddress,
    { type, secretKey, salt, alias }: { type: AccountType; secretKey: Fr; salt: Fr; alias: string | undefined },
  ) {
    if (alias) {
      await this.#accounts.set(`${alias}`, address.toBuffer());
    }
    await this.#accounts.set(`${address.toString()}-type`, Buffer.from(type));
    await this.#accounts.set(`${address.toString()}-sk`, secretKey.toBuffer());
    await this.#accounts.set(`${address.toString()}-salt`, salt.toBuffer());
  }

  async storeAccountMetadata(aliasOrAddress: AztecAddress | string, metadataKey: string, metadata: Buffer) {
    const { address } = this.retrieveAccount(aliasOrAddress);
    await this.#accounts.set(`${address.toString()}-${metadataKey}`, metadata);
  }

  retrieveAccountMetadata(aliasOrAddress: AztecAddress | string, metadataKey: string) {
    const { address } = this.retrieveAccount(aliasOrAddress);
    const result = this.#accounts.get(`${address.toString()}-${metadataKey}`);
    if (!result) {
      throw new Error(`Could not find metadata with key ${metadataKey} for account ${aliasOrAddress}`);
    }
    return result;
  }

  retrieveAccount(aliasOrAddress: AztecAddress | string) {
    const address =
      typeof aliasOrAddress === 'object'
        ? aliasOrAddress
        : AztecAddress.fromBuffer(this.#accounts.get(aliasOrAddress)!);
    const secretKeyBuffer = this.#accounts.get(`${address.toString()}-sk`);
    if (!secretKeyBuffer) {
      throw new Error(
        `Could not find ${address}-sk. Account "${aliasOrAddress.toString}" does not exist on this wallet.`,
      );
    }
    const secretKey = Fr.fromBuffer(secretKeyBuffer);
    const salt = Fr.fromBuffer(this.#accounts.get(`${address.toString()}-salt`)!);
    const type = this.#accounts.get(`${address.toString()}-type`)!.toString('utf8') as AccountType;
    return { address, secretKey, salt, type };
  }
}
