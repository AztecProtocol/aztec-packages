import {  AztecAddress, Fr, TxReceipt, type AuthWitness, type TxHash, Fq, TxStatus } from '@aztec/aztec.js';
import { type LogFn } from '@aztec/foundation/log';
import { type AztecAsyncMap, type AztecAsyncKVStore } from '@aztec/kv-store';
import { parseAliasedBuffersAsString } from '../../utils/conversion';
import { AliasedDB } from '../../utils/storage';

export const Aliases = [
  'accounts',
  'authwits',
  'senders',
] as const;

export const AccountTypes = ['schnorr', 'ecdsasecp256r1', 'ecdsasecp256k1'] as const;
export type AccountType = (typeof AccountTypes)[number];

export class WalletDB extends AliasedDB<typeof Aliases> {
    #accounts!: AztecAsyncMap<string, Buffer>;
    #bridgedFeeJuice!: AztecAsyncMap<string, Buffer>;


    init(store: AztecAsyncKVStore, userLog: LogFn) {
      super.init(Aliases, store, userLog);
      this.#accounts = store.openMap('accounts');
      this.#bridgedFeeJuice = store.openMap('bridgedFeeJuice');
    }

    async pushBridgedFeeJuice(
      recipient: AztecAddress,
      secret: Fr,
      amount: bigint,
      leafIndex: bigint,
      log: LogFn = this.userLog,
    ) {
      let stackPointer = (await this.#bridgedFeeJuice.getAsync(`${recipient.toString()}:stackPointer`))?.readInt8() || 0;
      stackPointer++;
      await this.#bridgedFeeJuice.set(
        `${recipient.toString()}:${stackPointer}`,
        Buffer.from(`${amount.toString()}:${secret.toString()}:${leafIndex.toString()}`),
      );
      await this.#bridgedFeeJuice.set(`${recipient.toString()}:stackPointer`, Buffer.from([stackPointer]));
      log(`Pushed ${amount} fee juice for recipient ${recipient.toString()}. Stack pointer ${stackPointer}`);
    }

    async popBridgedFeeJuice(recipient: AztecAddress, log: LogFn = this.userLog) {
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
      await this.#accounts.set(`${address.toString()}:type`, Buffer.from(type));
      await this.#accounts.set(`${address.toString()}:sk`, secretKey.toBuffer());
      await this.#accounts.set(`${address.toString()}:salt`, salt.toBuffer());
      await this.#accounts.set(
        `${address.toString()}:signingKey`,
        'toBuffer' in signingKey ? signingKey.toBuffer() : signingKey,
      );
      log(`Account stored in database with alias${alias ? `es last & ${alias}` : ' last'}`);
    }

    async storeSender(address: AztecAddress, alias: string, log: LogFn = this.userLog) {
      await this.aliases.set(`accounts:${alias}`, Buffer.from(address.toString()));
      log(`Account stored in database with alias ${alias} as a sender`);
    }

    async storeAuthwitness(authWit: AuthWitness, log: LogFn = this.userLog, alias?: string) {
      if (alias) {
        await this.aliases.set(`authwits:${alias}`, Buffer.from(authWit.toString()));
      }
      log(`Authorization witness stored in database with alias${alias ? `es last & ${alias}` : ' last'}`);
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
      const salt = Fr.fromBuffer(await this.#accounts.getAsync(`${address.toString()}:salt`)!);
      const type = (await this.#accounts.getAsync(`${address.toString()}:type`)!).toString('utf8') as AccountType;
      const signingKey = await this.#accounts.getAsync(`${address.toString()}:signingKey`)!;
      return { address, secretKey, salt, type, signingKey };
    }

    async deleteAccount(address: AztecAddress) {
      await this.#accounts.delete(`${address.toString()}:sk`);
      await this.#accounts.delete(`${address.toString()}:salt`);
      await this.#accounts.delete(`${address.toString()}:type`);
      await this.#accounts.delete(`${address.toString()}:signingKey`);
      const aliasesBuffers = await this.listAliases('accounts');
      const aliases = parseAliasedBuffersAsString(aliasesBuffers);
      const alias = aliases.find(alias => address.equals(AztecAddress.fromString(alias.value)));
      await this.aliases.delete(alias?.key);
    }
  }
