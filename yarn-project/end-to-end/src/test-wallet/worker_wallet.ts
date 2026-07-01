import type { CallIntent, IntentInnerHash } from '@aztec/aztec.js/authorization';
import type { InteractionWaitOptions, SendReturn } from '@aztec/aztec.js/contracts';
import type {
  Aliased,
  AppCapabilities,
  BatchResults,
  BatchedMethod,
  ContractClassMetadata,
  ContractMetadata,
  ExecuteUtilityOptions,
  PrivateEvent,
  PrivateEventFilter,
  ProfileOptions,
  SendOptions,
  SimulateOptions,
  TxSimulationResultWithAppOffset,
  Wallet,
  WalletCapabilities,
} from '@aztec/aztec.js/wallet';
import type { ChainInfo } from '@aztec/entrypoints/interfaces';
import type { Fq, Fr } from '@aztec/foundation/curves/bn254';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { type ApiSchema, getSchemaReturnType } from '@aztec/foundation/schemas';
import { sleep } from '@aztec/foundation/sleep';
import { NodeConnector, TransportClient } from '@aztec/foundation/transport';
import type { PXEConfig } from '@aztec/pxe/config';
import type { ContractArtifact, EventMetadataDefinition, FunctionCall } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import type { ExecutionPayload, TxProfileResult, UtilityExecutionResult } from '@aztec/stdlib/tx';
import { Tx } from '@aztec/stdlib/tx';

import { Worker } from 'worker_threads';

import { WorkerWalletSchema } from './worker_wallet_schema.js';

type WorkerMsg = { fn: string; args: string };

const log = createLogger('e2e:test-wallet:worker-wallet');

const WORKER_READY_TIMEOUT_MS = 120_000;

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
    // replace stc/ with dest/ so the wallet works in Jest tests
    const workerUrl = new URL('./wallet_worker_script.js', import.meta.url);
    workerUrl.pathname = workerUrl.pathname.replace('/src/', '/dest/');
    // remove JEST_WORKER_ID so the worker uses pino-pretty transport instead of Jest's raw output.
    const { JEST_WORKER_ID: _, ...parentEnv } = process.env;
    const worker = new Worker(workerUrl, {
      workerData: { nodeUrl, pxeConfig },
      env: {
        ...parentEnv,
        ...(process.stderr.isTTY || process.env.FORCE_COLOR ? { FORCE_COLOR: '1' } : {}),
        LOG_LEVEL: process.env.WORKER_LOG_LEVEL ?? 'info',
      },
    });

    const connector = new NodeConnector(worker);
    const client = new TransportClient<WorkerMsg>(connector);
    await client.open();

    const wallet = new WorkerWallet(worker, client);

    const { promise: workerDied, reject: rejectWorkerDied } = promiseWithResolvers<void>();
    // reject if the worker exits or errors before the warmup completes.
    const onError = (err: Error): void => {
      worker.off('exit', onExit!);
      rejectWorkerDied(new Error(`Worker wallet thread error: ${err.message}`));
    };

    const onExit = (code: number): void => {
      worker.off('error', onError!);
      rejectWorkerDied(new Error(`Worker wallet thread exited with code ${code} before becoming ready`));
    };

    worker.once('error', onError);
    worker.once('exit', onExit);

    const timeout = sleep(WORKER_READY_TIMEOUT_MS).then(() => {
      throw new Error(`Worker wallet creation timed out after ${WORKER_READY_TIMEOUT_MS / 1000}s`);
    });

    try {
      // wait for worker wallet to start
      await Promise.race([wallet.getChainInfo(), workerDied, timeout]);
    } catch (err) {
      log.error('Worker wallet creation failed, cleaning up', { error: String(err) });
      client.close();
      await worker.terminate();
      throw err;
    } finally {
      worker.off('error', onError);
      worker.off('exit', onExit);
    }

    return wallet;
  }

  private async callRaw(fn: string, ...args: any[]): Promise<string> {
    const argsJson = jsonStringify(args);
    return (await this.client.request({ fn, args: argsJson })) as string;
  }

  private async call(fn: string, ...args: any[]): Promise<any> {
    const resultJson = await this.callRaw(fn, ...args);
    const methodSchema = (WorkerWalletSchema as ApiSchema)[fn];
    return getSchemaReturnType(methodSchema).parseAsync(JSON.parse(resultJson));
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

  registerContractClass(artifact: ContractArtifact): Promise<void> {
    return this.call('registerContractClass', artifact);
  }

  simulateTx(exec: ExecutionPayload, opts: SimulateOptions): Promise<TxSimulationResultWithAppOffset> {
    return this.call('simulateTx', exec, opts);
  }

  executeUtility(call: FunctionCall, opts: ExecuteUtilityOptions): Promise<UtilityExecutionResult> {
    return this.call('executeUtility', call, opts);
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
  registerAccount(secret: Fr, salt: Fr, signingKey: Fq): Promise<AztecAddress> {
    return this.call('registerAccount', secret, salt, signingKey);
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
