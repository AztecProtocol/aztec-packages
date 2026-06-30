import type { AvmStat } from '@aztec/bb.js';
import { Timer } from '@aztec/foundation/timer';
import {
  type MeasuredSimulatorFactory,
  PublicTxSimulationTester,
  SimpleContractDataSource,
  type TestEnqueuedCall,
  type TestExecutorMetrics,
  type TestPrivateInsertions,
} from '@aztec/simulator/public/fixtures';
import { AvmExecutor, MeasuredPublicTxSimulator, PublicContractsDB } from '@aztec/simulator/server';
import type { PublicTxResult } from '@aztec/simulator/server';
import { AvmCircuitInputs, AvmCircuitPublicInputs, PublicSimulatorConfig } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { Gas } from '@aztec/stdlib/gas';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import type { GlobalVariables } from '@aztec/stdlib/tx';
import { NativeWorldStateService } from '@aztec/world-state';

import path from 'path';

import { BBJsFactory } from '../bb/bb_js_backend.js';

const BB_PATH = path.resolve('../../barretenberg/cpp/build/bin/bb-avm');

// Config with collectHints enabled for proving tests
const provingConfig: PublicSimulatorConfig = PublicSimulatorConfig.from({
  skipFeeEnforcement: false,
  collectCallMetadata: true, // For results.
  collectDebugLogs: false,
  collectHints: true, // Required for proving!
  collectPublicInputs: true, // Required for proving!
  collectStatistics: false,
});

export class AvmProvingTester extends PublicTxSimulationTester {
  private readonly bbJsFactory = new BBJsFactory(BB_PATH);

  constructor(
    private checkCircuitOnly: boolean,
    contractDataSource: SimpleContractDataSource,
    merkleTrees: MerkleTreeWriteOperations,
    globals?: GlobalVariables,
    metrics?: TestExecutorMetrics,
    simulatorFactory?: MeasuredSimulatorFactory,
  ) {
    super(merkleTrees, contractDataSource, globals, metrics, simulatorFactory, provingConfig);
  }

  static async new(
    worldStateService: NativeWorldStateService, // make sure to close this later
    checkCircuitOnly: boolean = false,
    globals?: GlobalVariables,
    metrics?: TestExecutorMetrics,
  ) {
    const contractDataSource = new SimpleContractDataSource();
    const merkleTrees = await worldStateService.fork();

    const forkId = merkleTrees.getRevision().forkId;
    const avmExecutor = await AvmExecutor.spawn({ wsdbIpcPath: worldStateService.getIpcPath() });
    const forkedSimulator = avmExecutor.forFork(
      forkId,
      new PublicContractsDB(contractDataSource),
      globals?.timestamp ?? 0n,
    );
    const simulatorFactory: MeasuredSimulatorFactory = (_mt, _cdb, g, m, c) =>
      new MeasuredPublicTxSimulator(forkedSimulator, g, m, c, undefined, forkId);

    const tester = new AvmProvingTester(
      checkCircuitOnly,
      contractDataSource,
      merkleTrees,
      globals,
      metrics,
      simulatorFactory,
    );
    tester.avmExecutor = avmExecutor;
    return tester;
  }

  public override async close(): Promise<void> {
    const results = await Promise.allSettled([super.close(), this.bbJsFactory.destroy()]);
    const errors = results.flatMap(result => (result.status === 'rejected' ? [result.reason] : []));
    if (errors.length > 0) {
      throw new AggregateError(errors, `Failed to close AVM proving tester`);
    }
  }

  /**
   * Generate an AVM proof (or run check-circuit if configured). Records per-stage timings in the test metrics.
   * Returns the in-memory proof fields on success; throws via jest expect() on failure.
   */
  async prove(avmCircuitInputs: AvmCircuitInputs, txLabel: string = 'unlabeledTx'): Promise<Uint8Array[]> {
    const inputsBuffer = avmCircuitInputs.serializeWithMessagePack();

    if (this.checkCircuitOnly) {
      await using instance = await this.bbJsFactory.getInstance();
      const { passed, stats } = await instance.checkAvmCircuit(inputsBuffer);
      this.recordProverMetrics(stats, txLabel);
      expect(passed).toBe(true);
      return [];
    }

    await using instance = await this.bbJsFactory.getInstance();
    const { proof, stats } = await instance.generateAvmProof(inputsBuffer);
    this.recordProverMetrics(stats, txLabel);
    return proof;
  }

  async verify(proof: Uint8Array[], publicInputs: AvmCircuitPublicInputs): Promise<void> {
    if (this.checkCircuitOnly) {
      // Check-circuit did not generate a proof; nothing to verify.
      return;
    }
    const piBuffer = publicInputs.serializeWithMessagePack();
    await using instance = await this.bbJsFactory.getInstance();
    const { verified } = await instance.verifyAvmProof(proof, piBuffer);
    expect(verified).toBe(true);
  }

  public async proveVerify(avmCircuitInputs: AvmCircuitInputs, txLabel: string = 'unlabeledTx') {
    const proof = await this.prove(avmCircuitInputs, txLabel);
    await this.verify(proof, avmCircuitInputs.publicInputs);
  }

  private recordProverMetrics(stats: AvmStat[], txLabel: string) {
    // Build a lookup keyed on the stage name with the `_ms` suffix stripped, matching the legacy
    // stdout-scraped shape. bb::avm2::Stats::time() stores keys with `_ms` appended.
    const times: { [key: string]: number } = {};
    for (const { name, valueMs } of stats) {
      const key = name.endsWith('_ms') ? name.slice(0, -'_ms'.length) : name;
      times[key] = valueMs;
    }
    if (Object.keys(times).length === 0) {
      throw new Error('AVM response did not contain any proving-stage timings!');
    }
    // Hack to make labels match.
    const txLabelWithCount = `${txLabel}/${this.txCount - 1}`;
    // Cast because TS doesn't realize `metrics` is protected, not private on the parent class.
    (this as any).metrics?.recordProverMetrics(txLabelWithCount, {
      proverSimulationStepMs: times['simulation/all'],
      proverProvingStepMs: times['proving/all'],
      proverTraceGenerationStepMs: times['tracegen/all'],
      traceGenerationInteractionsMs: times['tracegen/interactions'],
      traceGenerationTracesMs: times['tracegen/traces'],
      provingSumcheckMs: times['prove/sumcheck'],
      provingPcsMs: times['prove/pcs_rounds'],
      provingLogDerivativeInverseMs: times['prove/log_derivative_inverse_round'],
      provingLogDerivativeInverseCommitmentsMs: times['prove/log_derivative_inverse_commitments_round'],
      provingWireCommitmentsMs: times['prove/wire_commitments_round'],
    });
  }

  public async simProveVerify(
    sender: AztecAddress,
    setupCalls: TestEnqueuedCall[],
    appCalls: TestEnqueuedCall[],
    teardownCall: TestEnqueuedCall | undefined,
    expectRevert: boolean | undefined,
    feePayer = sender,
    privateInsertions?: TestPrivateInsertions,
    txLabel: string = 'unlabeledTx',
    disableRevertCheck: boolean = false,
    gasLimits?: Gas,
  ): Promise<PublicTxResult> {
    const simTimer = new Timer();
    const simRes = await this.simulateTx(
      sender,
      setupCalls,
      appCalls,
      teardownCall,
      feePayer,
      privateInsertions,
      txLabel,
      gasLimits,
    );
    const simDuration = simTimer.ms();
    this.logger.info(`Simulation took ${simDuration} ms for tx ${txLabel}`);

    if (!disableRevertCheck) {
      expect(simRes.revertCode.isOK()).toBe(expectRevert ? false : true);
    }

    const opString = this.checkCircuitOnly ? 'Check circuit' : 'Proving and verification';

    const avmCircuitInputs = new AvmCircuitInputs(simRes.hints!, simRes.publicInputs!);
    const timer = new Timer();
    await this.proveVerify(avmCircuitInputs, txLabel);
    this.logger.info(`${opString} took ${timer.ms()} ms for tx ${txLabel}`);

    return simRes;
  }

  public override async executeTxWithLabel(
    txLabel: string,
    sender: AztecAddress,
    setupCalls?: TestEnqueuedCall[],
    appCalls?: TestEnqueuedCall[],
    teardownCall?: TestEnqueuedCall,
    feePayer?: AztecAddress,
    privateInsertions?: TestPrivateInsertions,
    gasLimits?: Gas,
  ) {
    return await this.simProveVerify(
      sender,
      setupCalls ?? [],
      appCalls ?? [],
      teardownCall,
      undefined,
      feePayer,
      privateInsertions,
      txLabel,
      true,
      gasLimits,
    );
  }

  public async simProveVerifyAppLogic(
    appCall: TestEnqueuedCall,
    expectRevert?: boolean,
    txLabel: string = 'unlabeledTx',
    gasLimits?: Gas,
  ) {
    await this.simProveVerify(
      /*sender=*/ AztecAddress.fromNumber(42),
      /*setupCalls=*/ [],
      [appCall],
      undefined,
      expectRevert,
      /*feePayer=*/ undefined,
      /*privateInsertions=*/ undefined,
      txLabel,
      /*disableRevertCheck=*/ false,
      gasLimits,
    );
  }
}
