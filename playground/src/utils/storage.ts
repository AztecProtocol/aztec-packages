import type { ContractArtifact } from '@aztec/aztec.js/abi';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { Aliased } from '@aztec/aztec.js/wallet';
import type { AuthWitness } from '@aztec/aztec.js/authorization';
import { type TxHash, TxReceipt, TxStatus } from '@aztec/aztec.js/tx';
import { bufferFrom } from '@aztec/foundation/buffer';
import type { LogFn } from '@aztec/foundation/log';
import { type AztecAsyncMap, type AztecAsyncKVStore, type AztecAsyncMultiMap } from '@aztec/kv-store';
import { stringify } from 'buffer-json';
import { convertFromUTF8BufferAsString } from './conversion';

export const Aliases = ['accounts', 'artifacts', 'secrets', 'transactions', 'authwits', 'contracts'] as const;
export type AliasType = (typeof Aliases)[number];

export class PlaygroundDB {
  private aliases: AztecAsyncMap<string, Buffer>;
  private networks!: AztecAsyncMap<string, Buffer>;
  private transactions: AztecAsyncMap<string, Buffer>;
  private transactionsPerContract: AztecAsyncMultiMap<string, Buffer>;
  private userLog: LogFn;

  private static instance: PlaygroundDB;

  static getInstance() {
    if (!PlaygroundDB.instance) {
      PlaygroundDB.instance = new PlaygroundDB();
    }

    return PlaygroundDB.instance;
  }

  init(store: AztecAsyncKVStore, userLog: LogFn) {
    this.aliases = store.openMap('aliases');
    this.networks = store.openMap('networks');
    this.transactions = store.openMap<string, Buffer>('transactions');
    this.transactionsPerContract = store.openMultiMap<string, Buffer>('transactionsPerContract');
    this.userLog = userLog;
  }

  async storeNetwork(network: string, alias: string, chainId?: number, version?: string, nodeVersion?: string) {
    const networkData = {
      networkUrl: network,
      chainId,
      version,
      nodeVersion,
    };
    await this.networks.set(alias, bufferFrom(JSON.stringify(networkData)));
  }

  async retrieveNetwork(network: string) {
    const result = await this.networks.getAsync(network);
    if (!result) {
      throw new Error(`Could not find network with alias ${network}`);
    }
    return JSON.parse(result.toString());
  }

  async listNetworks() {
    const result = [];
    const toDelete = [];
    if (!this.networks) {
      return result;
    }

    for await (const [alias, data] of this.networks.entriesAsync()) {
      try {
        // Convert buffer to string: data.toString() returns comma-separated bytes
        const jsonString = convertFromUTF8BufferAsString(data.toString());
        const networkData = JSON.parse(jsonString);
        result.push({
          networkUrl: networkData.networkUrl,
          alias,
          chainId: parseInt(networkData.chainId, 10),
          version: parseInt(networkData.version, 10),
          nodeVersion: networkData.nodeVersion,
        });
      } catch {
        // Mark legacy format entries for deletion
        toDelete.push(alias);
      }
    }

    // Delete legacy entries after iteration completes
    for (const alias of toDelete) {
      await this.networks.delete(alias);
    }

    return result;
  }

  async storeContract(address: AztecAddress, artifact: ContractArtifact, log: LogFn = this.userLog, alias?: string) {
    const existing = await this.aliases.getAsync(`artifacts:${address.toString()}`);
    if (existing) {
      throw new Error('Contract with this address already exists');
    }

    if (alias) {
      await this.aliases.set(`contracts:${alias}`, bufferFrom(address.toString()));
      await this.aliases.set(`artifacts:${alias}`, bufferFrom(stringify(artifact)));
    }
    await this.aliases.set(`artifacts:${address.toString()}`, bufferFrom(stringify(artifact)));
    log(`Contract stored in database with alias${alias ? `es last & ${alias}` : ' last'}`);
  }

  async storeAuthwitness(authWit: AuthWitness, log: LogFn = this.userLog, alias?: string) {
    if (alias) {
      await this.aliases.set(`authwits:${alias}`, bufferFrom(authWit.toString()));
    }
    log(`Authorization witness stored in database with alias${alias ? `es last & ${alias}` : ' last'}`);
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
    alias?: string,
  ) {
    if (alias) {
      await this.aliases.set(`transactions:${alias}`, bufferFrom(txHash.toString()));
    }
    await this.transactionsPerContract.set(`${contractAddress.toString()}`, bufferFrom(txHash.toString()));

    await this.transactions.set(`${txHash.toString()}:hash`, bufferFrom(txHash.toString()));
    await this.transactions.set(`${txHash.toString()}:name`, bufferFrom(name));
    await this.transactions.set(`${txHash.toString()}:status`, bufferFrom(receipt.status.toString()));
    await this.transactions.set(`${txHash.toString()}:date`, bufferFrom(Date.now().toString()));
    log(`Transaction hash stored in database with alias${alias ? `es last & ${alias}` : ' last'}`);
  }

  async updateTxStatus(txHash: TxHash, status: TxStatus) {
    await this.transactions.set(`${txHash.toString()}:status`, bufferFrom(status.toString()));
  }

  async retrieveAllTx() {
    const result = [];
    if (!this.transactions) {
      return result;
    }

    for await (const [alias, txHash] of this.transactions.entriesAsync()) {
      if (alias.endsWith(':hash')) {
        result.push(txHash.toString());
      }
    }
    return result;
  }

  async retrieveTxsPerContract(contractAddress: AztecAddress) {
    const result = [];
    for await (const txHash of this.transactionsPerContract.getValuesAsync(contractAddress.toString())) {
      result.push(txHash.toString());
    }
    return result;
  }

  async retrieveTxData(txHash: TxHash) {
    const nameBuffer = await this.transactions.getAsync(`${txHash.toString()}:name`);
    if (!nameBuffer) {
      throw new Error(
        `Could not find ${txHash.toString()}:name. Transaction with hash "${txHash.toString()}" does not exist on this wallet.`,
      );
    }
    const name = nameBuffer.toString();
    const status = (await this.transactions.getAsync(`${txHash.toString()}:status`))!.toString();

    const date = (await this.transactions.getAsync(`${txHash.toString()}:date`))!.toString();

    return {
      txHash,
      name,
      status,
      date,
    };
  }

  tryRetrieveAlias(arg: string) {
    try {
      return this.retrieveAlias(arg);
    } catch {
      return arg;
    }
  }

  async retrieveAlias(arg: string) {
    if (Aliases.find(alias => arg.startsWith(`${alias}:`))) {
      const [type, ...alias] = arg.split(':');
      const data = await this.aliases.getAsync(`${type}:${alias.join(':') ?? 'last'}`);
      if (!data) {
        throw new Error(`Could not find alias ${arg}`);
      }
      return data.toString();
    } else {
      throw new Error(`Aliases must start with one of ${Aliases.join(', ')}`);
    }
  }

  async listAliases(type?: AliasType): Promise<Aliased<string>[]> {
    const result = [];
    if (type && !Aliases.includes(type)) {
      throw new Error(`Unknown alias type ${type}`);
    }
    for await (const [alias, item] of this.aliases.entriesAsync()) {
      if (!type || alias.startsWith(`${type}:`)) {
        result.push({ alias, item: item.toString() });
      }
    }
    return result;
  }

  async storeAlias(type: AliasType, alias: string, value: Buffer, log: LogFn = this.userLog) {
    await this.aliases.set(`${type}:${alias}`, value);
    log(`Data stored in database with alias ${type}:${alias}`);
  }
}
