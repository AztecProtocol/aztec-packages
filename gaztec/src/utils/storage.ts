import { ContractArtifact } from "@aztec/aztec.js";
import { TxReceipt, type AuthWitness, type TxHash } from "@aztec/circuit-types";
import { type AztecAddress, Fr } from "@aztec/circuits.js";
import { type LogFn } from "@aztec/foundation/log";
import {
  type AztecAsyncMap,
  type AztecAsyncKVStore,
  AztecAsyncMultiMap,
} from "@aztec/kv-store";

export const Aliases = [
  "accounts",
  "contracts",
  "artifacts",
  "secrets",
  "transactions",
  "authwits",
] as const;
export type AliasType = (typeof Aliases)[number];

export const AccountTypes = [
  "schnorr",
  "ecdsasecp256r1ssh",
  "ecdsasecp256k1",
] as const;
export type AccountType = (typeof AccountTypes)[number];

export class WalletDB {
  #accounts!: AztecAsyncMap<string, Buffer>;
  #aliases!: AztecAsyncMap<string, Buffer>;
  #bridgedFeeJuice!: AztecAsyncMap<string, Buffer>;
  #transactions!: AztecAsyncMap<string, Buffer>;
  #transactionsPerContract!: AztecAsyncMultiMap<string, Buffer>;
  #userLog!: LogFn;

  private static instance: WalletDB;

  static getInstance() {
    if (!WalletDB.instance) {
      WalletDB.instance = new WalletDB();
    }

    return WalletDB.instance;
  }

  init(store: AztecAsyncKVStore, userLog: LogFn) {
    this.#accounts = store.openMap("accounts");
    this.#aliases = store.openMap("aliases");
    this.#bridgedFeeJuice = store.openMap("bridgedFeeJuice");
    this.#transactions = store.openMap("transactions");
    this.#transactionsPerContract = store.openMultiMap(
      "transactionsPerContract"
    );
    this.#userLog = userLog;
  }

  async pushBridgedFeeJuice(
    recipient: AztecAddress,
    secret: Fr,
    amount: bigint,
    leafIndex: bigint,
    log: LogFn = this.#userLog
  ) {
    let stackPointer =
      (
        await this.#bridgedFeeJuice.getAsync(
          `${recipient.toString()}:stackPointer`
        )
      )?.readInt8() || 0;
    stackPointer++;
    await this.#bridgedFeeJuice.set(
      `${recipient.toString()}:${stackPointer}`,
      Buffer.from(
        `${amount.toString()}:${secret.toString()}:${leafIndex.toString()}`
      )
    );
    await this.#bridgedFeeJuice.set(
      `${recipient.toString()}:stackPointer`,
      Buffer.from([stackPointer])
    );
    log(
      `Pushed ${amount} fee juice for recipient ${recipient.toString()}. Stack pointer ${stackPointer}`
    );
  }

  async popBridgedFeeJuice(
    recipient: AztecAddress,
    log: LogFn = this.#userLog
  ) {
    let stackPointer =
      (
        await this.#bridgedFeeJuice.getAsync(
          `${recipient.toString()}:stackPointer`
        )
      )?.readInt8() || 0;
    const result = await this.#bridgedFeeJuice.getAsync(
      `${recipient.toString()}:${stackPointer}`
    );
    if (!result) {
      throw new Error(
        `No stored fee juice available for recipient ${recipient.toString()}. Please provide claim amount and secret. Stack pointer ${stackPointer}`
      );
    }
    const [amountStr, secretStr, leafIndexStr] = result.toString().split(":");
    await this.#bridgedFeeJuice.set(
      `${recipient.toString()}:stackPointer`,
      Buffer.from([--stackPointer])
    );
    log(
      `Retrieved ${amountStr} fee juice for recipient ${recipient.toString()}. Stack pointer ${stackPointer}`
    );
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
    }: {
      type: AccountType;
      secretKey: Fr;
      salt: Fr;
      alias: string | undefined;
    },
    log: LogFn = this.#userLog
  ) {
    if (alias) {
      await this.#aliases.set(
        `accounts:${alias}`,
        Buffer.from(address.toString())
      );
    }
    await this.#accounts.set(`${address.toString()}:type`, Buffer.from(type));
    await this.#accounts.set(`${address.toString()}:sk`, secretKey.toBuffer());
    await this.#accounts.set(`${address.toString()}:salt`, salt.toBuffer());
    log(
      `Account stored in database with alias${
        alias ? `es last & ${alias}` : " last"
      }`
    );
  }

  async storeSender(
    address: AztecAddress,
    alias: string,
    log: LogFn = this.#userLog
  ) {
    await this.#aliases.set(
      `accounts:${alias}`,
      Buffer.from(address.toString())
    );
    log(`Account stored in database with alias ${alias} as a sender`);
  }

  async storeContract(
    address: AztecAddress,
    artifact: ContractArtifact,
    log: LogFn = this.#userLog,
    alias?: string
  ) {
    if (alias) {
      await this.#aliases.set(
        `contracts:${alias}`,
        Buffer.from(address.toString())
      );
      await this.#aliases.set(
        `artifacts:${alias}`,
        Buffer.from(JSON.stringify(artifact))
      );
    }
    await this.#aliases.set(
      `artifacts:${address.toString()}`,
      Buffer.from(JSON.stringify(artifact))
    );
    log(
      `Contract stored in database with alias${
        alias ? `es last & ${alias}` : " last"
      }`
    );
  }

  async storeAuthwitness(
    authWit: AuthWitness,
    log: LogFn = this.#userLog,
    alias?: string
  ) {
    if (alias) {
      await this.#aliases.set(
        `authwits:${alias}`,
        Buffer.from(authWit.toString())
      );
    }
    log(
      `Authorization witness stored in database with alias${
        alias ? `es last & ${alias}` : " last"
      }`
    );
  }

  async storeTx(
    {
      contractAddress,
      txHash,
      fnName,
      receipt,
    }: {
      contractAddress: AztecAddress;
      txHash: TxHash;
      fnName: string;
      receipt: TxReceipt;
    },
    log: LogFn = this.#userLog,
    alias?: string
  ) {
    if (alias) {
      await this.#aliases.set(
        `transactions:${alias}`,
        Buffer.from(txHash.toString())
      );
    }
    await this.#transactionsPerContract.set(
      `${contractAddress.toString()}`,
      Buffer.from(txHash.toString())
    );

    await this.#transactions.set(
      `${txHash.toString()}:fnName`,
      Buffer.from(fnName)
    );
    await this.#transactions.set(
      `${txHash.toString()}:status`,
      Buffer.from(receipt.status.toString())
    );
    await this.#transactions.set(
      `${txHash.toString()}:date`,
      Buffer.from(Date.now().toString())
    );
    log(
      `Transaction hash stored in database with alias${
        alias ? `es last & ${alias}` : " last"
      }`
    );
  }

  async retrieveTxsPerContract(contractAddress: AztecAddress) {
    const result = [];
    for await (const txHash of this.#transactionsPerContract.getValuesAsync(
      contractAddress.toString()
    )) {
      result.push(txHash.toString());
    }
    return result;
  }

  async retrieveTxData(txHash: TxHash) {
    const fnNameBuffer = await this.#transactions.getAsync(
      `${txHash.toString()}:fnName`
    );
    if (!fnNameBuffer) {
      throw new Error(
        `Could not find ${txHash.toString()}:fnName. Transaction with hash "${txHash.toString()}" does not exist on this wallet.`
      );
    }
    const fnName = fnNameBuffer.toString();
    const status = (await this.#transactions.getAsync(
      `${txHash.toString()}:status`
    ))!.toString();

    const date = await this.#transactions
      .getAsync(`${txHash.toString()}:date`)!
      .toString();

    return {
      txHash,
      fnName,
      status,
      date,
    };
  }

  tryRetrieveAlias(arg: string) {
    try {
      return this.retrieveAlias(arg);
    } catch (e) {
      return arg;
    }
  }

  async retrieveAlias(arg: string) {
    if (Aliases.find((alias) => arg.startsWith(`${alias}:`))) {
      const [type, ...alias] = arg.split(":");
      const data = await this.#aliases.getAsync(
        `${type}:${alias.join(":") ?? "last"}`
      );
      if (!data) {
        throw new Error(`Could not find alias ${arg}`);
      }
      return data.toString();
    } else {
      throw new Error(`Aliases must start with one of ${Aliases.join(", ")}`);
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

  async storeAccountMetadata(
    aliasOrAddress: AztecAddress | string,
    metadataKey: string,
    metadata: Buffer
  ) {
    const { address } = await this.retrieveAccount(aliasOrAddress);
    await this.#accounts.set(`${address.toString()}:${metadataKey}`, metadata);
  }

  async retrieveAccountMetadata(
    aliasOrAddress: AztecAddress | string,
    metadataKey: string
  ) {
    const { address } = await this.retrieveAccount(aliasOrAddress);
    const result = this.#accounts.getAsync(
      `${address.toString()}:${metadataKey}`
    );
    if (!result) {
      throw new Error(
        `Could not find metadata with key ${metadataKey} for account ${aliasOrAddress}`
      );
    }
    return result;
  }

  async retrieveAccount(address: AztecAddress | string) {
    const secretKeyBuffer = await this.#accounts.getAsync(
      `${address.toString()}:sk`
    );
    if (!secretKeyBuffer) {
      throw new Error(
        `Could not find ${address}:sk. Account "${address.toString}" does not exist on this wallet.`
      );
    }
    const secretKey = Fr.fromBuffer(secretKeyBuffer);
    const salt = Fr.fromBuffer(
      await this.#accounts.getAsync(`${address.toString()}:salt`)!
    );
    const type = (
      await this.#accounts.getAsync(`${address.toString()}:type`)!
    ).toString("utf8") as AccountType;
    return { address, secretKey, salt, type };
  }

  async storeAlias(
    type: AliasType,
    key: string,
    value: Buffer,
    log: LogFn = this.#userLog
  ) {
    await this.#aliases.set(`${type}:${key}`, value);
    log(`Data stored in database with alias ${type}:${key}`);
  }
}
