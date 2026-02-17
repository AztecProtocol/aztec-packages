import type { LoggerBindings } from '@aztec/foundation/log';
import {
  AvmCircuitInputs,
  AvmCircuitPublicInputs,
  AvmExecutionHints,
  type PublicSimulatorConfig,
  PublicTxResult,
  serializeWithMessagePack,
} from '@aztec/stdlib/avm';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/trees';
import type { GlobalVariables, Tx, TxHash } from '@aztec/stdlib/tx';

import { strict as assert } from 'assert';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import type { PublicContractsDB } from '../public_db_sources.js';
import { CppPublicTxSimulator } from './cpp_public_tx_simulator.js';

/**
 * A C++ public tx simulator that dumps AVM circuit inputs to disk after simulation.
 * Used during nightly CI runs to collect circuit inputs for benchmarking.
 */
export class DumpingCppPublicTxSimulator extends CppPublicTxSimulator {
  private readonly outputDir: string;

  constructor(
    merkleTree: MerkleTreeWriteOperations,
    contractsDB: PublicContractsDB,
    globalVariables: GlobalVariables,
    config: Partial<PublicSimulatorConfig>,
    outputDir: string,
    bindings?: LoggerBindings,
  ) {
    super(merkleTree, contractsDB, globalVariables, config, bindings);
    assert(config.collectHints === true, 'collectHints must be enabled to dump AVM circuit inputs');
    assert(config.collectPublicInputs === true, 'collectPublicInputs must be enabled to dump AVM circuit inputs');
    this.outputDir = outputDir;
  }

  public override async simulate(tx: Tx): Promise<PublicTxResult> {
    const result = await super.simulate(tx);

    // Dump the circuit inputs after successful simulation
    const txHash = this.computeTxHash(tx);
    this.dumpAvmCircuitInputs(result, txHash);

    return result;
  }

  /**
   * Dumps AVM circuit inputs to disk.
   *
   * @param result - The simulation result containing hints and public inputs
   * @param txHash - The transaction hash to use in the filename
   */
  private dumpAvmCircuitInputs(result: PublicTxResult, txHash: TxHash): void {
    try {
      // Ensure the output directory exists
      mkdirSync(this.outputDir, { recursive: true });

      // Generate filename using transaction hash
      const filename = `avm-circuit-inputs-tx-${txHash.toString()}.bin`;
      const filepath = join(this.outputDir, filename);

      // Create circuit inputs from the result
      const hints = result.hints ?? AvmExecutionHints.empty();
      const publicInputs = result.publicInputs ?? AvmCircuitPublicInputs.empty();
      const avmCircuitInputs = new AvmCircuitInputs(hints, publicInputs);

      // Serialize the circuit inputs using MessagePack
      const serialized = serializeWithMessagePack(avmCircuitInputs);

      // Write to disk
      writeFileSync(filepath, serialized);

      this.log.debug(`Dumped AVM circuit inputs to ${filepath}`);
    } catch (error) {
      // Non-blocking error handling - log but don't interrupt processing
      this.log.warn(`Failed to dump AVM circuit inputs for tx ${txHash.toString()}: ${error}`);
    }
  }
}
