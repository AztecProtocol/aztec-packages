import { Fr } from '@aztec/foundation/fields';
import type { LogFn } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GasSettings } from '@aztec/stdlib/gas';
import type { TxHash } from '@aztec/stdlib/tx';

import type { AccountType } from '../utils/accounts.js';
import { extractECDSAPublicKeyFromBase64String } from '../utils/ecdsa.js';

export const Aliases = ['accounts', 'contracts', 'artifacts', 'secrets', 'transactions', 'authwits'] as const;
export type AliasType = (typeof Aliases)[number];

export class WalletDB {
  #accounts!: AztecAsyncMap<string, Buffer>;
  #aliases!: AztecAsyncMap<string, Buffer>;
  #bridgedFeeJuice!: AztecAsyncMap<string, Buffer>;
  #transactions!: AztecAsyncMap<string, Buffer>;

  private static instance: WalletDB;

  private aliasCache = new Map<string, string>();

  static getInstance() {
    if (!WalletDB.instance) {
      WalletDB.instance = new WalletDB();
    }

    return WalletDB.instance;
  }

  async init(store: AztecAsyncKVStore) {
    this.#accounts = store.openMap('accounts');
    this.#aliases = store.openMap('aliases');
    this.#bridgedFeeJuice = store.openMap('bridgedFeeJuice');
    this.#transactions = store.openMap('transactions');

    await this.refreshAliasCache();
  }

  private async refreshAliasCache() {
    this.aliasCache = new Map((await this.listAliases()).map(({ key, value }) => [key, value]));
  }

  async pushBridgedFeeJuice(recipient: AztecAddress, secret: Fr, amount: bigint, leafIndex: bigint, log: LogFn) {
    let stackPointer = (await this.#bridgedFeeJuice.getAsync(`${recipient.toString()}:stackPointer`))?.readInt8() || 0;
    stackPointer++;
    await this.#bridgedFeeJuice.set(
      `${recipient.toString()}:${stackPointer}`,
      Buffer.from(`${amount.toString()}:${secret.toString()}:${leafIndex.toString()}`),
    );
    await this.#bridgedFeeJuice.set(`${recipient.toString()}:stackPointer`, Buffer.from([stackPointer]));
    log(`Pushed ${amount} fee juice for recipient ${recipient.toString()}. Stack pointer ${stackPointer}`);
  }

  async popBridgedFeeJuice(recipient: AztecAddress, log: LogFn) {
    let stackPointer = (await this.#bridgedFeeJuice.getAsync(`${recipient.toString()}:stackPointer`))?.readInt8() || 0;
    const result = await this.#bridgedFeeJuice.getAsync(`${recipient.toString()}:${stackPointer}`);
    if (!result) {
      throw new Error(
        `No stored fee juice available for recipient ${recipient.toString()}. Please provide claim amount and secret. Stack pointer ${stackPointer}`,
      );
    }
    const [amountStr, secretStr, leafIndexStr] = result.toString().split(':');
    await this.#bridgedFeeJuice.set(`${recipient.toString()}:stackPointer`, Buffer.from([--stackPointer]));
    log(`Retrieved ${amountStr} fee juice for recipient ${recipient.toString()}. Stack pointer ${stackPointer}`);
    return { amount: BigInt(amountStr), secret: secretStr, leafIndex: BigInt(leafIndexStr) };
  }

  async storeAccount(
    address: AztecAddress,
    {
      type,
      secretKey,
      salt,
      alias,
      publicKey,
    }: { type: AccountType; secretKey: Fr; salt: Fr; alias: string | undefined; publicKey: string | undefined },
    log: LogFn,
  ) {
    if (alias) {
      await this.#aliases.set(`accounts:${alias}`, Buffer.from(address.toString()));
    }
    await this.#accounts.set(`${address.toString()}:type`, Buffer.from(type));
    await this.#accounts.set(`${address.toString()}:sk`, secretKey.toBuffer());
    await this.#accounts.set(`${address.toString()}:salt`, salt.toBuffer());
    if (type === 'ecdsasecp256r1ssh' && publicKey) {
      const publicSigningKey = extractECDSAPublicKeyFromBase64String(publicKey);
      await this.storeAccountMetadata(address, 'publicSigningKey', publicSigningKey);
    }
    await this.#aliases.set('accounts:last', Buffer.from(address.toString()));
    log(`Account stored in database with alias${alias ? `es last & ${alias}` : ' last'}`);

    await this.refreshAliasCache();
  }

  async storeSender(address: AztecAddress, alias: string, log: LogFn) {
    await this.#aliases.set(`accounts:${alias}`, Buffer.from(address.toString()));
    log(`Account stored in database with alias ${alias} as a sender`);

    await this.refreshAliasCache();
  }

  async storeContract(address: AztecAddress, artifactPath: string, log: LogFn, alias?: string) {
    if (alias) {
      await this.#aliases.set(`contracts:${alias}`, Buffer.from(address.toString()));
      await this.#aliases.set(`artifacts:${alias}`, Buffer.from(artifactPath));
    }
    await this.#aliases.set(`contracts:last`, Buffer.from(address.toString()));
    await this.#aliases.set(`artifacts:last`, Buffer.from(artifactPath));
    await this.#aliases.set(`artifacts:${address.toString()}`, Buffer.from(artifactPath));
    log(`Contract stored in database with alias${alias ? `es last & ${alias}` : ' last'}`);

    await this.refreshAliasCache();
  }

  async storeAuthwitness(authWit: AuthWitness, log: LogFn, alias?: string) {
    if (alias) {
      await this.#aliases.set(`authwits:${alias}`, Buffer.from(authWit.toString()));
    }
    await this.#aliases.set(`authwits:last`, Buffer.from(authWit.toString()));
    log(`Authorization witness stored in database with alias${alias ? `es last & ${alias}` : ' last'}`);

    await this.refreshAliasCache();
  }

  async storeTx(
    {
      txHash,
      txNonce,
      cancellable,
      gasSettings,
    }: { txHash: TxHash; txNonce: Fr; cancellable: boolean; gasSettings: GasSettings },
    log: LogFn,
    alias?: string,
  ) {
    if (alias) {
      await this.#aliases.set(`transactions:${alias}`, Buffer.from(txHash.toString()));
    }
    await this.#transactions.set(`${txHash.toString()}:txNonce`, txNonce.toBuffer());
    await this.#transactions.set(`${txHash.toString()}:cancellable`, Buffer.from(cancellable ? 'true' : 'false'));
    await this.#transactions.set(`${txHash.toString()}:gasSettings`, gasSettings.toBuffer());
    await this.#aliases.set(`transactions:last`, Buffer.from(txHash.toString()));
    log(`Transaction hash stored in database with alias${alias ? `es last & ${alias}` : ' last'}`);

    await this.refreshAliasCache();
  }

  async retrieveTxData(txHash: TxHash) {
    const txNonceBuffer = await this.#transactions.getAsync(`${txHash.toString()}:txNonce`);
    if (!txNonceBuffer) {
      throw new Error(
        `Could not find ${txHash.toString()}:txNonce. Transaction with hash "${txHash.toString()}" does not exist on this wallet.`,
      );
    }
    const txNonce = Fr.fromBuffer(txNonceBuffer);
    const cancellable = (await this.#transactions.getAsync(`${txHash.toString()}:cancellable`))!.toString() === 'true';
    const gasBuffer = (await this.#transactions.getAsync(`${txHash.toString()}:gasSettings`))!;
    return { txHash, txNonce, cancellable, gasSettings: GasSettings.fromBuffer(gasBuffer) };
  }

  tryRetrieveAlias(arg: string) {
    try {
      return this.retrieveAliasFromCache(arg);
    } catch {
      return arg;
    }
  }

  public retrieveAliasFromCache(arg: string) {
    if (Aliases.find(alias => arg.startsWith(`${alias}:`))) {
      const [type, ...alias] = arg.split(':');
      const aliasKey = `${type}:${alias.join(':') ?? 'last'}`;
      const data = this.aliasCache.get(aliasKey);
      if (!data) {
        throw new Error(`Could not find alias ${arg}`);
      }
      return data.toString();
    } else {
      throw new Error(`Aliases must start with one of ${Aliases.join(', ')}`);
    }
  }

  async retrieveAlias(arg: string) {
    if (Aliases.find(alias => arg.startsWith(`${alias}:`))) {
      const [type, ...alias] = arg.split(':');
      const data = await this.#aliases.getAsync(`${type}:${alias.join(':') ?? 'last'}`);
      if (!data) {
        throw new Error(`Could not find alias ${arg}`);
      }
      return data.toString();
    } else {
      throw new Error(`Aliases must start with one of ${Aliases.join(', ')}`);
    }
  }

  async listAliases(type?: AliasType) {
    const result = [];
    if (type && !Aliases.includes(type)) {
      throw new Error(`Unknown alias type ${type}`);
    }
    for await (const [key, value] of this.#aliases.entriesAsync()) {
      if (!type || key.startsWith(`${type}:`)) {
        result.push({ key, value: value.toString() });
      }
    }
    return result;
  }

  async storeAccountMetadata(aliasOrAddress: AztecAddress | string, metadataKey: string, metadata: Buffer) {
    const { address } = await this.retrieveAccount(aliasOrAddress);
    await this.#accounts.set(`${address.toString()}:${metadataKey}`, metadata);
  }

  async retrieveAccountMetadata(aliasOrAddress: AztecAddress | string, metadataKey: string) {
    const { address } = await this.retrieveAccount(aliasOrAddress);
    const result = await this.#accounts.getAsync(`${address.toString()}:${metadataKey}`);
    if (!result) {
      throw new Error(`Could not find metadata with key ${metadataKey} for account ${aliasOrAddress}`);
    }
    return result;
  }

  async retrieveAccount(address: AztecAddress | string) {
    const secretKeyBuffer = await this.#accounts.getAsync(`${address.toString()}:sk`);
    if (!secretKeyBuffer) {
      throw new Error(`Could not find ${address}:sk. Account "${address.toString}" does not exist on this wallet.`);
    }
    const secretKey = Fr.fromBuffer(secretKeyBuffer);
    const salt = Fr.fromBuffer((await this.#accounts.getAsync(`${address.toString()}:salt`))!);
    const type = (await this.#accounts.getAsync(`${address.toString()}:type`))!.toString('utf8') as AccountType;
    return { address, secretKey, salt, type };
  }

  async storeAlias(type: AliasType, key: string, value: Buffer, log: LogFn) {
    await this.#aliases.set(`${type}:${key}`, value);
    await this.refreshAliasCache();
    log(`Data stored in database with alias ${type}:${key}`);

    await this.refreshAliasCache();
  }
}
