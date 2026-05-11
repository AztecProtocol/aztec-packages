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

import { type AvmIpcBackend, CppPublicTxSimulator } from './cpp_public_tx_simulator.js';
import type { SimulationHandle } from './public_tx_simulator_interface.js';

/**
 * IPC-based C++ public tx simulator that dumps AVM circuit inputs to disk after simulation.
 * Used during nightly CI runs to collect circuit inputs for AVM proving benchmarks.
 */
export class DumpingCppPublicTxSimulator extends CppPublicTxSimulator {
  private readonly outputDir: string;

  constructor(
    avmBackend: AvmIpcBackend,
    globalVariables: GlobalVariables,
    config: Partial<PublicSimulatorConfig>,
    outputDir: string,
    bindings?: LoggerBindings,
    wsdbForkId?: number,
  ) {
    super(avmBackend, globalVariables, config, bindings, wsdbForkId);
    assert(config.collectHints === true, 'collectHints must be enabled to dump AVM circuit inputs');
    assert(config.collectPublicInputs === true, 'collectPublicInputs must be enabled to dump AVM circuit inputs');
    this.outputDir = outputDir;
  }

  public override simulate(tx: Tx): SimulationHandle {
    const handle = super.simulate(tx);
    const result = handle.result.then(r => {
      this.dumpAvmCircuitInputs(r, tx.getTxHash().toString());
      return r;
    });
    return { result, cancel: handle.cancel };
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
