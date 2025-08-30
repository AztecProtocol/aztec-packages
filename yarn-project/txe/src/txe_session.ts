import { AztecAddress, Fr } from '@aztec/aztec.js';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { KeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { ProtocolContract } from '@aztec/protocol-contracts';
import {
  AddressDataProvider,
  CapsuleDataProvider,
  NoteDataProvider,
  PrivateEventDataProvider,
  TaggingDataProvider,
} from '@aztec/pxe/server';
import type { PrivateContextInputs } from '@aztec/stdlib/kernel';
import { makeGlobalVariables } from '@aztec/stdlib/testing';
import type { UInt32 } from '@aztec/stdlib/types';

import { TXE } from './oracle/txe_oracle.js';
import { TXEOraclePublicContext } from './oracle/txe_oracle_public_context.js';
import type { TXETypedOracle } from './oracle/txe_typed_oracle.js';
import { TXEStateMachine } from './state_machine/index.js';
import { TXEService } from './txe_service/txe_service.js';
import type { ForeignCallArgs, ForeignCallResult } from './util/encoding.js';
import { TXEAccountDataProvider } from './util/txe_account_data_provider.js';
import { TXEContractDataProvider } from './util/txe_contract_data_provider.js';

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
  state = SessionState.TOP_LEVEL;

  constructor(
    private logger: Logger,
    private stateMachine: TXEStateMachine,
    private oracleHandler: TXETypedOracle,
    private legacyTXEOracle: TXE,
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

    const txeOracle = new TXE(
      keyStore,
      contractDataProvider,
      noteDataProvider,
      capsuleDataProvider,
      taggingDataProvider,
      addressDataProvider,
      privateEventDataProvider,
      accountDataProvider,
      DEFAULT_ADDRESS,
      await stateMachine.synchronizer.nativeWorldStateService.fork(),
      stateMachine,
    );
    await txeOracle.txeAdvanceBlocksBy(1);

    return new TXESession(createLogger('txe:session'), stateMachine, txeOracle, txeOracle);
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

  async setTopLevelContext(): Promise<void> {
    if (this.state == SessionState.PRIVATE) {
      await this.oracleHandler.txeAdvanceBlocksBy(1);
      this.oracleHandler.txeSetContractAddress(DEFAULT_ADDRESS);
    } else if (this.state == SessionState.PUBLIC) {
      const block = await (this.oracleHandler as TXEOraclePublicContext).close();

      await this.stateMachine.handleL2Block(block);

      this.legacyTXEOracle.baseFork = await this.stateMachine.synchronizer.nativeWorldStateService.fork();
      this.legacyTXEOracle.txeSetContractAddress(DEFAULT_ADDRESS);
      this.legacyTXEOracle.setBlockNumber(block.number + 1);

      this.oracleHandler = this.legacyTXEOracle;
    } else if (this.state == SessionState.UTILITY) {
      this.oracleHandler.txeSetContractAddress(DEFAULT_ADDRESS);
    } else if (this.state == SessionState.TOP_LEVEL) {
      throw new Error(`Expected to be in state other than ${SessionState[SessionState.TOP_LEVEL]}`);
    } else {
      throw new Error(`Unexpected state '${this.state}'`);
    }

    this.state = SessionState.TOP_LEVEL;
    this.logger.debug(`Entered state ${SessionState[this.state]}`);
  }

  async setPublicContext(contractAddress?: AztecAddress): Promise<void> {
    this.assertInTopLevelState();

    const globalVariables = makeGlobalVariables(undefined, {
      blockNumber: await this.legacyTXEOracle.utilityGetBlockNumber(),
      timestamp: await this.legacyTXEOracle.utilityGetTimestamp(),
      version: await this.legacyTXEOracle.utilityGetVersion(),
      chainId: await this.legacyTXEOracle.utilityGetChainId(),
    });

    const txRequestHash = new Fr(globalVariables.blockNumber + 6969);

    this.oracleHandler = new TXEOraclePublicContext(
      contractAddress ?? DEFAULT_ADDRESS,
      await this.stateMachine.synchronizer.nativeWorldStateService.fork(),
      txRequestHash,
      globalVariables,
    );

    this.state = SessionState.PUBLIC;
    this.logger.debug(`Entered state ${SessionState[this.state]}`);
  }

  async setPrivateContext(
    contractAddress?: AztecAddress,
    historicalBlockNumber?: UInt32,
  ): Promise<PrivateContextInputs> {
    this.assertInTopLevelState();

    if (contractAddress) {
      this.oracleHandler.txeSetContractAddress(contractAddress);
    }

    const privateContextInputs = await this.oracleHandler.txeGetPrivateContextInputs(historicalBlockNumber);

    this.state = SessionState.PRIVATE;
    this.logger.debug(`Entered state ${SessionState[this.state]}`);

    return privateContextInputs;
  }

  setUtilityContext(contractAddress?: AztecAddress): Promise<void> {
    this.assertInTopLevelState();

    if (contractAddress) {
      this.oracleHandler.txeSetContractAddress(contractAddress);
    }

    this.state = SessionState.UTILITY;
    this.logger.debug(`Entered state ${SessionState[this.state]}`);

    return Promise.resolve();
  }

  private assertInTopLevelState() {
    if (this.state != SessionState.TOP_LEVEL) {
      throw new Error(
        `Expected to be in state ${SessionState[SessionState.TOP_LEVEL]}, but got '${SessionState[this.state]}' instead`,
      );
    }
  }
}
