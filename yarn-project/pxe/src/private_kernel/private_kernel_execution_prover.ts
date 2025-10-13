import { vkAsFieldsMegaHonk } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
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
  PrivateKernelInitCircuitPrivateInputs,
  PrivateKernelInnerCircuitPrivateInputs,
  type PrivateKernelSimulateOutput,
  PrivateKernelTailCircuitPrivateInputs,
  type PrivateKernelTailCircuitPublicInputs,
  PrivateVerificationKeyHints,
} from '@aztec/stdlib/kernel';
import { ClientIvcProof } from '@aztec/stdlib/proofs';
import {
  type PrivateCallExecutionResult,
  type PrivateExecutionResult,
  TxRequest,
  collectNoteHashLeafIndexMap,
  collectNoteHashNullifierCounterMap,
  getFinalMinRevertibleSideEffectCounter,
} from '@aztec/stdlib/tx';
import { VerificationKeyAsFields, VerificationKeyData, VkData } from '@aztec/stdlib/vks';

import { PrivateKernelResetPrivateInputsBuilder } from './hints/build_private_kernel_reset_private_inputs.js';
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
 * The result can be a client IVC proof of the private transaction portion, or just a simulation that can e.g.
 * inform state tree updates.
 */
export class PrivateKernelExecutionProver {
  private log = createLogger('pxe:private-kernel-execution-prover');

  constructor(
    private oracle: PrivateKernelOracle,
    private proofCreator: PrivateKernelProver,
    private fakeProofs = false,
  ) {}

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

    const noteHashLeafIndexMap = collectNoteHashLeafIndexMap(executionResult);
    const noteHashNullifierCounterMap = collectNoteHashNullifierCounterMap(executionResult);
    const validationRequestsSplitCounter = isPrivateOnlyTx
      ? 0
      : getFinalMinRevertibleSideEffectCounter(executionResult);

    while (executionStack.length) {
      if (!firstIteration) {
        let resetBuilder = new PrivateKernelResetPrivateInputsBuilder(
          output,
          executionStack,
          noteHashNullifierCounterMap,
          validationRequestsSplitCounter,
        );
        while (resetBuilder.needsReset()) {
          const witgenTimer = new Timer();
          const privateInputs = await resetBuilder.build(this.oracle, noteHashLeafIndexMap);
          output = generateWitnesses
            ? await this.proofCreator.generateResetOutput(privateInputs)
            : await this.proofCreator.simulateReset(privateInputs);
          executionSteps.push({
            functionName: 'private_kernel_reset',
            bytecode: output.bytecode,
            witness: output.outputWitness,
            vk: output.verificationKey.keyAsBytes,
            timings: {
              witgen: witgenTimer.ms(),
            },
          });
          resetBuilder = new PrivateKernelResetPrivateInputsBuilder(
            output,
            executionStack,
            noteHashNullifierCounterMap,
            validationRequestsSplitCounter,
          );
        }
      }

      const currentExecution = executionStack.pop()!;

      executionStack.push(...[...currentExecution.nestedExecutionResults].reverse());

      const functionName = await this.oracle.getDebugFunctionName(
        currentExecution.publicInputs.callContext.contractAddress,
        currentExecution.publicInputs.callContext.functionSelector,
      );

      executionSteps.push({
        functionName: functionName!,
        bytecode: currentExecution.acir,
        witness: currentExecution.partialWitness,
        vk: currentExecution.vk,
        timings: {
          witgen: currentExecution.profileResult?.timings.witgen ?? 0,
          oracles: currentExecution.profileResult?.timings.oracles,
        },
      });

      const privateCallData = await this.createPrivateCallData(currentExecution);

      if (firstIteration) {
        const witgenTimer = new Timer();

        const proofInput = new PrivateKernelInitCircuitPrivateInputs(
          txRequest,
          getVKTreeRoot(),
          ProtocolContractsList,
          privateCallData,
          isPrivateOnlyTx,
          executionResult.firstNullifier,
        );
        this.log.debug(
          `Calling private kernel init with isPrivateOnly ${isPrivateOnlyTx} and firstNullifierHint ${proofInput.firstNullifierHint}`,
        );

        pushTestData('private-kernel-inputs-init', proofInput);

        output = generateWitnesses
          ? await this.proofCreator.generateInitOutput(proofInput)
          : await this.proofCreator.simulateInit(proofInput);

        executionSteps.push({
          functionName: 'private_kernel_init',
          bytecode: output.bytecode,
          witness: output.outputWitness,
          vk: output.verificationKey.keyAsBytes,
          timings: {
            witgen: witgenTimer.ms(),
          },
        });
      } else {
        const witgenTimer = new Timer();
        const vkData = await this.getVkData(output.verificationKey);
        const previousKernelData = new PrivateKernelData(output.publicInputs, vkData);
        const proofInput = new PrivateKernelInnerCircuitPrivateInputs(previousKernelData, privateCallData);

        pushTestData('private-kernel-inputs-inner', proofInput);
        output = generateWitnesses
          ? await this.proofCreator.generateInnerOutput(proofInput)
          : await this.proofCreator.simulateInner(proofInput);

        executionSteps.push({
          functionName: 'private_kernel_inner',
          bytecode: output.bytecode,
          witness: output.outputWitness,
          vk: output.verificationKey.keyAsBytes,
          timings: {
            witgen: witgenTimer.ms(),
          },
        });
      }
      firstIteration = false;
    }

    // Reset.
    let resetBuilder = new PrivateKernelResetPrivateInputsBuilder(
      output,
      [],
      noteHashNullifierCounterMap,
      validationRequestsSplitCounter,
    );
    while (resetBuilder.needsReset()) {
      const witgenTimer = new Timer();
      const privateInputs = await resetBuilder.build(this.oracle, noteHashLeafIndexMap);
      output = generateWitnesses
        ? await this.proofCreator.generateResetOutput(privateInputs)
        : await this.proofCreator.simulateReset(privateInputs);

      executionSteps.push({
        functionName: 'private_kernel_reset',
        bytecode: output.bytecode,
        witness: output.outputWitness,
        vk: output.verificationKey.keyAsBytes,
        timings: {
          witgen: witgenTimer.ms(),
        },
      });

      resetBuilder = new PrivateKernelResetPrivateInputsBuilder(
        output,
        [],
        noteHashNullifierCounterMap,
        validationRequestsSplitCounter,
      );
    }

    if (output.publicInputs.feePayer.isZero() && skipFeeEnforcement) {
      if (!skipProofGeneration) {
        throw new Error('Fee payment must be enforced when creating real proof.');
      }
      output.publicInputs.feePayer = new AztecAddress(Fr.MAX_FIELD_VALUE);
    }
    // Private tail.
    const vkData = await this.getVkData(output.verificationKey);
    const previousKernelData = new PrivateKernelData(output.publicInputs, vkData);

    this.log.debug(
      `Calling private kernel tail with hwm ${previousKernelData.publicInputs.minRevertibleSideEffectCounter}`,
    );

    // TODO: Enable padding once we better understand the final amounts to pad to.
    const paddedSideEffectAmounts = PaddedSideEffectAmounts.empty();

    // Use the aggregated includeByTimestamp set throughout the tx execution.
    // TODO: Call `computeTxIncludeByTimestamp` to round the value down and reduce precision, improving privacy.
    const includeByTimestampUpperBound = previousKernelData.publicInputs.includeByTimestamp;
    const anchorBlockTimestamp = previousKernelData.publicInputs.constants.anchorBlockHeader.globalVariables.timestamp;
    if (includeByTimestampUpperBound <= anchorBlockTimestamp) {
      throw new Error(
        `Include-by timestamp must be greater than the anchor block timestamp. Anchor block timestamp: ${anchorBlockTimestamp}. Include-by timestamp: ${includeByTimestampUpperBound}.`,
      );
    }

    const privateInputs = new PrivateKernelTailCircuitPrivateInputs(
      previousKernelData,
      paddedSideEffectAmounts,
      includeByTimestampUpperBound,
    );

    const witgenTimer = new Timer();
    const tailOutput = generateWitnesses
      ? await this.proofCreator.generateTailOutput(privateInputs)
      : await this.proofCreator.simulateTail(privateInputs);

    executionSteps.push({
      functionName: 'private_kernel_tail',
      bytecode: tailOutput.bytecode,
      witness: tailOutput.outputWitness,
      vk: tailOutput.verificationKey.keyAsBytes,
      timings: {
        witgen: witgenTimer.ms(),
      },
    });

    // Hiding circuit is only executed if we are generating witnesses.
    // For simulation, we can end with the tail, since the hiding circuit will simply return the same tail output.
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
        timings: {
          witgen: witgenTimer.ms(),
        },
      });
    }

    if (profileMode == 'gates' || profileMode == 'full') {
      for (const entry of executionSteps) {
        const gateCountTimer = new Timer();
        const gateCount = await this.proofCreator.computeGateCountForCircuit(entry.bytecode, entry.functionName);
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

    let clientIvcProof: ClientIvcProof;
    // TODO(#7368) how do we 'bincode' encode these inputs?
    let provingTime;
    if (!skipProofGeneration) {
      const provingTimer = new Timer();
      clientIvcProof = await this.proofCreator.createClientIvcProof(executionSteps);
      provingTime = provingTimer.ms();
    } else {
      clientIvcProof = ClientIvcProof.random();
    }

    return {
      publicInputs: tailOutput.publicInputs,
      executionSteps,
      clientIvcProof,
      timings: provingTime ? { proving: provingTime } : undefined,
    };
  }

  private async getVkData(verificationKey: VerificationKeyData) {
    const previousVkMembershipWitness = await this.oracle.getVkMembershipWitness(verificationKey.keyAsFields);
    return new VkData(
      verificationKey,
      Number(previousVkMembershipWitness.leafIndex),
      previousVkMembershipWitness.siblingPath,
    );
  }

  private async createPrivateCallData({ publicInputs, vk: vkAsBuffer }: PrivateCallExecutionResult) {
    const { contractAddress, functionSelector } = publicInputs.callContext;

    const vkAsFields = await vkAsFieldsMegaHonk(vkAsBuffer);
    const vk = await VerificationKeyAsFields.fromKey(vkAsFields);

    const { currentContractClassId, publicKeys, saltedInitializationHash } =
      await this.oracle.getContractAddressPreimage(contractAddress);
    const functionLeafMembershipWitness = await this.oracle.getFunctionMembershipWitness(
      currentContractClassId,
      functionSelector,
    );

    const { artifactHash: contractClassArtifactHash, publicBytecodeCommitment: contractClassPublicBytecodeCommitment } =
      await this.oracle.getContractClassIdPreimage(currentContractClassId);

    const updatedClassIdHints = await this.oracle.getUpdatedClassIdHints(contractAddress);
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
}
