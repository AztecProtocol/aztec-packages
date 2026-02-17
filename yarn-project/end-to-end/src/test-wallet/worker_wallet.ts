import type { CallIntent, IntentInnerHash } from '@aztec/aztec.js/authorization';
import type { InteractionWaitOptions, SendReturn } from '@aztec/aztec.js/contracts';
import type {
  Aliased,
  AppCapabilities,
  BatchResults,
  BatchedMethod,
  ContractClassMetadata,
  ContractMetadata,
  PrivateEvent,
  PrivateEventFilter,
  ProfileOptions,
  SendOptions,
  SimulateOptions,
  SimulateUtilityOptions,
  Wallet,
  WalletCapabilities,
} from '@aztec/aztec.js/wallet';
import type { ChainInfo } from '@aztec/entrypoints/interfaces';
import type { Fr } from '@aztec/foundation/curves/bn254';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import type { ApiSchema } from '@aztec/foundation/schemas';
import { NodeConnector, TransportClient } from '@aztec/foundation/transport';
import type { PXEConfig } from '@aztec/pxe/config';
import type { ContractArtifact, EventMetadataDefinition, FunctionCall } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import type { ExecutionPayload, TxProfileResult, TxSimulationResult, UtilitySimulationResult } from '@aztec/stdlib/tx';
import { Tx } from '@aztec/stdlib/tx';

import { Worker } from 'worker_threads';

import { WorkerWalletSchema } from './worker_wallet_schema.js';

type WorkerMsg = { fn: string; args: string };

/**
 * Wallet implementation that offloads all work to a worker thread.
 * Implements the Wallet interface by proxying calls over a transport layer
 * using JSON serialization with Zod schema parsing on both ends.
 */
export class WorkerWallet implements Wallet {
  private constructor(
    private worker: Worker,
    private client: TransportClient<WorkerMsg>,
  ) {}

  /**
   * Creates a WorkerWallet by spawning a worker thread that creates a TestWallet internally.
   * @param nodeUrl - URL of the Aztec node to connect to.
   * @param pxeConfig - Optional PXE configuration overrides.
   * @returns A WorkerWallet ready to use.
   */
  static async create(nodeUrl: string, pxeConfig?: Partial<PXEConfig>): Promise<WorkerWallet> {
    const worker = new Worker(new URL('./wallet_worker_script.js', import.meta.url), {
      workerData: { nodeUrl, pxeConfig },
    });

    const connector = new NodeConnector(worker);
    const client = new TransportClient<WorkerMsg>(connector);
    await client.open();

    const wallet = new WorkerWallet(worker, client);
    // Warmup / readiness check — blocks until the worker has finished creating the TestWallet.
    await wallet.getChainInfo();
    return wallet;
  }

  private async callRaw(fn: string, ...args: any[]): Promise<string> {
    const argsJson = jsonStringify(args);
    return (await this.client.request({ fn, args: argsJson })) as string;
  }

  private async call(fn: string, ...args: any[]): Promise<any> {
    const resultJson = await this.callRaw(fn, ...args);
    const methodSchema = (WorkerWalletSchema as ApiSchema)[fn];
    return methodSchema.returnType().parseAsync(JSON.parse(resultJson));
  }

  getChainInfo(): Promise<ChainInfo> {
    return this.call('getChainInfo');
  }

  getContractMetadata(address: AztecAddress): Promise<ContractMetadata> {
    return this.call('getContractMetadata', address);
  }

  getContractClassMetadata(id: Fr): Promise<ContractClassMetadata> {
    return this.call('getContractClassMetadata', id);
  }

  getPrivateEvents<T>(
    eventMetadata: EventMetadataDefinition,
    eventFilter: PrivateEventFilter,
  ): Promise<PrivateEvent<T>[]> {
    return this.call('getPrivateEvents', eventMetadata, eventFilter);
  }

  registerSender(address: AztecAddress, alias?: string): Promise<AztecAddress> {
    return this.call('registerSender', address, alias);
  }

  getAddressBook(): Promise<Aliased<AztecAddress>[]> {
    return this.call('getAddressBook');
  }

  getAccounts(): Promise<Aliased<AztecAddress>[]> {
    return this.call('getAccounts');
  }

  registerContract(
    instance: ContractInstanceWithAddress,
    artifact?: ContractArtifact,
    secretKey?: Fr,
  ): Promise<ContractInstanceWithAddress> {
    return this.call('registerContract', instance, artifact, secretKey);
  }

  simulateTx(exec: ExecutionPayload, opts: SimulateOptions): Promise<TxSimulationResult> {
    return this.call('simulateTx', exec, opts);
  }

  simulateUtility(call: FunctionCall, opts: SimulateUtilityOptions): Promise<UtilitySimulationResult> {
    return this.call('simulateUtility', call, opts);
  }

  profileTx(exec: ExecutionPayload, opts: ProfileOptions): Promise<TxProfileResult> {
    return this.call('profileTx', exec, opts);
  }

  sendTx<W extends InteractionWaitOptions = undefined>(
    exec: ExecutionPayload,
    opts: SendOptions<W>,
  ): Promise<SendReturn<W>> {
    return this.call('sendTx', exec, opts);
  }

  proveTx(exec: ExecutionPayload, opts: Omit<SendOptions, 'wait'>): Promise<Tx> {
    return this.call('proveTx', exec, opts);
  }

  /** Registers an account inside the worker's TestWallet, populating its accounts map. */
  registerAccount(secret: Fr, salt: Fr): Promise<AztecAddress> {
    return this.call('registerAccount', secret, salt);
  }

  createAuthWit(from: AztecAddress, messageHashOrIntent: IntentInnerHash | CallIntent): Promise<AuthWitness> {
    return this.call('createAuthWit', from, messageHashOrIntent);
  }

  requestCapabilities(manifest: AppCapabilities): Promise<WalletCapabilities> {
    return this.call('requestCapabilities', manifest);
  }

  batch<const T extends readonly BatchedMethod[]>(methods: T): Promise<BatchResults<T>> {
    return this.call('batch', methods);
  }

  /** Shuts down the worker thread and closes the transport. */
  async stop(): Promise<void> {
    this.client.close();
    await this.worker.terminate();
  }
}
