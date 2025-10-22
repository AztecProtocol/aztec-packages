import type { LogFn, LogLevel, Logger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import {
  PublicTxSimulationTester,
  SimpleContractDataSource,
  type TestEnqueuedCall,
  type TestExecutorMetrics,
  type TestPrivateInsertions,
} from '@aztec/simulator/public/fixtures';
import type { PublicTxResult } from '@aztec/simulator/server';
import { type AvmCircuitInputs, AvmCircuitPublicInputs } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import type { GlobalVariables } from '@aztec/stdlib/tx';
import { NativeWorldStateService } from '@aztec/world-state';

import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'path';

import {
  type BBResult,
  type BBSuccess,
  BB_RESULT,
  VK_FILENAME,
  generateAvmProof,
  verifyAvmProof,
} from '../bb/execute.js';

const BB_PATH = path.resolve('../../barretenberg/cpp/build/bin/bb');

// An InterceptingLogger that records all log messages and forwards them to a wrapped logger.
class InterceptingLogger implements Logger {
  public readonly logs: string[] = [];
  public level: LogLevel;
  public module: string;

  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    this.level = logger.level;
    this.module = logger.module;
  }

  isLevelEnabled(level: LogLevel): boolean {
    return this.logger.isLevelEnabled(level);
  }

  createChild(_childModule: string): Logger {
    throw new Error('Not implemented');
  }

  private intercept(level: LogLevel, msg: string, ...args: any[]) {
    this.logs.push(...msg.split('\n'));
    // Forward to the wrapped logger
    (this.logger[level] as LogFn)(msg, ...args);
  }

  // Log methods for each level
  silent(msg: string, ...args: any[]) {
    this.intercept('silent', msg, ...args);
  }
  fatal(msg: string, ...args: any[]) {
    this.intercept('fatal', msg, ...args);
  }
  warn(msg: string, ...args: any[]) {
    this.intercept('warn', msg, ...args);
  }
  info(msg: string, ...args: any[]) {
    this.intercept('info', msg, ...args);
  }
  verbose(msg: string, ...args: any[]) {
    this.intercept('verbose', msg, ...args);
  }
  debug(msg: string, ...args: any[]) {
    this.intercept('debug', msg, ...args);
  }
  trace(msg: string, ...args: any[]) {
    this.intercept('trace', msg, ...args);
  }

  // Error log function can be string or Error
  error(err: Error | string, ...args: any[]) {
    const msg = typeof err === 'string' ? err : err.message;
    this.logs.push(msg);
    this.logger.error(msg, err, ...args);
  }
}

export class AvmProvingTester extends PublicTxSimulationTester {
  private bbWorkingDirectory: string = '';

  constructor(
    private checkCircuitOnly: boolean,
    contractDataSource: SimpleContractDataSource,
    merkleTrees: MerkleTreeWriteOperations,
    globals?: GlobalVariables,
    metrics?: TestExecutorMetrics,
  ) {
    super(merkleTrees, contractDataSource, globals, metrics);
  }

  static async new(checkCircuitOnly: boolean = false, globals?: GlobalVariables, metrics?: TestExecutorMetrics) {
    const contractDataSource = new SimpleContractDataSource();
    const merkleTrees = await (await NativeWorldStateService.tmp()).fork();
    return new AvmProvingTester(checkCircuitOnly, contractDataSource, merkleTrees, globals, metrics);
  }

  async prove(avmCircuitInputs: AvmCircuitInputs, txLabel: string = 'unlabeledTx'): Promise<BBResult> {
    // We use a new working directory for each proof.
    this.bbWorkingDirectory = await fs.mkdtemp(path.join(tmpdir(), 'bb-'));

    const interceptingLogger = new InterceptingLogger(this.logger);

    // Then we prove.
    const proofRes = await generateAvmProof(
      BB_PATH,
      this.bbWorkingDirectory,
      avmCircuitInputs,
      interceptingLogger,
      this.checkCircuitOnly,
    );
    if (proofRes.status === BB_RESULT.FAILURE) {
      this.logger.error(`Proof generation failed: ${proofRes.reason}`);
    }
    expect(proofRes.status).toEqual(BB_RESULT.SUCCESS);

    // Parse the logs into a structured format.
    const logs = interceptingLogger.logs;
    // const traceSizes: { name: string; size: number }[] = [];
    // logs.forEach(log => {
    //   const match = log.match(/\b(\w+): (\d+) \(~2/);
    //   if (match) {
    //     traceSizes.push({
    //       name: match[1],
    //       size: parseInt(match[2]),
    //     });
    //   }
    // });
    const times: { [key: string]: number } = {};
    logs.forEach(log => {
      const match = log.match(/\b([\w/]+)_ms: (\d+)/);
      if (match) {
        times[match[1]] = parseInt(match[2]);
      }
    });

    // Throw if logs did not contain any times.
    if (Object.keys(times).length === 0) {
      throw new Error('AVM stdout did not contain any proving times in the stats!');
    }

    // Hack to make labels match.
    const txLabelWithCount = `${txLabel}/${this.txCount - 1}`;
    // I need to cast because TS doesnt realize metrics is protected not private.
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

    return proofRes as BBSuccess;
  }

  async verify(proofRes: BBSuccess, publicInputs: AvmCircuitPublicInputs): Promise<BBResult> {
    if (this.checkCircuitOnly) {
      // Skip verification if we are only checking the circuit.
      // Check-circuit does not generate a proof to verify.
      return proofRes;
    }

    return await verifyAvmProof(
      BB_PATH,
      this.bbWorkingDirectory,
      proofRes.proofPath!,
      publicInputs,
      path.join(proofRes.vkDirectoryPath!, VK_FILENAME),
      this.logger,
    );
  }

  public async proveVerify(avmCircuitInputs: AvmCircuitInputs, txLabel: string = 'unlabeledTx') {
    const provingRes = await this.prove(avmCircuitInputs, txLabel);
    expect(provingRes.status).toEqual(BB_RESULT.SUCCESS);

    const verificationRes = await this.verify(provingRes as BBSuccess, avmCircuitInputs.publicInputs);
    expect(verificationRes.status).toBe(BB_RESULT.SUCCESS);
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
  ): Promise<PublicTxResult> {
    const simRes = await this.simulateTx(
      sender,
      setupCalls,
      appCalls,
      teardownCall,
      feePayer,
      privateInsertions,
      txLabel,
    );

    if (!disableRevertCheck) {
      expect(simRes.revertCode.isOK()).toBe(expectRevert ? false : true);
    }

    const opString = this.checkCircuitOnly ? 'Check circuit' : 'Proving and verification';

    const avmCircuitInputs = simRes.avmProvingRequest.inputs;
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
    );
  }

  public async simProveVerifyAppLogic(
    appCall: TestEnqueuedCall,
    expectRevert?: boolean,
    txLabel: string = 'unlabeledTx',
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
    );
  }
}
