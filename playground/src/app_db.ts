import { AztecAddress,TxReceipt,type TxHash, TxStatus, type ContractArtifact } from '@aztec/aztec.js';
import { AliasedDB } from './utils/storage';
import { type AztecAsyncMap, type AztecAsyncKVStore, type AztecAsyncMultiMap } from '@aztec/kv-store';
import type { LogFn } from '@aztec/foundation/log';
import { stringify } from 'buffer-json';

export const Aliases = [
  'contracts',
  'artifacts',
] as const;


export class AppDB extends AliasedDB<typeof Aliases> {
    #transactions!: AztecAsyncMap<string, Buffer>;
    #transactionsPerContract!: AztecAsyncMultiMap<string, Buffer>;
    #networks!: AztecAsyncMap<string, Buffer>;

    async storeNetwork(network: string, alias: string) {
      await this.#networks.set(network, Buffer.from(alias));
    }

    async retrieveNetwork(network: string) {
      const result = await this.#networks.getAsync(network);
      if (!result) {
        throw new Error(`Could not find network with alias ${network}`);
      }
      return result.toString();
    }

    async listNetworks() {
      const result = [];
      if (!this.#networks) {
        return result;
      }

      for await (const [key, value] of this.#networks.entriesAsync()) {
        result.push({ key, value: value.toString() });
      }
      return result;
    }

    init(store: AztecAsyncKVStore, userLog: LogFn) {
      super.init(Aliases, store, userLog)
      this.#networks = store.openMap('networks');
      this.#transactions = store.openMap('transactions');
      this.#transactionsPerContract = store.openMultiMap('transactionsPerContract');
    }

    async storeContract(address: AztecAddress, artifact: ContractArtifact, log: LogFn = this.userLog, alias?: string) {
      const existing = await this.aliases.getAsync(`artifacts:${address.toString()}`);
      if (existing) {
        throw new Error('Contract with this address already exists');
      }

      if (alias) {
        await this.aliases.set(`contracts:${alias}`, Buffer.from(address.toString()));
        await this.aliases.set(`artifacts:${alias}`, Buffer.from(stringify(artifact)));
      }
      await this.aliases.set(`artifacts:${address.toString()}`, Buffer.from(stringify(artifact)));
      log(`Contract stored in database with alias${alias ? `es last & ${alias}` : ' last'}`);
    }

    async storeTx(
      {
        contractAddress,
        txHash,
        name,
        receipt,
      }: {
        contractAddress: AztecAddress;
        txHash: TxHash;
        name: string;
        receipt: TxReceipt;
      },
      log: LogFn = this.userLog,
    ) {
      await this.#transactionsPerContract.set(`${contractAddress.toString()}`, Buffer.from(txHash.toString()));

      await this.#transactions.set(`${txHash.toString()}:hash`, Buffer.from(txHash.toString()));
      await this.#transactions.set(`${txHash.toString()}:name`, Buffer.from(name));
      await this.#transactions.set(`${txHash.toString()}:status`, Buffer.from(receipt.status.toString()));
      await this.#transactions.set(`${txHash.toString()}:date`, Buffer.from(Date.now().toString()));
      log('Transaction hash stored in database');
    }

    async updateTxStatus(txHash: TxHash, status: TxStatus) {
      await this.#transactions.set(`${txHash.toString()}:status`, Buffer.from(status.toString()));
    }

    async retrieveAllTx() {
      const result = [];
      if (!this.#transactions) {
        return result;
      }

      for await (const [key, txHash] of this.#transactions.entriesAsync()) {
        if (key.endsWith(':hash')) {
          result.push(txHash.toString());
        }
      }
      return result;
    }

    async retrieveTxsPerContract(contractAddress: AztecAddress) {
      const result = [];
      for await (const txHash of this.#transactionsPerContract.getValuesAsync(contractAddress.toString())) {
        result.push(txHash.toString());
      }
      return result;
    }

    async retrieveTxData(txHash: TxHash) {
      const nameBuffer = await this.#transactions.getAsync(`${txHash.toString()}:name`);
      if (!nameBuffer) {
        throw new Error(
          `Could not find ${txHash.toString()}:name. Transaction with hash "${txHash.toString()}" does not exist on this wallet.`,
        );
      }
      const name = nameBuffer.toString();
      const status = (await this.#transactions.getAsync(`${txHash.toString()}:status`))!.toString();

      const date = (await this.#transactions.getAsync(`${txHash.toString()}:date`))!.toString();

      return {
        txHash,
        name,
        status,
        date,
      };
    }
  }
