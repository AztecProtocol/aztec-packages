import type { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { computeFeePayerBalanceStorageSlot } from '@aztec/protocol-contracts/fee-juice';
import {
  AvmCircuitInputs,
  AvmCircuitPublicInputs,
  AvmExecutionHints,
  type AvmProvingRequest,
  AvmTxHint,
  type RevertCode,
} from '@aztec/stdlib/avm';
import { SimulationError } from '@aztec/stdlib/errors';
import type { Gas, GasUsed } from '@aztec/stdlib/gas';
import { ProvingRequestType } from '@aztec/stdlib/proofs';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/trees';
import {
  type GlobalVariables,
  NestedProcessReturnValues,
  PublicCallRequestWithCalldata,
  Tx,
  TxExecutionPhase,
} from '@aztec/stdlib/tx';

import type { AvmFinalizedCallResult } from '../avm/avm_contract_call_result.js';
import { AvmSimulator } from '../avm/index.js';
import { getPublicFunctionDebugName } from '../debug_fn_name.js';
import { HintingMerkleWriteOperations, HintingPublicContractsDB } from '../hinting_db_sources.js';
import { type PublicContractsDB, PublicTreesDB } from '../public_db_sources.js';
import type { PublicPersistableStateManager } from '../state_manager/state_manager.js';
import { PublicTxContext } from './public_tx_context.js';

export type ProcessedPhase = {
  phase: TxExecutionPhase;
  durationMs?: number;
  returnValues: NestedProcessReturnValues[];
  reverted: boolean;
  revertReason?: SimulationError;
};

export type PublicTxResult = {
  avmProvingRequest: AvmProvingRequest;
  /** Gas used during the execution of this tx */
  gasUsed: GasUsed;
  revertCode: RevertCode;
  /** Revert reason, if any */
  revertReason?: SimulationError;
  processedPhases: ProcessedPhase[];
};

export class PublicTxSimulator {
  protected log: Logger;

  constructor(
    private merkleTree: MerkleTreeWriteOperations,
    private contractsDB: PublicContractsDB,
    private globalVariables: GlobalVariables,
    private doMerkleOperations: boolean = false,
    private skipFeeEnforcement: boolean = false,
    private clientInitiatedSimulation: boolean = false,
  ) {
    this.log = createLogger(`simulator:public_tx_simulator`);
  }

  /**
   * Simulate a transaction's public portion including all of its phases.
   * @param tx - The transaction to simulate.
   * @returns The result of the transaction's public execution.
   */
  public async simulate(tx: Tx): Promise<PublicTxResult> {
    try {
      const txHash = this.computeTxHash(tx);
      this.log.debug(`Simulating ${tx.publicFunctionCalldata.length} public calls for tx ${txHash}`, { txHash });

      // Create hinting DBs.
      const hints = new AvmExecutionHints(this.globalVariables, AvmTxHint.fromTx(tx));
      const hintingMerkleTree = await HintingMerkleWriteOperations.create(this.merkleTree, hints);
      const hintingTreesDB = new PublicTreesDB(hintingMerkleTree);
      const hintingContractsDB = new HintingPublicContractsDB(this.contractsDB, hints);

      const context = await PublicTxContext.create(
        hintingTreesDB,
        hintingContractsDB,
        tx,
        this.globalVariables,
        this.doMerkleOperations,
      );

      // This will throw if there is a nullifier collision.
      // In that case the transaction will be thrown out.
      await this.insertNonRevertiblesFromPrivate(context, tx);

      const processedPhases: ProcessedPhase[] = [];
      if (context.hasPhase(TxExecutionPhase.SETUP)) {
        // This will throw if the setup phase reverts.
        // In that case the transaction will be thrown out.
        const setupResult = await this.simulatePhase(TxExecutionPhase.SETUP, context);
        if (setupResult.reverted) {
          throw new Error(
            `Setup phase reverted! The transaction will be thrown out. ${setupResult.revertReason?.message}`,
          );
        }
        processedPhases.push(setupResult);
      }

      // The checkpoint we should go back to if anything from now on reverts.
      await context.state.fork();

      try {
        // This will throw if there is a nullifier collision.
        await this.insertRevertiblesFromPrivate(context, tx);
        // Only proceed with app logic if there was no revert during revertible insertion.
        if (context.hasPhase(TxExecutionPhase.APP_LOGIC)) {
          const appLogicResult = await this.simulatePhase(TxExecutionPhase.APP_LOGIC, context);
          processedPhases.push(appLogicResult);
          if (appLogicResult.reverted) {
            throw new Error(`App logic phase reverted! ${appLogicResult.revertReason?.message}`);
          }
        }
      } catch (e) {
        this.log.debug(String(e));
        // We revert to the post-setup state.
        await context.state.discardForkedState();
        // But we also create a new fork so that the teardown phase can transparently
        // commit or rollback at the end of teardown.
        await context.state.fork();
      }

      try {
        if (context.hasPhase(TxExecutionPhase.TEARDOWN)) {
          const teardownResult = await this.simulatePhase(TxExecutionPhase.TEARDOWN, context);
          processedPhases.push(teardownResult);
          if (teardownResult.reverted) {
            throw new Error(`Teardown phase reverted! ${teardownResult.revertReason?.message}`);
          }
        }

        // We commit the forked state and we are done.
        await context.state.mergeForkedState();
      } catch (e) {
        this.log.debug(String(e));
        // We rollback to the post-setup state.
        await context.state.discardForkedState();
      }

      context.halt();
      await this.payFee(context);

      const publicInputs = await context.generateAvmCircuitPublicInputs();
      const avmProvingRequest = PublicTxSimulator.generateProvingRequest(publicInputs, hints);

      const revertCode = context.getFinalRevertCode();

      // Commit contracts from this TX to the block-level cache and clear tx cache
      // If the tx reverted, only commit non-revertible contracts
      // NOTE: You can't create contracts in public, so this is only relevant for private-created contracts
      // FIXME(fcarreiro): this should conceptually use the hinted contracts db.
      // However things should work as they are now because the hinted db would still pick up the new contracts.
      this.contractsDB.commitContractsForTx(/*onlyNonRevertibles=*/ !revertCode.isOK());

      return {
        avmProvingRequest,
        gasUsed: {
          totalGas: context.getActualGasUsed(),
          teardownGas: context.teardownGasUsed,
          publicGas: context.getActualPublicGasUsed(),
          billedGas: context.getTotalGasUsed(),
        },
        revertCode,
        revertReason: context.revertReason,
        processedPhases: processedPhases,
      };
    } finally {
      // Make sure there are no new contracts in the tx-level cache.
      // They should either be committed to block-level cache or cleared.
      // FIXME(fcarreiro): this should conceptually use the hinted contracts db.
      // However things should work as they are now because the hinted db would still pick up the new contracts.
      this.contractsDB.clearContractsForTx();
    }
  }

  protected computeTxHash(tx: Tx) {
    return tx.getTxHash();
  }

  /**
   * Simulate the setup phase of a transaction's public execution.
   * @param context - WILL BE MUTATED. The context of the currently executing public transaction portion
   * @returns The phase result.
   */
  protected async simulatePhase(phase: TxExecutionPhase, context: PublicTxContext): Promise<ProcessedPhase> {
    const callRequests = context.getCallRequestsForPhase(phase);

    this.log.debug(`Processing phase ${TxExecutionPhase[phase]} for tx ${context.txHash}`, {
      txHash: context.txHash.toString(),
      phase: TxExecutionPhase[phase],
      callRequests: callRequests.length,
    });

    const returnValues: NestedProcessReturnValues[] = [];
    let reverted = false;
    let revertReason: SimulationError | undefined;
    for (let i = 0; i < callRequests.length; i++) {
      if (reverted) {
        break;
      }

      const callRequest = callRequests[i];

      const enqueuedCallResult = await this.simulateEnqueuedCall(phase, context, callRequest);

      returnValues.push(new NestedProcessReturnValues(enqueuedCallResult.output));

      if (enqueuedCallResult.reverted) {
        reverted = true;
        revertReason = enqueuedCallResult.revertReason;
      }
    }

    return {
      phase,
      returnValues,
      reverted,
      revertReason,
    };
  }

  /**
   * Simulate an enqueued public call.
   * @param phase - The current phase of public execution
   * @param context - WILL BE MUTATED. The context of the currently executing public transaction portion
   * @param callRequest - The public function call request, including the calldata.
   * @returns The result of execution.
   */
  protected async simulateEnqueuedCall(
    phase: TxExecutionPhase,
    context: PublicTxContext,
    callRequest: PublicCallRequestWithCalldata,
  ): Promise<AvmFinalizedCallResult> {
    const stateManager = context.state.getActiveStateManager();
    const contractAddress = callRequest.request.contractAddress;
    const fnName = await getPublicFunctionDebugName(this.contractsDB, contractAddress, callRequest.calldata);

    const allocatedGas = context.getGasLeftAtPhase(phase);

    const result = await this.simulateEnqueuedCallInternal(
      stateManager,
      callRequest,
      allocatedGas,
      /*transactionFee=*/ context.getTransactionFee(phase),
      fnName,
    );

    const gasUsed = allocatedGas.sub(result.gasLeft); // by enqueued call
    context.consumeGas(phase, gasUsed);
    this.log.debug(
      `Simulated enqueued public call (${fnName}) consumed ${gasUsed.l2Gas} L2 gas ending with ${result.gasLeft.l2Gas} L2 gas left.`,
    );

    if (result.reverted) {
      const culprit = `${contractAddress}:${callRequest.functionSelector}`;
      context.revert(phase, result.revertReason, culprit);
    }

    return result;
  }

  /**
   * Simulate an enqueued public call, without modifying the context (PublicTxContext).
   * Resulting modifications to the context can be applied by the caller.
   *
   * This function can be mocked for testing to skip actual AVM simulation
   * while still simulating phases and generating a proving request.
   *
   * @param stateManager - The state manager for AvmSimulation
   * @param callRequest - The public function call request, including the calldata.
   * @param allocatedGas - The gas allocated to the enqueued call
   * @param fnName - The name of the function
   * @returns The result of execution.
   */
  protected async simulateEnqueuedCallInternal(
    stateManager: PublicPersistableStateManager,
    { request, calldata }: PublicCallRequestWithCalldata,
    allocatedGas: Gas,
    transactionFee: Fr,
    fnName: string,
  ): Promise<AvmFinalizedCallResult> {
    const address = request.contractAddress;
    const sender = request.msgSender;

    this.log.debug(
      `Executing enqueued public call to external function ${fnName}@${address} with ${allocatedGas.l2Gas} allocated L2 gas.`,
    );

    const simulator = await AvmSimulator.create(
      stateManager,
      address,
      sender,
      transactionFee,
      this.globalVariables,
      request.isStaticCall,
      calldata,
      allocatedGas,
      this.clientInitiatedSimulation,
    );
    const avmCallResult = await simulator.execute();
    return avmCallResult.finalize();
  }

  /**
   * Insert the non-revertible accumulated data from private into the public state.
   */
  protected async insertNonRevertiblesFromPrivate(context: PublicTxContext, tx: Tx) {
    const stateManager = context.state.getActiveStateManager();

    for (const siloedNullifier of context.nonRevertibleAccumulatedDataFromPrivate.nullifiers.filter(
      n => !n.isEmpty(),
    )) {
      await stateManager.writeSiloedNullifier(siloedNullifier);
    }
    for (const noteHash of context.nonRevertibleAccumulatedDataFromPrivate.noteHashes) {
      if (!noteHash.isEmpty()) {
        await stateManager.writeUniqueNoteHash(noteHash);
      }
    }
    for (const l2ToL1Message of context.nonRevertibleAccumulatedDataFromPrivate.l2ToL1Msgs) {
      if (!l2ToL1Message.isEmpty()) {
        stateManager.writeScopedL2ToL1Message(l2ToL1Message);
      }
    }

    // add new contracts to the contracts db so that their functions may be found and called
    // TODO(#6464): Should we allow emitting contracts in the private setup phase?
    // FIXME(fcarreiro): this should conceptually use the hinted contracts db.
    // However things should work as they are now because the hinted db would still pick up the new contracts.
    await this.contractsDB.addNewNonRevertibleContracts(tx);
  }

  /**
   * Insert the revertible accumulated data from private into the public state.
   * Start by forking state so we can rollback to the end of setup if app logic or teardown reverts.
   */
  protected async insertRevertiblesFromPrivate(context: PublicTxContext, tx: Tx): /*success=*/ Promise<boolean> {
    const stateManager = context.state.getActiveStateManager();

    try {
      for (const siloedNullifier of context.revertibleAccumulatedDataFromPrivate.nullifiers.filter(n => !n.isEmpty())) {
        await stateManager.writeSiloedNullifier(siloedNullifier);
      }
    } catch (e) {
      context.revert(
        TxExecutionPhase.APP_LOGIC,
        new SimulationError(
          `Nullifier collision encountered when inserting revertible nullifiers from private.\nDetails: ${String(e)}`,
          [],
        ),
      );
      throw e;
    }
    for (const noteHash of context.revertibleAccumulatedDataFromPrivate.noteHashes) {
      if (!noteHash.isEmpty()) {
        // Revertible note hashes from private are not hashed with nonce, since private can't know their final position, only we can.
        await stateManager.writeSiloedNoteHash(noteHash);
      }
    }
    for (const l2ToL1Message of context.revertibleAccumulatedDataFromPrivate.l2ToL1Msgs) {
      if (!l2ToL1Message.isEmpty()) {
        stateManager.writeScopedL2ToL1Message(l2ToL1Message);
      }
    }
    // add new contracts to the contracts db so that their functions may be found and called
    // FIXME(fcarreiro): this should conceptually use the hinted contracts db.
    // However things should work as they are now because the hinted db would still pick up the new contracts.
    await this.contractsDB.addNewRevertibleContracts(tx);

    return /*success=*/ true;
  }

  private async payFee(context: PublicTxContext) {
    const txFee = context.getTransactionFee(TxExecutionPhase.TEARDOWN);

    if (context.feePayer.isZero()) {
      this.log.debug(`No one is paying the fee of ${txFee.toBigInt()}`);
      return;
    }

    const feeJuiceAddress = ProtocolContractAddress.FeeJuice;
    const balanceSlot = await computeFeePayerBalanceStorageSlot(context.feePayer);

    this.log.debug(`Deducting ${txFee.toBigInt()} balance in Fee Juice for ${context.feePayer}`);
    const stateManager = context.state.getActiveStateManager();

    let currentBalance = await stateManager.readStorage(feeJuiceAddress, balanceSlot);
    // We allow to fake the balance of the fee payer to allow fee estimation
    // When mocking the balance of the fee payer, the circuit should not be able to prove the simulation

    if (currentBalance.lt(txFee)) {
      if (!this.skipFeeEnforcement) {
        throw new Error(
          `Not enough balance for fee payer to pay for transaction (got ${currentBalance.toBigInt()} needs ${txFee.toBigInt()})`,
        );
      } else {
        currentBalance = txFee;
      }
    }

    const updatedBalance = currentBalance.sub(txFee);
    await stateManager.writeStorage(feeJuiceAddress, balanceSlot, updatedBalance, true);
  }

  /**
   * Generate the proving request for the AVM circuit.
   */
  private static generateProvingRequest(
    publicInputs: AvmCircuitPublicInputs,
    hints: AvmExecutionHints,
  ): AvmProvingRequest {
    return {
      type: ProvingRequestType.PUBLIC_VM,
      inputs: new AvmCircuitInputs(hints, publicInputs),
    };
  }
}
