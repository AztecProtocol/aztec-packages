import type { LoggerBindings } from '@aztec/foundation/log';
import {
  AvmCircuitInputs,
  AvmCircuitPublicInputs,
  AvmExecutionHints,
  type PublicSimulatorConfig,
  type PublicTxResult,
  serializeWithMessagePack,
} from '@aztec/stdlib/avm';
import type { GlobalVariables, Tx } from '@aztec/stdlib/tx';

import { strict as assert } from 'assert';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import type { AvmSimulator } from '../avm_simulator_pool.js';
import { PublicTxSimulator } from './public_tx_simulator.js';

/**
 * IPC-based C++ public tx simulator that dumps AVM circuit inputs to disk after simulation.
 * Used during nightly CI runs to collect circuit inputs for AVM proving benchmarks.
 */
export class DumpingPublicTxSimulator extends PublicTxSimulator {
  private readonly outputDir: string;

  constructor(
    avmSimulator: AvmSimulator,
    globalVariables: GlobalVariables,
    config: Partial<PublicSimulatorConfig>,
    outputDir: string,
    bindings?: LoggerBindings,
    wsdbForkId?: number,
  ) {
    super(avmSimulator, globalVariables, config, bindings, wsdbForkId);
    assert(config.collectHints === true, 'collectHints must be enabled to dump AVM circuit inputs');
    assert(config.collectPublicInputs === true, 'collectPublicInputs must be enabled to dump AVM circuit inputs');
    this.outputDir = outputDir;
  }

  public override async simulate(tx: Tx): Promise<PublicTxResult> {
    const result = await super.simulate(tx);
    this.dumpAvmCircuitInputs(result, tx.getTxHash().toString());
    return result;
  }

  private dumpAvmCircuitInputs(result: PublicTxResult, txHash: string): void {
    try {
      mkdirSync(this.outputDir, { recursive: true });

      const filename = `avm-circuit-inputs-tx-${txHash}.bin`;
      const filepath = join(this.outputDir, filename);

      const hints = result.hints ?? AvmExecutionHints.empty();
      const publicInputs = result.publicInputs ?? AvmCircuitPublicInputs.empty();
      const avmCircuitInputs = new AvmCircuitInputs(hints, publicInputs);

      const serialized = serializeWithMessagePack(avmCircuitInputs);
      writeFileSync(filepath, serialized);

      this.log.debug(`Dumped AVM circuit inputs to ${filepath}`);
    } catch (error) {
      this.log.warn(`Failed to dump AVM circuit inputs for tx ${txHash}: ${error}`);
    }
  }
}
