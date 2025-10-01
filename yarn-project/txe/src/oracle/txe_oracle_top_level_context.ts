import {
  CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS,
  DEFAULT_DA_GAS_LIMIT,
  DEFAULT_L2_GAS_LIMIT,
  DEFAULT_TEARDOWN_DA_GAS_LIMIT,
  DEFAULT_TEARDOWN_L2_GAS_LIMIT,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
} from '@aztec/constants';
import { Schnorr } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { LogLevels, type Logger, applyStringFormatting, createLogger } from '@aztec/foundation/log';
import { TestDateProvider } from '@aztec/foundation/timer';
import type { KeyStore } from '@aztec/key-store';
import {
  AddressDataProvider,
  ORACLE_VERSION,
  PXEOracleInterface,
  enrichPublicSimulationError,
} from '@aztec/pxe/server';
import {
  ExecutionNoteCache,
  HashedValuesCache,
  type IMiscOracle,
  Oracle,
  PrivateExecutionOracle,
  UtilityExecutionOracle,
  executePrivateFunction,
  generateSimulatedProvingResult,
} from '@aztec/pxe/simulator';
import {
  ExecutionError,
  WASMSimulator,
  createSimulationError,
  extractCallStack,
  resolveAssertionMessageFromError,
  toACVMWitness,
  witnessMapToFields,
} from '@aztec/simulator/client';
import {
  GuardedMerkleTreeOperations,
  PublicContractsDB,
  PublicProcessor,
  PublicTxSimulator,
} from '@aztec/simulator/server';
import { type ContractArtifact, FunctionSelector, FunctionType } from '@aztec/stdlib/abi';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Body, L2Block } from '@aztec/stdlib/block';
import { type ContractInstanceWithAddress, computePartialAddress } from '@aztec/stdlib/contract';
import { Gas, GasFees, GasSettings } from '@aztec/stdlib/gas';
import { computeCalldataHash, siloNullifier } from '@aztec/stdlib/hash';
import {
  PartialPrivateTailPublicInputsForPublic,
  PrivateKernelTailCircuitPublicInputs,
  PrivateToPublicAccumulatedData,
  PublicCallRequest,
} from '@aztec/stdlib/kernel';
import { ClientIvcProof } from '@aztec/stdlib/proofs';
import { makeAppendOnlyTreeSnapshot, makeGlobalVariables } from '@aztec/stdlib/testing';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import {
  CallContext,
  HashedValues,
  PrivateCallExecutionResult,
  PrivateExecutionResult,
  Tx,
  TxConstantData,
  TxContext,
  TxEffect,
  TxHash,
  collectNested,
} from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';
import { ForkCheckpoint } from '@aztec/world-state';

import type { TXEStateMachine } from '../state_machine/index.js';
import type { TXEAccountDataProvider } from '../util/txe_account_data_provider.js';
import type { TXEContractDataProvider } from '../util/txe_contract_data_provider.js';
import { TXEPublicContractDataSource } from '../util/txe_public_contract_data_source.js';
import {
  getSingleTxBlockRequestHash,
  insertTxEffectIntoWorldTrees,
  makeTXEBlockHeader,
} from '../utils/block_creation.js';
import type { ITxeExecutionOracle } from './interfaces.js';

export class TXEOracleTopLevelContext implements IMiscOracle, ITxeExecutionOracle {
  isMisc = true as const;
  isTxe = true as const;

  private logger: Logger;

  constructor(
    private stateMachine: TXEStateMachine,
    private contractDataProvider: TXEContractDataProvider,
    private keyStore: KeyStore,
    private addressDataProvider: AddressDataProvider,
    private accountDataProvider: TXEAccountDataProvider,
    private pxeOracleInterface: PXEOracleInterface,
    private nextBlockTimestamp: bigint,
    private version: Fr,
    private chainId: Fr,
    private authwits: Map<string, AuthWitness>,
  ) {
    this.logger = createLogger('txe:top_level_context');
    this.logger.debug('Entering Top Level Context');
  }

  utilityAssertCompatibleOracleVersion(version: number): void {
    if (version !== ORACLE_VERSION) {
      throw new Error(
        `Incompatible oracle version. TXE is using version '${ORACLE_VERSION}', but got a request for '${version}'.`,
      );
    }
  }

  // This is typically only invoked in private contexts, but it is convenient to also have it in top-level for testing
  // setup.
  utilityGetRandomField(): Fr {
    return Fr.random();
  }

  // We instruct users to debug contracts via this oracle, so it makes sense that they'd expect it to also work in tests
  utilityDebugLog(level: number, message: string, fields: Fr[]): void {
    if (!LogLevels[level]) {
      throw new Error(`Invalid debug log level: ${level}`);
    }
    const levelName = LogLevels[level];

    this.logger[levelName](`${applyStringFormatting(message, fields)}`, { module: `${this.logger.module}:debug_log` });
  }

  async txeGetNextBlockNumber(): Promise<number> {
    return (await this.getLastBlockNumber()) + 1;
  }

  txeGetNextBlockTimestamp(): Promise<bigint> {
    return Promise.resolve(this.nextBlockTimestamp);
  }

  async txeGetLastBlockTimestamp() {
    return (await this.stateMachine.node.getBlockHeader('latest'))!.globalVariables.timestamp;
  }

  async txeGetLastTxEffects() {
    const block = await this.stateMachine.archiver.getBlock('latest');

    if (block!.body.txEffects.length != 1) {
      // Note that calls like env.mine() will result in blocks with no transactions, hitting this
      throw new Error(`Expected a single transaction in the last block, found ${block!.body.txEffects.length}`);
    }

    const txEffects = block!.body.txEffects[0];

    return { txHash: txEffects.txHash, noteHashes: txEffects.noteHashes, nullifiers: txEffects.nullifiers };
  }

  async txeAdvanceBlocksBy(blocks: number) {
    this.logger.debug(`time traveling ${blocks} blocks`);

    for (let i = 0; i < blocks; i++) {
      await this.mineBlock();
    }
  }

  txeAdvanceTimestampBy(duration: UInt64) {
    this.logger.debug(`time traveling ${duration} seconds`);
    this.nextBlockTimestamp += duration;
  }

  async txeDeploy(artifact: ContractArtifact, instance: ContractInstanceWithAddress, secret: Fr) {
    // Emit deployment nullifier
    await this.mineBlock({
      nullifiers: [
        await siloNullifier(
          AztecAddress.fromNumber(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS),
          instance.address.toField(),
        ),
      ],
    });

    if (!secret.equals(Fr.ZERO)) {
      await this.txeAddAccount(artifact, instance, secret);
    } else {
      await this.contractDataProvider.addContractInstance(instance);
      await this.contractDataProvider.addContractArtifact(instance.currentContractClassId, artifact);
      this.logger.debug(`Deployed ${artifact.name} at ${instance.address}`);
    }
  }

  async txeAddAccount(artifact: ContractArtifact, instance: ContractInstanceWithAddress, secret: Fr) {
    const partialAddress = await computePartialAddress(instance);

    this.logger.debug(`Deployed ${artifact.name} at ${instance.address}`);
    await this.contractDataProvider.addContractInstance(instance);
    await this.contractDataProvider.addContractArtifact(instance.currentContractClassId, artifact);

    const completeAddress = await this.keyStore.addAccount(secret, partialAddress);
    await this.accountDataProvider.setAccount(completeAddress.address, completeAddress);
    await this.addressDataProvider.addCompleteAddress(completeAddress);
    this.logger.debug(`Created account ${completeAddress.address}`);

    return completeAddress;
  }

  async txeCreateAccount(secret: Fr) {
    // This is a footgun !
    const completeAddress = await this.keyStore.addAccount(secret, secret);
    await this.accountDataProvider.setAccount(completeAddress.address, completeAddress);
    await this.addressDataProvider.addCompleteAddress(completeAddress);
    this.logger.debug(`Created account ${completeAddress.address}`);

    return completeAddress;
  }

  async txeAddAuthWitness(address: AztecAddress, messageHash: Fr) {
    const account = await this.accountDataProvider.getAccount(address);
    const privateKey = await this.keyStore.getMasterSecretKey(account.publicKeys.masterIncomingViewingPublicKey);

    const schnorr = new Schnorr();
    const signature = await schnorr.constructSignature(messageHash.toBuffer(), privateKey);

    const authWitness = new AuthWitness(messageHash, [...signature.toBuffer()]);

    this.authwits.set(authWitness.requestHash.toString(), authWitness);
  }

  async mineBlock(options: { nullifiers?: Fr[] } = {}) {
    const blockNumber = await this.txeGetNextBlockNumber();

    const txEffect = TxEffect.empty();
    txEffect.nullifiers = [getSingleTxBlockRequestHash(blockNumber), ...(options.nullifiers ?? [])];
    txEffect.txHash = new TxHash(new Fr(blockNumber));

    const forkedWorldTrees = await this.stateMachine.synchronizer.nativeWorldStateService.fork();
    await insertTxEffectIntoWorldTrees(txEffect, forkedWorldTrees);

    const block = new L2Block(
      makeAppendOnlyTreeSnapshot(),
      await makeTXEBlockHeader(
        forkedWorldTrees,
        makeGlobalVariables(undefined, {
          blockNumber,
          timestamp: this.nextBlockTimestamp,
          version: this.version,
          chainId: this.chainId,
        }),
      ),
      new Body([txEffect]),
    );

    await forkedWorldTrees.close();

    this.logger.info(`Created block ${blockNumber} with timestamp ${block.header.globalVariables.timestamp}`);

    await this.stateMachine.handleL2Block(block);
  }

  async txePrivateCallNewFlow(
    from: AztecAddress,
    targetContractAddress: AztecAddress = AztecAddress.zero(),
    functionSelector: FunctionSelector = FunctionSelector.empty(),
    args: Fr[],
    argsHash: Fr = Fr.zero(),
    isStaticCall: boolean = false,
  ) {
    this.logger.verbose(
      `Executing external function ${await this.contractDataProvider.getDebugFunctionName(targetContractAddress, functionSelector)}@${targetContractAddress} isStaticCall=${isStaticCall}`,
    );

    const artifact = await this.contractDataProvider.getFunctionArtifact(targetContractAddress, functionSelector);
    if (!artifact) {
      const message = functionSelector.equals(await FunctionSelector.fromSignature('verify_private_authwit(Field)'))
        ? 'Found no account contract artifact for a private authwit check - use `create_contract_account` instead of `create_light_account` for authwit support.'
        : 'Function Artifact does not exist';
      throw new Error(message);
    }

    const blockNumber = await this.txeGetNextBlockNumber();

    const callContext = new CallContext(from, targetContractAddress, functionSelector, isStaticCall);

    const gasLimits = new Gas(DEFAULT_DA_GAS_LIMIT, DEFAULT_L2_GAS_LIMIT);

    const teardownGasLimits = new Gas(DEFAULT_TEARDOWN_DA_GAS_LIMIT, DEFAULT_TEARDOWN_L2_GAS_LIMIT);

    const gasSettings = new GasSettings(gasLimits, teardownGasLimits, GasFees.empty(), GasFees.empty());

    const txContext = new TxContext(this.chainId, this.version, gasSettings);

    const blockHeader = await this.pxeOracleInterface.getAnchorBlockHeader();

    const txRequestHash = getSingleTxBlockRequestHash(blockNumber);
    const noteCache = new ExecutionNoteCache(txRequestHash);

    const simulator = new WASMSimulator();

    const privateExecutionOracle = new PrivateExecutionOracle(
      argsHash,
      txContext,
      callContext,
      /** Header of a block whose state is used during private execution (not the block the transaction is included in). */
      blockHeader,
      /** List of transient auth witnesses to be used during this simulation */
      Array.from(this.authwits.values()),
      /** List of transient auth witnesses to be used during this simulation */
      [],
      HashedValuesCache.create([new HashedValues(args, argsHash)]),
      noteCache,
      this.pxeOracleInterface,
      0,
      1,
      undefined, // log
      undefined, // scopes
      /**
       * In TXE, the typical transaction entrypoint is skipped, so we need to simulate the actions that such a
       * contract would perform, including setting senderForTags.
       */
      from,
      simulator,
    );

    // Note: This is a slight modification of simulator.run without any of the checks. Maybe we should modify simulator.run with a boolean value to skip checks.
    let result: PrivateExecutionResult;
    let executionResult: PrivateCallExecutionResult;
    try {
      executionResult = await executePrivateFunction(
        simulator,
        privateExecutionOracle,
        artifact,
        targetContractAddress,
        functionSelector,
      );

      const publicCallRequests = collectNested([executionResult], r =>
        r.publicInputs.publicCallRequests
          .getActiveItems()
          .map(r => r.inner)
          .concat(r.publicInputs.publicTeardownCallRequest.isEmpty() ? [] : [r.publicInputs.publicTeardownCallRequest]),
      );
      const publicFunctionsCalldata = await Promise.all(
        publicCallRequests.map(async r => {
          const calldata = await privateExecutionOracle.privateLoadFromExecutionCache(r.calldataHash);
          return new HashedValues(calldata, r.calldataHash);
        }),
      );

      // TXE's top level context does not track side effect counters, and as such, minRevertibleSideEffectCounter is always 0.
      // This has the unfortunate consequence of always producing revertible nullifiers, which means we
      // must set the firstNullifierHint to Fr.ZERO so the txRequestHash is always used as nonce generator
      result = new PrivateExecutionResult(executionResult, Fr.ZERO, publicFunctionsCalldata);
    } catch (err) {
      throw createSimulationError(err instanceof Error ? err : new Error('Unknown error during private execution'));
    }

    // According to the protocol rules, the nonce generator for the note hashes
    // can either be the first nullifier in the tx or the hash of the initial tx request
    // if there are none.
    const nonceGenerator = result.firstNullifier.equals(Fr.ZERO) ? txRequestHash : result.firstNullifier;
    const { publicInputs } = await generateSimulatedProvingResult(result, nonceGenerator, this.contractDataProvider);

    const globals = makeGlobalVariables();
    globals.blockNumber = blockNumber;
    globals.timestamp = this.nextBlockTimestamp;
    globals.chainId = this.chainId;
    globals.version = this.version;
    globals.gasFees = GasFees.empty();

    const forkedWorldTrees = await this.stateMachine.synchronizer.nativeWorldStateService.fork();

    const contractsDB = new PublicContractsDB(new TXEPublicContractDataSource(blockNumber, this.contractDataProvider));
    const guardedMerkleTrees = new GuardedMerkleTreeOperations(forkedWorldTrees);
    const processor = new PublicProcessor(
      globals,
      guardedMerkleTrees,
      contractsDB,
      new PublicTxSimulator(guardedMerkleTrees, contractsDB, globals, {
        doMerkleOperations: true,
        skipFeeEnforcement: true,
      }),
      new TestDateProvider(),
    );

    const tx = await Tx.create({
      data: publicInputs,
      clientIvcProof: ClientIvcProof.empty(),
      contractClassLogFields: [],
      publicFunctionCalldata: result.publicFunctionCalldata,
    });

    let checkpoint;
    if (isStaticCall) {
      checkpoint = await ForkCheckpoint.new(forkedWorldTrees);
    }

    const results = await processor.process([tx]);

    const [processedTx] = results[0];
    const failedTxs = results[1];

    if (failedTxs.length !== 0) {
      throw new Error(`Public execution has failed: ${failedTxs[0].error}`);
    } else if (!processedTx.revertCode.isOK()) {
      if (processedTx.revertReason) {
        try {
          await enrichPublicSimulationError(processedTx.revertReason, this.contractDataProvider, this.logger);
          // eslint-disable-next-line no-empty
        } catch {}
        throw new Error(`Contract execution has reverted: ${processedTx.revertReason.getMessage()}`);
      } else {
        throw new Error('Contract execution has reverted');
      }
    }

    if (isStaticCall) {
      await checkpoint!.revert();

      await forkedWorldTrees.close();
      return executionResult.returnValues ?? [];
    }

    const txEffect = TxEffect.empty();

    txEffect.noteHashes = processedTx!.txEffect.noteHashes;
    txEffect.nullifiers = processedTx!.txEffect.nullifiers;
    txEffect.privateLogs = processedTx!.txEffect.privateLogs;
    txEffect.publicLogs = processedTx!.txEffect.publicLogs;
    txEffect.publicDataWrites = processedTx!.txEffect.publicDataWrites;

    txEffect.txHash = new TxHash(new Fr(blockNumber));

    const l1ToL2Messages = Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(0).map(Fr.zero);
    await forkedWorldTrees.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, l1ToL2Messages);

    const body = new Body([txEffect]);

    const l2Block = new L2Block(
      makeAppendOnlyTreeSnapshot(),
      await makeTXEBlockHeader(forkedWorldTrees, globals),
      body,
    );

    await this.stateMachine.handleL2Block(l2Block);

    await forkedWorldTrees.close();

    return executionResult.returnValues ?? [];
  }

  async txePublicCallNewFlow(
    from: AztecAddress,
    targetContractAddress: AztecAddress,
    calldata: Fr[],
    isStaticCall: boolean,
  ) {
    this.logger.verbose(
      `Executing public function ${await this.contractDataProvider.getDebugFunctionName(targetContractAddress, FunctionSelector.fromField(calldata[0]))}@${targetContractAddress} isStaticCall=${isStaticCall}`,
    );

    const blockNumber = await this.txeGetNextBlockNumber();

    const gasLimits = new Gas(DEFAULT_DA_GAS_LIMIT, DEFAULT_L2_GAS_LIMIT);

    const teardownGasLimits = new Gas(DEFAULT_TEARDOWN_DA_GAS_LIMIT, DEFAULT_TEARDOWN_L2_GAS_LIMIT);

    const gasSettings = new GasSettings(gasLimits, teardownGasLimits, GasFees.empty(), GasFees.empty());

    const txContext = new TxContext(this.chainId, this.version, gasSettings);

    const anchorBlockHeader = await this.pxeOracleInterface.getAnchorBlockHeader();

    const calldataHash = await computeCalldataHash(calldata);
    const calldataHashedValues = new HashedValues(calldata, calldataHash);

    const globals = makeGlobalVariables();
    globals.blockNumber = blockNumber;
    globals.timestamp = this.nextBlockTimestamp;
    globals.chainId = this.chainId;
    globals.version = this.version;
    globals.gasFees = GasFees.empty();

    const forkedWorldTrees = await this.stateMachine.synchronizer.nativeWorldStateService.fork();

    const contractsDB = new PublicContractsDB(new TXEPublicContractDataSource(blockNumber, this.contractDataProvider));
    const guardedMerkleTrees = new GuardedMerkleTreeOperations(forkedWorldTrees);
    const simulator = new PublicTxSimulator(guardedMerkleTrees, contractsDB, globals, {
      doMerkleOperations: true,
      skipFeeEnforcement: true,
    });
    const processor = new PublicProcessor(globals, guardedMerkleTrees, contractsDB, simulator, new TestDateProvider());

    // We're simulating a scenario in which private execution immediately enqueues a public call and halts. The private
    // kernel init would in this case inject a nullifier with the transaction request hash as a non-revertible
    // side-effect, which the AVM then expects to exist in order to use it as the nonce generator when siloing notes as
    // unique.
    const nonRevertibleAccumulatedData = PrivateToPublicAccumulatedData.empty();
    if (!isStaticCall) {
      nonRevertibleAccumulatedData.nullifiers[0] = getSingleTxBlockRequestHash(blockNumber);
    }

    // The enqueued public call itself we make be revertible so that the public execution is itself revertible, as tests
    // may require producing reverts.
    const revertibleAccumulatedData = PrivateToPublicAccumulatedData.empty();
    revertibleAccumulatedData.publicCallRequests[0] = new PublicCallRequest(
      from,
      targetContractAddress,
      isStaticCall,
      calldataHash,
    );

    const inputsForPublic = new PartialPrivateTailPublicInputsForPublic(
      nonRevertibleAccumulatedData,
      revertibleAccumulatedData,
      PublicCallRequest.empty(),
    );

    const constantData = new TxConstantData(anchorBlockHeader, txContext, Fr.zero(), Fr.zero());

    const txData = new PrivateKernelTailCircuitPublicInputs(
      constantData,
      /*gasUsed=*/ new Gas(0, 0),
      /*feePayer=*/ AztecAddress.zero(),
      /*includeByTimestamp=*/ 0n,
      inputsForPublic,
      undefined,
    );

    const tx = await Tx.create({
      data: txData,
      clientIvcProof: ClientIvcProof.empty(),
      contractClassLogFields: [],
      publicFunctionCalldata: [calldataHashedValues],
    });

    let checkpoint;
    if (isStaticCall) {
      checkpoint = await ForkCheckpoint.new(forkedWorldTrees);
    }

    const results = await processor.process([tx]);

    const [processedTx] = results[0];
    const failedTxs = results[1];

    if (failedTxs.length !== 0) {
      throw new Error(`Public execution has failed: ${failedTxs[0].error}`);
    } else if (!processedTx.revertCode.isOK()) {
      if (processedTx.revertReason) {
        try {
          await enrichPublicSimulationError(processedTx.revertReason, this.contractDataProvider, this.logger);
          // eslint-disable-next-line no-empty
        } catch {}
        throw new Error(`Contract execution has reverted: ${processedTx.revertReason.getMessage()}`);
      } else {
        throw new Error('Contract execution has reverted');
      }
    }

    const returnValues = results[3][0].values;

    if (isStaticCall) {
      await checkpoint!.revert();

      await forkedWorldTrees.close();

      return returnValues ?? [];
    }

    const txEffect = TxEffect.empty();

    txEffect.noteHashes = processedTx!.txEffect.noteHashes;
    txEffect.nullifiers = processedTx!.txEffect.nullifiers;
    txEffect.privateLogs = processedTx!.txEffect.privateLogs;
    txEffect.publicLogs = processedTx!.txEffect.publicLogs;
    txEffect.publicDataWrites = processedTx!.txEffect.publicDataWrites;

    txEffect.txHash = new TxHash(new Fr(blockNumber));

    const l1ToL2Messages = Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(0).map(Fr.zero);
    await forkedWorldTrees.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, l1ToL2Messages);

    const body = new Body([txEffect]);

    const l2Block = new L2Block(
      makeAppendOnlyTreeSnapshot(),
      await makeTXEBlockHeader(forkedWorldTrees, globals),
      body,
    );

    await this.stateMachine.handleL2Block(l2Block);

    await forkedWorldTrees.close();

    return returnValues ?? [];
  }

  async txeSimulateUtilityFunction(
    targetContractAddress: AztecAddress,
    functionSelector: FunctionSelector,
    args: Fr[],
  ) {
    const artifact = await this.contractDataProvider.getFunctionArtifact(targetContractAddress, functionSelector);
    if (!artifact) {
      throw new Error(`Cannot call ${functionSelector} as there is no artifact found at ${targetContractAddress}.`);
    }

    const call = {
      name: artifact.name,
      selector: functionSelector,
      to: targetContractAddress,
    };

    const entryPointArtifact = await this.pxeOracleInterface.getFunctionArtifact(call.to, call.selector);
    if (entryPointArtifact.functionType !== FunctionType.UTILITY) {
      throw new Error(`Cannot run ${entryPointArtifact.functionType} function as utility`);
    }

    this.logger.verbose(`Executing utility function ${entryPointArtifact.name}`, {
      contract: call.to,
      selector: call.selector,
    });

    try {
      const oracle = new UtilityExecutionOracle(call.to, [], [], this.pxeOracleInterface);
      const acirExecutionResult = await new WASMSimulator()
        .executeUserCircuit(toACVMWitness(0, args), entryPointArtifact, new Oracle(oracle).toACIRCallback())
        .catch((err: Error) => {
          err.message = resolveAssertionMessageFromError(err, entryPointArtifact);
          throw new ExecutionError(
            err.message,
            {
              contractAddress: call.to,
              functionSelector: call.selector,
            },
            extractCallStack(err, entryPointArtifact.debug),
            { cause: err },
          );
        });

      this.logger.verbose(`Utility simulation for ${call.to}.${call.selector} completed`);
      return witnessMapToFields(acirExecutionResult.returnWitness);
    } catch (err) {
      throw createSimulationError(err instanceof Error ? err : new Error('Unknown error during utility simulation'));
    }
  }

  close(): [bigint, Map<string, AuthWitness>] {
    this.logger.debug('Exiting Top Level Context');
    return [this.nextBlockTimestamp, this.authwits];
  }

  private async getLastBlockNumber(): Promise<number> {
    return (await this.stateMachine.node.getBlockHeader('latest'))?.globalVariables.blockNumber ?? 0;
  }
}
