import { CircuitKind } from '@aztec/bb.js';
import { MAX_APPS_PER_KERNEL } from '@aztec/constants';
import { uniqueBy } from '@aztec/foundation/collection';
import { vkAsFields } from '@aztec/foundation/crypto/keys';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { pushTestData } from '@aztec/foundation/testing';
import { Timer } from '@aztec/foundation/timer';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { ProtocolContractsList } from '@aztec/protocol-contracts';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { PrivateKernelProver } from '@aztec/stdlib/interfaces/client';
import {
  HidingKernelToPublicPrivateInputs,
  HidingKernelToRollupPrivateInputs,
  PaddedSideEffectAmounts,
  PrivateCallData,
  type PrivateExecutionStep,
  PrivateKernelCircuitPublicInputs,
  PrivateKernelData,
  type PrivateKernelExecutionProofOutput,
  PrivateKernelInit2CircuitPrivateInputs,
  PrivateKernelInit3CircuitPrivateInputs,
  PrivateKernelInit4CircuitPrivateInputs,
  PrivateKernelInit5CircuitPrivateInputs,
  PrivateKernelInitCircuitPrivateInputs,
  PrivateKernelInner2CircuitPrivateInputs,
  PrivateKernelInner3CircuitPrivateInputs,
  PrivateKernelInner4CircuitPrivateInputs,
  PrivateKernelInner5CircuitPrivateInputs,
  PrivateKernelInnerCircuitPrivateInputs,
  PrivateKernelResetTailCircuitPrivateInputs,
  type PrivateKernelSimulateOutput,
  type PrivateKernelTailCircuitPublicInputs,
  PrivateVerificationKeyHints,
  type UpdatedClassIdHints,
} from '@aztec/stdlib/kernel';
import { ChonkProof, ChonkProofWithPublicInputs } from '@aztec/stdlib/proofs';
import {
  type PrivateCallExecutionResult,
  type PrivateExecutionResult,
  TxRequest,
  collectNested,
  collectNoteHashNullifierCounterMap,
  getFinalMinRevertibleSideEffectCounter,
} from '@aztec/stdlib/tx';
import { VerificationKeyAsFields, VerificationKeyData, VkData } from '@aztec/stdlib/vks';

import { BatchPlanner } from './batch_planner.js';
import { computeTxExpirationTimestamp } from './hints/compute_tx_expiration_timestamp.js';
import { PrivateKernelResetPrivateInputsBuilder } from './hints/private_kernel_reset_private_inputs_builder.js';
import type { PrivateKernelOracle } from './private_kernel_oracle.js';

const NULL_SIMULATE_OUTPUT: PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs> = {
  publicInputs: PrivateKernelCircuitPublicInputs.empty(),
  verificationKey: VerificationKeyData.empty(),
  outputWitness: new Map(),
  bytecode: Buffer.from([]),
};

export interface PrivateKernelExecutionProverConfig {
  simulate: boolean;
  skipFeeEnforcement: boolean;
  profileMode: 'gates' | 'execution-steps' | 'full' | 'none';
}

/**
 * The PrivateKernelExecutionProver class is responsible for taking a transaction request and sequencing the
 * the execution of the private functions within, sequenced with private kernel "glue" to check protocol rules.
 * The result can be a chonk proof of the private transaction portion, or just a simulation that can e.g.
 * inform state tree updates.
 */
export class PrivateKernelExecutionProver {
  private log: Logger;

  constructor(
    private oracle: PrivateKernelOracle,
    private proofCreator: PrivateKernelProver,
    private fakeProofs = false,
    bindings?: LoggerBindings,
    private maxBatchSize: number = MAX_APPS_PER_KERNEL,
  ) {
    this.log = createLogger('pxe:private-kernel-execution-prover', bindings);
  }

  /**
   * Generate a proof for a given transaction request and execution result.
   * The function iterates through the nested executions in the execution result, creates private call data,
   * and generates a proof using the provided ProofCreator instance. It also maintains an index of new notes
   * created during the execution and returns them as a part of the KernelProverOutput.
   *
   * @param txRequest - The authenticated transaction request object.
   * @param executionResult - The execution result object containing nested executions and preimages.
   * @param profile - Set true to profile the gate count for each circuit
   * @returns A Promise that resolves to a KernelProverOutput object containing proof, public inputs, and output notes.
   */
  async proveWithKernels(
    txRequest: TxRequest,
    executionResult: PrivateExecutionResult,
    { simulate, skipFeeEnforcement, profileMode }: PrivateKernelExecutionProverConfig = {
      simulate: false,
      skipFeeEnforcement: false,
      profileMode: 'none',
    },
  ): Promise<PrivateKernelExecutionProofOutput<PrivateKernelTailCircuitPublicInputs>> {
    const skipProofGeneration = this.fakeProofs || simulate;
    const generateWitnesses = !skipProofGeneration || profileMode !== 'none';

    const timer = new Timer();

    const isPrivateOnlyTx = executionResult.publicFunctionCalldata.length === 0;

    // Initialize an executionStack, beginning with the PrivateCallExecutionResult
    // of the entrypoint function of the tx.
    const executionStack = [executionResult.entrypoint];
    let firstIteration = true;

    let output = NULL_SIMULATE_OUTPUT;

    const executionSteps: PrivateExecutionStep[] = [];

    const noteHashNullifierCounterMap = collectNoteHashNullifierCounterMap(executionResult);
    const minRevertibleSideEffectCounter = getFinalMinRevertibleSideEffectCounter(executionResult);
    const splitCounter = isPrivateOnlyTx ? 0 : minRevertibleSideEffectCounter;

    // Each kernel iteration absorbs up to `maxBatchSize` apps. The planner walks the upcoming
    // apps and decides where the next reset must fall by using an accumulator and
    // reusing the existing single-app `needsReset()` check.
    const planner = new BatchPlanner(noteHashNullifierCounterMap, splitCounter, this.maxBatchSize);

    const updatedClassIdHintsMap = await this.prefetchUpdatedClassIdHints(executionResult);

    while (executionStack.length) {
      if (!firstIteration) {
        let resetBuilder = new PrivateKernelResetPrivateInputsBuilder(
          output,
          executionStack,
          noteHashNullifierCounterMap,
          splitCounter,
        );
        while (resetBuilder.needsReset()) {
          // Inner reset: without siloing.
          const witgenTimer = new Timer();
          const privateInputs = await resetBuilder.build(this.oracle);
          output = generateWitnesses
            ? await this.proofCreator.generateResetOutput(privateInputs)
            : await this.proofCreator.simulateReset(privateInputs);
          executionSteps.push({
            functionName: 'private_kernel_reset',
            bytecode: output.bytecode,
            witness: output.outputWitness,
            vk: output.verificationKey.keyAsBytes,
            kind: CircuitKind.Kernel,
            timings: {
              witgen: witgenTimer.ms(),
            },
          });
          resetBuilder = new PrivateKernelResetPrivateInputsBuilder(
            output,
            executionStack,
            noteHashNullifierCounterMap,
            splitCounter,
          );
        }
      }

      const batchSize = planner.decideBatchSize(output.publicInputs, executionStack);
      const apps: PrivateCallData[] = [];
      for (let i = 0; i < batchSize; i++) {
        apps.push(await this.consumeNextApp(executionStack, executionSteps, updatedClassIdHintsMap));
      }

      output = await this.runBatchedKernel({
        apps,
        firstIteration,
        previousOutput: output,
        txRequest,
        isPrivateOnlyTx,
        minRevertibleSideEffectCounter,
        executionSteps,
        generateWitnesses,
      });

      firstIteration = false;
    }

    // Terminal reset+tail. The final reset must be performed exactly once because each tx has at
    // least one nullifier that requires siloing, and siloing cannot be done multiple times.
    const finalResetBuilder = new PrivateKernelResetPrivateInputsBuilder(
      output,
      [],
      noteHashNullifierCounterMap,
      splitCounter,
    );
    if (!finalResetBuilder.needsReset()) {
      // Siloing for note hashes, nullifiers, and private logs is dimensioned as one terminal reset.
      // Refer to the possible combinations of dimensions in private_kernel_reset_config.json.
      throw new Error('Nothing to reset for the final reset.');
    }

    if (output.publicInputs.feePayer.isZero() && skipFeeEnforcement) {
      if (!skipProofGeneration) {
        throw new Error('Fee payment must be enforced when creating real proof.');
      }
      output.publicInputs.feePayer = new AztecAddress(Fr.MAX_FIELD_VALUE);
    }

    // TODO: Enable padding once we better understand the final amounts to pad to.
    const paddedSideEffectAmounts = PaddedSideEffectAmounts.empty();

    // Round the aggregated expirationTimestamp down to reduce precision and avoid leaking which private
    // functions were called via their exact expiration offsets.
    const expirationTimestampUpperBound = computeTxExpirationTimestamp(output.publicInputs);

    const resetInputs = await finalResetBuilder.build(this.oracle);
    const mergedInputs = new PrivateKernelResetTailCircuitPrivateInputs(
      resetInputs.previousKernel,
      resetInputs.paddedSideEffects,
      resetInputs.hints,
      resetInputs.dimensions,
      paddedSideEffectAmounts,
      expirationTimestampUpperBound,
    );

    this.log.debug(
      `Calling terminal private kernel reset+tail (${mergedInputs.isForPublic() ? 'to-public' : 'to-rollup'}) with hwm ${output.publicInputs.minRevertibleSideEffectCounter}`,
    );

    const witgenTimer = new Timer();
    const tailOutput = generateWitnesses
      ? await this.proofCreator.generateResetTailOutput(mergedInputs)
      : await this.proofCreator.simulateResetTail(mergedInputs);

    executionSteps.push({
      functionName: mergedInputs.isForPublic() ? 'private_kernel_reset_tail_to_public' : 'private_kernel_reset_tail',
      bytecode: tailOutput.bytecode,
      witness: tailOutput.outputWitness,
      vk: tailOutput.verificationKey.keyAsBytes,
      kind: CircuitKind.Kernel,
      timings: {
        witgen: witgenTimer.ms(),
      },
    });

    // Hiding kernel is only executed if we are generating witnesses.
    // For simulation, we can end with the tail, since the Hiding kernel will simply return the same tail output.
    if (generateWitnesses) {
      const previousKernelVkData = await this.getVkData(tailOutput.verificationKey);

      const witgenTimer = new Timer();
      let hidingOutput: PrivateKernelSimulateOutput<PrivateKernelTailCircuitPublicInputs>;
      if (tailOutput.publicInputs.forPublic) {
        const privateInputs = new HidingKernelToPublicPrivateInputs(
          tailOutput.publicInputs.toPrivateToPublicKernelCircuitPublicInputs(),
          previousKernelVkData,
        );
        hidingOutput = await this.proofCreator.generateHidingToPublicOutput(privateInputs);
      } else {
        const privateInputs = new HidingKernelToRollupPrivateInputs(
          tailOutput.publicInputs.toPrivateToRollupKernelCircuitPublicInputs(),
          previousKernelVkData,
        );
        hidingOutput = await this.proofCreator.generateHidingToRollupOutput(privateInputs);
      }

      executionSteps.push({
        functionName: 'hiding_kernel',
        bytecode: hidingOutput.bytecode,
        witness: hidingOutput.outputWitness,
        vk: hidingOutput.verificationKey.keyAsBytes,
        kind: CircuitKind.HidingKernel,
        timings: {
          witgen: witgenTimer.ms(),
        },
      });
    }

    if (profileMode == 'gates' || profileMode == 'full') {
      for (const entry of executionSteps) {
        const gateCountTimer = new Timer();
        const gateCount = await this.proofCreator.computeGateCountForCircuit(
          entry.bytecode,
          entry.functionName,
          entry.kind,
        );
        entry.gateCount = gateCount;
        entry.timings.gateCount = gateCountTimer.ms();
      }
    }
    if (profileMode === 'gates') {
      for (const entry of executionSteps) {
        // These buffers are often a few megabytes in size - prevent accidentally serializing them if not requested.
        entry.bytecode = Buffer.from([]);
        entry.witness = new Map();
      }
    }

    if (generateWitnesses) {
      this.log.info(`Private kernel witness generation took ${timer.ms()}ms`);
    }

    let chonkProof: ChonkProof;
    // TODO(#7368) how do we 'bincode' encode these inputs?
    let provingTime;
    if (!skipProofGeneration) {
      const provingTimer = new Timer();
      const proofWithPublicInputs = await this.proofCreator.createChonkProof(executionSteps);
      provingTime = provingTimer.ms();
      this.ensurePublicInputsMatch(proofWithPublicInputs, tailOutput.publicInputs);
      chonkProof = proofWithPublicInputs.removePublicInputs();
    } else {
      chonkProof = ChonkProof.random();
    }

    return {
      publicInputs: tailOutput.publicInputs,
      executionSteps,
      chonkProof,
      timings: provingTime ? { proving: provingTime } : undefined,
    };
  }

  /**
   * Checks that the public inputs of the chonk proof match the public inputs of the tail circuit.
   * This can only mismatch if there is a circuit / noir / bb bug.
   * @param chonkProof - The chonk proof with public inputs.
   * @param tailPublicInputs - The public inputs resulting from witness generation of the tail circuit.
   */
  private ensurePublicInputsMatch(
    chonkProof: ChonkProofWithPublicInputs,
    tailPublicInputs: PrivateKernelTailCircuitPublicInputs,
  ) {
    const serializedChonkProofPublicInputs = chonkProof.getPublicInputs();
    const serializedTailPublicInputs = tailPublicInputs.publicInputs().toFields();
    if (serializedChonkProofPublicInputs.length !== serializedTailPublicInputs.length) {
      throw new Error(
        `Public inputs length mismatch: ${serializedChonkProofPublicInputs.length} !== ${serializedTailPublicInputs.length}`,
      );
    }
    if (
      !serializedChonkProofPublicInputs.every((input: Fr, index: number) =>
        input.equals(serializedTailPublicInputs[index]),
      )
    ) {
      throw new Error(`Public inputs mismatch between kernel and chonk proof`);
    }
  }

  private async getVkData(verificationKey: VerificationKeyData) {
    const previousVkMembershipWitness = await this.oracle.getVkMembershipWitness(verificationKey.keyAsFields);
    return new VkData(
      verificationKey,
      Number(previousVkMembershipWitness.leafIndex),
      previousVkMembershipWitness.siblingPath,
    );
  }

  /**
   * Pops the next app off the execution stack, pushes its nested calls back on (preserving DFS
   * order), records the app's execution step, and returns its constructed `PrivateCallData`.
   * Caller is responsible for ensuring the stack is non-empty.
   */
  private async consumeNextApp(
    executionStack: PrivateCallExecutionResult[],
    executionSteps: PrivateExecutionStep[],
    updatedClassIdHintsMap: Map<string, UpdatedClassIdHints>,
  ): Promise<PrivateCallData> {
    const next = executionStack.pop()!;
    executionStack.push(...[...next.nestedExecutionResults].reverse());

    const functionName = await this.oracle.getDebugFunctionName(
      next.publicInputs.callContext.contractAddress,
      next.publicInputs.callContext.functionSelector,
    );

    executionSteps.push({
      functionName: functionName!,
      bytecode: next.acir,
      witness: next.partialWitness,
      vk: next.vk,
      kind: CircuitKind.App,
      timings: {
        witgen: next.profileResult?.timings.witgen ?? 0,
        oracles: next.profileResult?.timings.oracles,
      },
    });

    return await this.createPrivateCallData(next, updatedClassIdHintsMap);
  }

  /** Prefetches updated class id hints for all unique contracts in the execution tree in parallel. */
  private async prefetchUpdatedClassIdHints(
    executionResult: PrivateExecutionResult,
  ): Promise<Map<string, UpdatedClassIdHints>> {
    const allAddresses = collectNested([executionResult.entrypoint], exec => [
      exec.publicInputs.callContext.contractAddress,
    ]);
    const uniqueAddresses = uniqueBy(allAddresses, a => a.toString());
    return new Map<string, UpdatedClassIdHints>(
      await Promise.all(
        uniqueAddresses.map(
          async addr =>
            [addr.toString(), await this.oracle.getUpdatedClassIdHints(addr)] as [string, UpdatedClassIdHints],
        ),
      ),
    );
  }

  private async createPrivateCallData(
    { publicInputs, vk: vkAsBuffer }: PrivateCallExecutionResult,
    updatedClassIdHintsMap: Map<string, UpdatedClassIdHints>,
  ) {
    const { contractAddress, functionSelector } = publicInputs.callContext;

    const vkFields = await vkAsFields(vkAsBuffer, CircuitKind.App);
    const vk = await VerificationKeyAsFields.fromKey(vkFields);

    const { currentContractClassId, publicKeys, saltedInitializationHash } =
      await this.oracle.getContractAddressPreimage(contractAddress);
    const functionLeafMembershipWitness = await this.oracle.getFunctionMembershipWitness(
      currentContractClassId,
      functionSelector,
    );

    const { artifactHash: contractClassArtifactHash, publicBytecodeCommitment: contractClassPublicBytecodeCommitment } =
      await this.oracle.getContractClassIdPreimage(currentContractClassId);

    const updatedClassIdHints = updatedClassIdHintsMap.get(contractAddress.toString())!;

    return PrivateCallData.from({
      publicInputs,
      vk,
      verificationKeyHints: PrivateVerificationKeyHints.from({
        publicKeys,
        contractClassArtifactHash,
        contractClassPublicBytecodeCommitment,
        saltedInitializationHash,
        functionLeafMembershipWitness,
        updatedClassIdHints,
      }),
    });
  }

  /**
   * Runs one batched kernel iteration. Picks the right circuit variant based on whether this is
   * the first iteration or a later one and the size of the batch.
   */
  private async runBatchedKernel(args: {
    apps: PrivateCallData[];
    firstIteration: boolean;
    previousOutput: PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>;
    txRequest: TxRequest;
    isPrivateOnlyTx: boolean;
    minRevertibleSideEffectCounter: number;
    executionSteps: PrivateExecutionStep[];
    generateWitnesses: boolean;
  }): Promise<PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>> {
    const {
      apps,
      firstIteration,
      previousOutput,
      txRequest,
      isPrivateOnlyTx,
      minRevertibleSideEffectCounter,
      executionSteps,
      generateWitnesses,
    } = args;

    const witgenTimer = new Timer();
    let output: PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs>;
    let functionName: string;

    if (firstIteration) {
      const vkTreeRoot = getVKTreeRoot();
      switch (apps.length) {
        case 1: {
          const proofInput = new PrivateKernelInitCircuitPrivateInputs(
            txRequest,
            vkTreeRoot,
            ProtocolContractsList,
            apps[0],
            isPrivateOnlyTx,
            minRevertibleSideEffectCounter,
          );
          this.log.debug(`Calling private kernel init with isPrivateOnly ${isPrivateOnlyTx}`);
          pushTestData('private-kernel-inputs-init', proofInput);
          output = generateWitnesses
            ? await this.proofCreator.generateInitOutput(proofInput)
            : await this.proofCreator.simulateInit(proofInput);
          functionName = 'private_kernel_init';
          break;
        }
        case 2: {
          const proofInput = new PrivateKernelInit2CircuitPrivateInputs(
            txRequest,
            vkTreeRoot,
            ProtocolContractsList,
            apps[0],
            apps[1],
            isPrivateOnlyTx,
            minRevertibleSideEffectCounter,
          );
          this.log.debug(`Calling private kernel init_2 with isPrivateOnly ${isPrivateOnlyTx}`);
          pushTestData('private-kernel-inputs-init-2', proofInput);
          output = generateWitnesses
            ? await this.proofCreator.generateInit2Output(proofInput)
            : await this.proofCreator.simulateInit2(proofInput);
          functionName = 'private_kernel_init_2';
          break;
        }
        case 3: {
          const proofInput = new PrivateKernelInit3CircuitPrivateInputs(
            txRequest,
            vkTreeRoot,
            ProtocolContractsList,
            apps[0],
            apps[1],
            apps[2],
            isPrivateOnlyTx,
            minRevertibleSideEffectCounter,
          );
          this.log.debug(`Calling private kernel init_3 with isPrivateOnly ${isPrivateOnlyTx}`);
          pushTestData('private-kernel-inputs-init-3', proofInput);
          output = generateWitnesses
            ? await this.proofCreator.generateInit3Output(proofInput)
            : await this.proofCreator.simulateInit3(proofInput);
          functionName = 'private_kernel_init_3';
          break;
        }
        case 4: {
          const proofInput = new PrivateKernelInit4CircuitPrivateInputs(
            txRequest,
            vkTreeRoot,
            ProtocolContractsList,
            apps[0],
            apps[1],
            apps[2],
            apps[3],
            isPrivateOnlyTx,
            minRevertibleSideEffectCounter,
          );
          this.log.debug(`Calling private kernel init_4 with isPrivateOnly ${isPrivateOnlyTx}`);
          pushTestData('private-kernel-inputs-init-4', proofInput);
          output = generateWitnesses
            ? await this.proofCreator.generateInit4Output(proofInput)
            : await this.proofCreator.simulateInit4(proofInput);
          functionName = 'private_kernel_init_4';
          break;
        }
        case 5: {
          const proofInput = new PrivateKernelInit5CircuitPrivateInputs(
            txRequest,
            vkTreeRoot,
            ProtocolContractsList,
            apps[0],
            apps[1],
            apps[2],
            apps[3],
            apps[4],
            isPrivateOnlyTx,
            minRevertibleSideEffectCounter,
          );
          this.log.debug(`Calling private kernel init_5 with isPrivateOnly ${isPrivateOnlyTx}`);
          pushTestData('private-kernel-inputs-init-5', proofInput);
          output = generateWitnesses
            ? await this.proofCreator.generateInit5Output(proofInput)
            : await this.proofCreator.simulateInit5(proofInput);
          functionName = 'private_kernel_init_5';
          break;
        }
        default:
          throw new Error(`Unsupported init kernel batch size: ${apps.length}`);
      }
    } else {
      const vkData = await this.getVkData(previousOutput.verificationKey);
      const previousKernelData = new PrivateKernelData(previousOutput.publicInputs, vkData);
      switch (apps.length) {
        case 1: {
          const proofInput = new PrivateKernelInnerCircuitPrivateInputs(previousKernelData, apps[0]);
          pushTestData('private-kernel-inputs-inner', proofInput);
          output = generateWitnesses
            ? await this.proofCreator.generateInnerOutput(proofInput)
            : await this.proofCreator.simulateInner(proofInput);
          functionName = 'private_kernel_inner';
          break;
        }
        case 2: {
          const proofInput = new PrivateKernelInner2CircuitPrivateInputs(previousKernelData, apps[0], apps[1]);
          pushTestData('private-kernel-inputs-inner-2', proofInput);
          output = generateWitnesses
            ? await this.proofCreator.generateInner2Output(proofInput)
            : await this.proofCreator.simulateInner2(proofInput);
          functionName = 'private_kernel_inner_2';
          break;
        }
        case 3: {
          const proofInput = new PrivateKernelInner3CircuitPrivateInputs(previousKernelData, apps[0], apps[1], apps[2]);
          pushTestData('private-kernel-inputs-inner-3', proofInput);
          output = generateWitnesses
            ? await this.proofCreator.generateInner3Output(proofInput)
            : await this.proofCreator.simulateInner3(proofInput);
          functionName = 'private_kernel_inner_3';
          break;
        }
        case 4: {
          const proofInput = new PrivateKernelInner4CircuitPrivateInputs(
            previousKernelData,
            apps[0],
            apps[1],
            apps[2],
            apps[3],
          );
          pushTestData('private-kernel-inputs-inner-4', proofInput);
          output = generateWitnesses
            ? await this.proofCreator.generateInner4Output(proofInput)
            : await this.proofCreator.simulateInner4(proofInput);
          functionName = 'private_kernel_inner_4';
          break;
        }
        case 5: {
          const proofInput = new PrivateKernelInner5CircuitPrivateInputs(
            previousKernelData,
            apps[0],
            apps[1],
            apps[2],
            apps[3],
            apps[4],
          );
          pushTestData('private-kernel-inputs-inner-5', proofInput);
          output = generateWitnesses
            ? await this.proofCreator.generateInner5Output(proofInput)
            : await this.proofCreator.simulateInner5(proofInput);
          functionName = 'private_kernel_inner_5';
          break;
        }
        default:
          throw new Error(`Unsupported inner kernel batch size: ${apps.length}`);
      }
    }

    executionSteps.push({
      functionName,
      bytecode: output.bytecode,
      witness: output.outputWitness,
      vk: output.verificationKey.keyAsBytes,
      kind: CircuitKind.Kernel,
      timings: {
        witgen: witgenTimer.ms(),
      },
    });

    return output;
  }
}
