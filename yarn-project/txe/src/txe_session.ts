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
import {
  ExecutionNoteCache,
  HashedValuesCache,
  type IPrivateExecutionOracle,
  type IUtilityExecutionOracle,
  PrivateExecutionOracle,
  UtilityExecutionOracle,
} from '@aztec/pxe/simulator';
import { FunctionSelector } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Body, L2Block } from '@aztec/stdlib/block';
import { GasSettings } from '@aztec/stdlib/gas';
import { PrivateContextInputs } from '@aztec/stdlib/kernel';
import { makeAppendOnlyTreeSnapshot, makeGlobalVariables } from '@aztec/stdlib/testing';
import { CallContext, GlobalVariables, TxContext } from '@aztec/stdlib/tx';
import type { UInt32 } from '@aztec/stdlib/types';

import { z } from 'zod';

import type { IAvmExecutionOracle, ITxeExecutionOracle } from './oracle/interfaces.js';
import { TXEOraclePublicContext } from './oracle/txe_oracle_public_context.js';
import { TXEOracleTopLevelContext } from './oracle/txe_oracle_top_level_context.js';
import { RPCTranslator } from './rpc_translator.js';
import { TXEStateMachine } from './state_machine/index.js';
import type { ForeignCallArgs, ForeignCallResult } from './util/encoding.js';
import { TXEAccountDataProvider } from './util/txe_account_data_provider.js';
import { TXEContractDataProvider } from './util/txe_contract_data_provider.js';
import {
  getSingleTxBlockRequestHash,
  insertTxEffectIntoWorldTrees,
  makeTXEBlockHeader,
} from './utils/block_creation.js';
import { makeTxEffect } from './utils/tx_effect_creation.js';

/**
 * A TXE Session can be in one of four states, which change as the test progresses and different oracles are called.
 * The current state determines which oracles are available. Some states also have data associated with them.
 */
type SessionState =
  /**
   * The top-level state is the default state, before any other state has been entered. This is where contracts can be
   * deployed, accounts created, blocks mined, etc.
   */
  | {
      name: 'TOP_LEVEL';
    }
  /**
   * The private state is entered via the `private_context` function. In this state the PXE oracles that `#[private]`
   * functions use are available, such as those related to note retrieval, notification of side-effects, capsule access,
   * etc. */
  | {
      name: 'PRIVATE';
      nextBlockGlobalVariables: GlobalVariables;
      txRequestHash: Fr;
      noteCache: ExecutionNoteCache;
    }
  /**
   * The public state is entered via the `public_context` function. In this state the AVM opcodes that `#[public]`
   * functions execute are resolved as oracles by TXE, since Noir tests are not transpiled. */
  | {
      name: 'PUBLIC';
    }
  /**
   * The utility state is entered via the `utility_context` function. In this state the PXE oracles that `#[utility]`
   * functions use are available, such as those related to (unconstrained) note retrieval, capsule access, public
   * storage reads, etc.
   */
  | {
      name: 'UTILITY';
    };

type MethodNames<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];

/**
 * The name of an oracle function that TXE supports, which are a combination of PXE oracles, non-transpiled AVM opcodes,
 * and custom TXE oracles.
 */
export type TXEOracleFunctionName = Exclude<
  MethodNames<RPCTranslator>,
  'constructor' | 'handlerAsMisc' | 'handlerAsUtility' | 'handlerAsPrivate' | 'handlerAsAvm' | 'handlerAsTxe'
>;

export interface TXESessionStateHandler {
  enterTopLevelState(): Promise<void>;
  enterPublicState(contractAddress?: AztecAddress): Promise<void>;
  enterPrivateState(contractAddress?: AztecAddress, anchorBlockNumber?: UInt32): Promise<PrivateContextInputs>;
  enterUtilityState(contractAddress?: AztecAddress): Promise<void>;
}

const DEFAULT_ADDRESS = AztecAddress.fromNumber(42);

/**
 * A `TXESession` corresponds to a Noir `#[test]` function, and handles all of its oracle calls, stores test-specific
 * state, etc., independent of all other tests running in parallel.
 */
export class TXESession implements TXESessionStateHandler {
  private state: SessionState = { name: 'TOP_LEVEL' };
  private authwits: Map<string, AuthWitness> = new Map();

  constructor(
    private logger: Logger,
    private stateMachine: TXEStateMachine,
    private oracleHandler:
      | IUtilityExecutionOracle
      | IPrivateExecutionOracle
      | IAvmExecutionOracle
      | ITxeExecutionOracle,
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
      new Map(),
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
    try {
      const translator = new RPCTranslator(this, this.oracleHandler) as any;
      // We perform a runtime validation to check that the function name corresponds to a real oracle handler.
      const validatedFunctionName = z
        .string()
        .refine(fn => typeof translator[fn] === 'function' && !fn.startsWith('handlerAs') && fn !== 'constructor')
        .parse(functionName) as TXEOracleFunctionName;

      return translator[validatedFunctionName](...inputs);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`${functionName} does not correspond to any oracle handler available on RPCTranslator`);
      } else if (error instanceof Error) {
        throw new Error(
          `Execution error while processing function ${functionName} in state ${this.state.name}: ${error.message}`,
        );
      } else {
        throw new Error(
          `Unknown execution error while processing function ${functionName} in state ${this.state.name}`,
        );
      }
    }
  }

  async enterTopLevelState() {
    switch (this.state.name) {
      case 'PRIVATE': {
        await this.exitPrivateState();
        break;
      }
      case 'PUBLIC': {
        await this.exitPublicState();
        break;
      }
      case 'UTILITY': {
        this.exitUtilityContext();
        break;
      }
      case 'TOP_LEVEL': {
        throw new Error(`Expected to be in state other than TOP_LEVEL`);
      }
      default: {
        this.state satisfies never;
      }
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
      this.authwits,
    );

    this.state = { name: 'TOP_LEVEL' };
    this.logger.debug(`Entered state ${this.state.name}`);
  }

  async enterPrivateState(
    contractAddress: AztecAddress = DEFAULT_ADDRESS,
    anchorBlockNumber?: UInt32,
  ): Promise<PrivateContextInputs> {
    this.exitTopLevelState();

    // There is no automatic message discovery and contract-driven syncing process in inlined private or utility
    // contexts, which means that known nullifiers are also not searched for, since it is during the tagging sync that
    // we perform this. We therefore search for known nullifiers now, as otherwise notes that were nullified would not
    // be removed from the database.
    // TODO(#12553): make the synchronizer sync here instead and remove this
    await this.pxeOracleInterface.syncNoteNullifiers(contractAddress);

    // Private execution has two associated block numbers: the anchor block (i.e. the historical block that is used to
    // build the proof), and the *next* block, i.e. the one we'll create once the execution ends, and which will contain
    // a single transaction with the effects of what was done in the test.
    const anchorBlock = await this.stateMachine.node.getBlockHeader(anchorBlockNumber ?? 'latest');
    const latestBlock = await this.stateMachine.node.getBlockHeader('latest');

    const nextBlockGlobalVariables = makeGlobalVariables(undefined, {
      blockNumber: latestBlock!.globalVariables.blockNumber + 1,
      timestamp: this.nextBlockTimestamp,
      version: this.version,
      chainId: this.chainId,
    });

    const txRequestHash = getSingleTxBlockRequestHash(nextBlockGlobalVariables.blockNumber);
    const noteCache = new ExecutionNoteCache(txRequestHash);

    this.oracleHandler = new PrivateExecutionOracle(
      Fr.ZERO,
      new TxContext(this.chainId, this.version, GasSettings.empty()),
      new CallContext(AztecAddress.ZERO, contractAddress, FunctionSelector.empty(), false),
      anchorBlock!,
      [],
      [],
      new HashedValuesCache(),
      noteCache,
      this.pxeOracleInterface,
    );

    // We store the note cache fed into the PrivateExecutionOracle (along with some other auxiliary data) in order to
    // refer to it later, mimicking the way this object is used by the ContractFunctionSimulator. The difference resides
    // in that the simulator has all information needed in order to run the simulation, while ours will be ongoing as
    // the different oracles will be invoked from the Noir test, until eventually the private execution finishes.
    this.state = { name: 'PRIVATE', nextBlockGlobalVariables, txRequestHash, noteCache };
    this.logger.debug(`Entered state ${this.state.name}`);

    return (this.oracleHandler as PrivateExecutionOracle).getPrivateContextInputs();
  }

  async enterPublicState(contractAddress?: AztecAddress) {
    this.exitTopLevelState();

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

    this.state = { name: 'PUBLIC' };
    this.logger.debug(`Entered state ${this.state.name}`);
  }

  async enterUtilityState(contractAddress: AztecAddress = DEFAULT_ADDRESS) {
    this.exitTopLevelState();

    // There is no automatic message discovery and contract-driven syncing process in inlined private or utility
    // contexts, which means that known nullifiers are also not searched for, since it is during the tagging sync that
    // we perform this. We therefore search for known nullifiers now, as otherwise notes that were nullified would not
    // be removed from the database.
    // TODO(#12553): make the synchronizer sync here instead and remove this
    await this.pxeOracleInterface.syncNoteNullifiers(contractAddress);

    this.oracleHandler = new UtilityExecutionOracle(contractAddress, [], [], this.pxeOracleInterface);

    this.state = { name: 'UTILITY' };
    this.logger.debug(`Entered state ${this.state.name}`);
  }

  private exitTopLevelState() {
    if (this.state.name != 'TOP_LEVEL') {
      throw new Error(`Expected to be in state 'TOP_LEVEL', but got '${this.state.name}' instead`);
    }

    // Note that while all public and private contexts do is build a single block that we then process when exiting
    // those, the top level context performs a large number of actions not captured in the following 'close' call. Among
    // others, it will create empty blocks (via `txeAdvanceBlocksBy` and `deploy`), create blocks with transactions via
    // `txePrivateCallNewFlow` and `txePublicCallNewFlow`, add accounts to PXE via `txeAddAccount`, etc. This is a
    // slight inconsistency in the working model of this class, but is not too bad.
    // TODO: it's quite unfortunate that we need to capture the authwits created to later pass them again when the top
    // level context is re-created. This is because authwits create a temporary utility context that'd otherwise reset
    // the authwits if not persisted, so we'd not be able to pass more than one per execution.
    // Ideally authwits would be passed alongside a contract call instead of pre-seeded.
    [this.nextBlockTimestamp, this.authwits] = (this.oracleHandler as TXEOracleTopLevelContext).close();
  }

  private async exitPrivateState() {
    if (this.state.name != 'PRIVATE') {
      throw new Error(`Expected to be in state 'PRIVATE', but got '${this.state.name}' instead`);
    }

    this.logger.debug('Exiting Private state, building block with collected side effects', {
      blockNumber: this.state.nextBlockGlobalVariables.blockNumber,
    });

    // We rely on the note cache to determine the effects of the transaction. This is incomplete as it doesn't private
    // logs (other effects like enqueued public calls don't need to be considered since those are not allowed).
    const txEffect = await makeTxEffect(
      this.state.noteCache,
      this.state.txRequestHash,
      this.state.nextBlockGlobalVariables.blockNumber,
    );

    // We build a block holding just this transaction
    const forkedWorldTrees = await this.stateMachine.synchronizer.nativeWorldStateService.fork();
    await insertTxEffectIntoWorldTrees(txEffect, forkedWorldTrees);

    const block = new L2Block(
      makeAppendOnlyTreeSnapshot(),
      await makeTXEBlockHeader(forkedWorldTrees, this.state.nextBlockGlobalVariables),
      new Body([txEffect]),
    );
    await this.stateMachine.handleL2Block(block);

    await forkedWorldTrees.close();

    this.logger.debug('Exited PublicContext with built block', {
      blockNumber: block.number,
      txEffects: block.body.txEffects,
    });
  }

  private async exitPublicState() {
    if (this.state.name != 'PUBLIC') {
      throw new Error(`Expected to be in state 'PUBLIC', but got '${this.state.name}' instead`);
    }

    const block = await (this.oracleHandler as TXEOraclePublicContext).close();
    await this.stateMachine.handleL2Block(block);
  }

  private exitUtilityContext() {
    if (this.state.name != 'UTILITY') {
      throw new Error(`Expected to be in state 'UTILITY', but got '${this.state.name}' instead`);
    }
  }
}
