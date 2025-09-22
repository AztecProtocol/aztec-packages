import { AztecAddress, Fr, Fq, type Aliased } from '@aztec/aztec.js';
import { type LogFn } from '@aztec/foundation/log';
import { type AztecAsyncMap, type AztecAsyncKVStore } from '@aztec/kv-store';
import { convertFromUTF8BufferAsString, parseAliasedBuffersAsString } from '../utils/conversion';

export const AccountTypes = ['schnorr', 'ecdsasecp256r1', 'ecdsasecp256k1'] as const;
export type AccountType = (typeof AccountTypes)[number];

export class WalletDB {
  private constructor(
    private accounts: AztecAsyncMap<string, Buffer>,
    private aliases: AztecAsyncMap<string, Buffer>,
    private bridgedFeeJuice: AztecAsyncMap<string, Buffer>,
    private userLog: LogFn,
  ) {}

  static init(store: AztecAsyncKVStore, userLog: LogFn) {
    const accounts = store.openMap<string, Buffer>('accounts');
    const aliases = store.openMap<string, Buffer>('aliases');
    const bridgedFeeJuice = store.openMap<string, Buffer>('bridgedFeeJuice');
    return new WalletDB(accounts, aliases, bridgedFeeJuice, userLog);
  }

  async pushBridgedFeeJuice(
    recipient: AztecAddress,
    secret: Fr,
    amount: bigint,
    leafIndex: bigint,
    log: LogFn = this.userLog,
  ) {
    let stackPointer = (await this.bridgedFeeJuice.getAsync(`${recipient.toString()}:stackPointer`))?.readInt8() || 0;
    stackPointer++;
    await this.bridgedFeeJuice.set(
      `${recipient.toString()}:${stackPointer}`,
      Buffer.from(`${amount.toString()}:${secret.toString()}:${leafIndex.toString()}`),
    );
    await this.bridgedFeeJuice.set(`${recipient.toString()}:stackPointer`, Buffer.from([stackPointer]));
    log(`Pushed ${amount} fee juice for recipient ${recipient.toString()}. Stack pointer ${stackPointer}`);
  }

  async popBridgedFeeJuice(recipient: AztecAddress, log: LogFn = this.userLog) {
    let stackPointer = (await this.bridgedFeeJuice.getAsync(`${recipient.toString()}:stackPointer`))?.readInt8() || 0;
    const result = await this.bridgedFeeJuice.getAsync(`${recipient.toString()}:${stackPointer}`);
    if (!result) {
      throw new Error(
        `No stored fee juice available for recipient ${recipient.toString()}. Please provide claim amount and secret. Stack pointer ${stackPointer}`,
      );
    }
    const [amountStr, secretStr, leafIndexStr] = result.toString().split(':');
    await this.bridgedFeeJuice.set(`${recipient.toString()}:stackPointer`, Buffer.from([--stackPointer]));
    log(`Retrieved ${amountStr} fee juice for recipient ${recipient.toString()}. Stack pointer ${stackPointer}`);
    return {
      amount: BigInt(amountStr),
      secret: secretStr,
      leafIndex: BigInt(leafIndexStr),
    };
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
    if (alias) {
      await this.aliases.set(`accounts:${alias}`, Buffer.from(address.toString()));
    }
    await this.accounts.set(`${address.toString()}:type`, Buffer.from(type));
    await this.accounts.set(`${address.toString()}:sk`, secretKey.toBuffer());
    await this.accounts.set(`${address.toString()}:salt`, salt.toBuffer());
    await this.accounts.set(
      `${address.toString()}:signingKey`,
      'toBuffer' in signingKey ? signingKey.toBuffer() : signingKey,
    );
    log(`Account stored in database with alias${alias ? `es last & ${alias}` : ' last'}`);
  }

  async storeSender(address: AztecAddress, alias: string, log: LogFn = this.userLog) {
    await this.aliases.set(`accounts:${alias}`, Buffer.from(address.toString()));
    log(`Account stored in database with alias ${alias} as a sender`);
  }

  async storeAccountMetadata(aliasOrAddress: AztecAddress | string, metadataKey: string, metadata: Buffer) {
    const { address } = await this.retrieveAccount(aliasOrAddress);
    await this.accounts.set(`${address.toString()}:${metadataKey}`, metadata);
  }

  async retrieveAccountMetadata(aliasOrAddress: AztecAddress | string, metadataKey: string) {
    const { address } = await this.retrieveAccount(aliasOrAddress);
    const result = await this.accounts.getAsync(`${address.toString()}:${metadataKey}`);
    if (!result) {
      throw new Error(`Could not find metadata with key ${metadataKey} for account ${aliasOrAddress}`);
    }
    return result;
  }

  async retrieveAccount(address: AztecAddress | string) {
    const secretKeyBuffer = await this.accounts.getAsync(`${address.toString()}:sk`);
    if (!secretKeyBuffer) {
      throw new Error(`Could not find ${address}:sk. Account "${address.toString}" does not exist on this wallet.`);
    }
    const secretKey = Fr.fromBuffer(secretKeyBuffer);
    const salt = Fr.fromBuffer(await this.accounts.getAsync(`${address.toString()}:salt`)!);
    const type = (await this.accounts.getAsync(`${address.toString()}:type`)!).toString('utf8') as AccountType;
    const signingKey = await this.accounts.getAsync(`${address.toString()}:signingKey`)!;
    return { address, secretKey, salt, type, signingKey };
  }

  async listAccounts(): Promise<Aliased<AztecAddress>[]> {
    const result = [];
    for await (const [alias, item] of this.aliases.entriesAsync()) {
      if (alias.startsWith('accounts:')) {
        result.push({ alias, item: AztecAddress.fromString(convertFromUTF8BufferAsString(item.toString())) });
      }
    }
    return result;
  }

  async listSenders(): Promise<Aliased<AztecAddress>[]> {
    const result = [];
    for await (const [alias, item] of this.aliases.entriesAsync()) {
      if (alias.startsWith('senders:')) {
        result.push({ alias, item: AztecAddress.fromString(convertFromUTF8BufferAsString(item.toString())) });
      }
    }
    return result;
  }

  async deleteAccount(address: AztecAddress) {
    await this.accounts.delete(`${address.toString()}:sk`);
    await this.accounts.delete(`${address.toString()}:salt`);
    await this.accounts.delete(`${address.toString()}:type`);
    await this.accounts.delete(`${address.toString()}:signingKey`);
    const accounts = await this.listAccounts();
    const account = accounts.find(account => address.equals(account.item));
    await this.aliases.delete(account?.alias);
  }
}
