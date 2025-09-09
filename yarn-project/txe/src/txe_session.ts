import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { KeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { ProtocolContract } from '@aztec/protocol-contracts';
import {
  AddressDataProvider,
  CapsuleDataProvider,
  NoteDataProvider,
  PXEOracleInterface,
  PrivateEventDataProvider,
  TaggingDataProvider,
} from '@aztec/pxe/server';
import { FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GasSettings } from '@aztec/stdlib/gas';
import { PrivateContextInputs } from '@aztec/stdlib/kernel';
import { makeGlobalVariables } from '@aztec/stdlib/testing';
import { CallContext, GlobalVariables, TxContext } from '@aztec/stdlib/tx';
import type { UInt32 } from '@aztec/stdlib/types';

import { TXE } from './oracle/txe_oracle.js';
import { TXEOraclePublicContext } from './oracle/txe_oracle_public_context.js';
import { TXEOracleTopLevelContext } from './oracle/txe_oracle_top_level_context.js';
import type { TXETypedOracle } from './oracle/txe_typed_oracle.js';
import { TXEStateMachine } from './state_machine/index.js';
import { TXEService } from './txe_service/txe_service.js';
import type { ForeignCallArgs, ForeignCallResult } from './util/encoding.js';
import { TXEAccountDataProvider } from './util/txe_account_data_provider.js';
import { TXEContractDataProvider } from './util/txe_contract_data_provider.js';
import { getSingleTxBlockRequestHash } from './utils/block_creation.js';

/**
 * A TXE Session can be ine one of four states, which change as the test progresses and different oracles are called.
 * The current state determines which oracles are available.
 */
enum SessionState {
  /**
   * The top-level state is the default state, before any other state has been entered. This is where contracts can be
   * deployed, accounts created, blocks mined, etc.
   */
  TOP_LEVEL,
  /**
   * The private state is entered via the `private_context` function. In this state the PXE oracles that `#[private]`
   * functions use are available, such as those related to note retrieval, notification of side-effects, capsule access,
   * etc. */
  PRIVATE,
  /**
   * The public state is entered via the `public_context` function. In this state the AVM opcodes that `#[public]`
   * functions execute are resolved as oracles by TXE, since Noir tests are not transpiled. */
  PUBLIC,
  /**
   * The utility state is entered via the `utility_context` function. In this state the PXE oracles that `#[utility]`
   * functions use are available, such as those related to (unconstrained) note retrieval, capsule access, public
   * storage reads, etc.
   */
  UTILITY,
}

type MethodNames<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];

/**
 * The name of an oracle function that TXE supports, which are a combination of PXE oracles, non-transpiled AVM opcodes,
 * and custom TXE oracles.
 */
export type TXEOracleFunctionName = MethodNames<TXEService>;

export interface TXESessionStateHandler {
  setTopLevelContext(): Promise<void>;
  setPublicContext(contractAddress?: AztecAddress): Promise<void>;
  setPrivateContext(contractAddress?: AztecAddress, historicalBlockNumber?: UInt32): Promise<PrivateContextInputs>;
  setUtilityContext(contractAddress?: AztecAddress): Promise<void>;
}

const DEFAULT_ADDRESS = AztecAddress.fromNumber(42);

/**
 * A `TXESession` corresponds to a Noir `#[test]` function, and handles all of its oracle calls, stores test-specific
 * state, etc., independent of all other tests running in parallel.
 */
export class TXESession implements TXESessionStateHandler {
  private state = SessionState.TOP_LEVEL;

  constructor(
    private logger: Logger,
    private stateMachine: TXEStateMachine,
    private oracleHandler: TXETypedOracle,
    private contractDataProvider: TXEContractDataProvider,
    private keyStore: KeyStore,
    private addressDataProvider: AddressDataProvider,
    private accountDataProvider: TXEAccountDataProvider,
    private chainId: Fr,
    private version: Fr,
    private nextBlockTimestamp: bigint,
    private pxeOracleInterface: PXEOracleInterface,
  ) {}

  static async init(protocolContracts: ProtocolContract[]) {
    const store = await openTmpStore('txe-session');

    const addressDataProvider = new AddressDataProvider(store);
    const privateEventDataProvider = new PrivateEventDataProvider(store);
    const contractDataProvider = new TXEContractDataProvider(store);
    const noteDataProvider = await NoteDataProvider.create(store);
    const taggingDataProvider = new TaggingDataProvider(store);
    const capsuleDataProvider = new CapsuleDataProvider(store);
    const keyStore = new KeyStore(store);
    const accountDataProvider = new TXEAccountDataProvider(store);

    // Register protocol contracts.
    for (const { contractClass, instance, artifact } of protocolContracts) {
      await contractDataProvider.addContractArtifact(contractClass.id, artifact);
      await contractDataProvider.addContractInstance(instance);
    }

    const stateMachine = await TXEStateMachine.create(store);

    const nextBlockTimestamp = BigInt(Math.floor(new Date().getTime() / 1000));
    const version = new Fr(await stateMachine.node.getVersion());
    const chainId = new Fr(await stateMachine.node.getChainId());

    const pxeOracleInterface = new PXEOracleInterface(
      stateMachine.node,
      keyStore,
      contractDataProvider,
      noteDataProvider,
      capsuleDataProvider,
      stateMachine.syncDataProvider,
      taggingDataProvider,
      addressDataProvider,
      privateEventDataProvider,
    );

    const topLevelOracleHandler = new TXEOracleTopLevelContext(
      stateMachine,
      contractDataProvider,
      keyStore,
      addressDataProvider,
      accountDataProvider,
      pxeOracleInterface,
      nextBlockTimestamp,
      version,
      chainId,
    );
    await topLevelOracleHandler.txeAdvanceBlocksBy(1);

    return new TXESession(
      createLogger('txe:session'),
      stateMachine,
      topLevelOracleHandler,
      contractDataProvider,
      keyStore,
      addressDataProvider,
      accountDataProvider,
      version,
      chainId,
      nextBlockTimestamp,
      pxeOracleInterface,
    );
  }

  /**
   * Processes an oracle function invoked by the Noir test associated to this session.
   * @param functionName The name of the oracle.
   * @param inputs The inputs of the oracle.
   * @returns The oracle return values.
   */
  processFunction(functionName: TXEOracleFunctionName, inputs: ForeignCallArgs): Promise<ForeignCallResult> {
    return (new TXEService(this, this.oracleHandler) as any)[functionName](...inputs);
  }

  async setTopLevelContext() {
    if (this.state == SessionState.PRIVATE) {
      await this.exitPrivateContext();
    } else if (this.state == SessionState.PUBLIC) {
      await this.exitPublicContext();
    } else if (this.state == SessionState.UTILITY) {
      this.exitUtilityContext();
    } else if (this.state == SessionState.TOP_LEVEL) {
      throw new Error(`Expected to be in state other than ${SessionState[SessionState.TOP_LEVEL]}`);
    } else {
      throw new Error(`Unexpected state '${this.state}'`);
    }

    this.oracleHandler = new TXEOracleTopLevelContext(
      this.stateMachine,
      this.contractDataProvider,
      this.keyStore,
      this.addressDataProvider,
      this.accountDataProvider,
      this.pxeOracleInterface,
      this.nextBlockTimestamp,
      this.version,
      this.chainId,
    );

    this.state = SessionState.TOP_LEVEL;
    this.logger.debug(`Entered state ${SessionState[this.state]}`);
  }

  async setPublicContext(contractAddress?: AztecAddress) {
    this.exitTopLevelContext();

    // The PublicContext will create a block with a single transaction in it, containing the effects of what was done in
    // the test. The block therefore gets the *next* block number and timestamp.
    const latestBlockNumber = (await this.stateMachine.node.getBlockHeader('latest'))!.globalVariables.blockNumber;
    const globalVariables = makeGlobalVariables(undefined, {
      blockNumber: latestBlockNumber + 1,
      timestamp: this.nextBlockTimestamp,
      version: this.version,
      chainId: this.chainId,
    });

    this.oracleHandler = new TXEOraclePublicContext(
      contractAddress ?? DEFAULT_ADDRESS,
      await this.stateMachine.synchronizer.nativeWorldStateService.fork(),
      getSingleTxBlockRequestHash(globalVariables.blockNumber),
      globalVariables,
    );

    this.state = SessionState.PUBLIC;
    this.logger.debug(`Entered state ${SessionState[this.state]}`);
  }

  async setPrivateContext(contractAddress?: AztecAddress, anchorBlockNumber?: UInt32): Promise<PrivateContextInputs> {
    this.exitTopLevelContext();

    // A PrivateContext has two associated block numbers: the anchor block (i.e. the historical block that is used to build the
    // proof), and the *next* block, i.e. the one the PrivateContext will create with the single transaction that
    // contains the effects of what was done in the test.
    const anchorBlock = await this.stateMachine.node.getBlockHeader(anchorBlockNumber ?? 'latest');
    const latestBlock = await this.stateMachine.node.getBlockHeader('latest');

    const anchorBlockGlobalVariables = makeGlobalVariables(undefined, {
      blockNumber: anchorBlock!.globalVariables.blockNumber,
      timestamp: anchorBlock!.globalVariables.timestamp,
      version: this.version,
      chainId: this.chainId,
    });

    const nextBlockGlobalVariables = makeGlobalVariables(undefined, {
      blockNumber: latestBlock!.globalVariables.blockNumber + 1,
      timestamp: this.nextBlockTimestamp,
      version: this.version,
      chainId: this.chainId,
    });

    const privateContextInputs = await this.getPrivateContextInputs(
      anchorBlockGlobalVariables.blockNumber,
      contractAddress ?? DEFAULT_ADDRESS,
    );

    this.oracleHandler = new TXE(
      contractAddress ?? DEFAULT_ADDRESS,
      this.pxeOracleInterface,
      await this.stateMachine.synchronizer.nativeWorldStateService.fork(),
      anchorBlockGlobalVariables,
      nextBlockGlobalVariables,
      getSingleTxBlockRequestHash(nextBlockGlobalVariables.blockNumber), // The tx will be inserted in the *next* block
    );

    this.state = SessionState.PRIVATE;
    this.logger.debug(`Entered state ${SessionState[this.state]}`);

    return privateContextInputs;
  }

  async setUtilityContext(contractAddress?: AztecAddress) {
    this.exitTopLevelContext();

    // A UtilityContext is built using the latest block as a reference, mimicking what would happen if PXE had synced
    // all the way to the tip of the chain.
    const latestBlock = await this.stateMachine.node.getBlockHeader('latest');

    this.oracleHandler = new TXE(
      contractAddress ?? DEFAULT_ADDRESS,
      this.pxeOracleInterface,
      await this.stateMachine.synchronizer.nativeWorldStateService.fork(),
      latestBlock!.globalVariables,
      GlobalVariables.empty(), // unused - will be removed after private/utility split
      Fr.random(), // unused - will be removed after private/utility split
    );

    this.state = SessionState.UTILITY;
    this.logger.debug(`Entered state ${SessionState[this.state]}`);
  }

  private exitTopLevelContext() {
    this.assertState(SessionState.TOP_LEVEL);

    // Note that while all public and private contexts do is build a single block that we then process when exiting
    // those, the top level context performs a large number of actions not captured in the following 'close' call. Among
    // others, it will create empty blocks (via `txeAdvanceBlocksBy` and `deploy`), create blocks with transactions via
    // `txePrivateCallNewFlow` and `txePublicCallNewFlow`, add accounts to PXE via `txeAddAccount`, etc. This is a
    // slight inconsistency in the working model of this class, but is not too bad.
    this.nextBlockTimestamp = (this.oracleHandler as TXEOracleTopLevelContext).close();
  }

  private async exitPublicContext() {
    this.assertState(SessionState.PUBLIC);

    const block = await (this.oracleHandler as TXEOraclePublicContext).close();
    await this.stateMachine.handleL2Block(block);
  }

  private async exitPrivateContext() {
    this.assertState(SessionState.PRIVATE);

    const block = await (this.oracleHandler as TXE).close();
    await this.stateMachine.handleL2Block(block);
  }

  private exitUtilityContext() {
    this.assertState(SessionState.UTILITY);
  }

  private assertState(state: SessionState) {
    if (this.state != state) {
      throw new Error(`Expected to be in state ${SessionState[state]}, but got '${SessionState[this.state]}' instead`);
    }
  }

  private async getPrivateContextInputs(anchorBlockNumber: number, contractAddress: AztecAddress) {
    this.logger.info(`Creating private context for block ${anchorBlockNumber}`);

    const sender = await AztecAddress.random();

    return new PrivateContextInputs(
      new CallContext(sender, contractAddress, FunctionSelector.empty(), false),
      (await this.stateMachine.node.getBlockHeader(anchorBlockNumber))!,
      new TxContext(this.chainId, this.version, GasSettings.empty()),
      0,
    );
  }
}
