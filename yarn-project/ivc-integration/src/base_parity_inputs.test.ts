/**
 * Generates base parity circuit inputs (bytecode + witness) for UltraHonk benchmarks.
 * Only runs when BASE_PARITY_BENCH_DIR env var is set by the UltraHonk benchmark input generator.
 *
 * Run with: BASE_PARITY_BENCH_DIR=./bench-out yarn workspace @aztec/ivc-integration test src/base_parity_inputs.test.ts
 */
import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { Noir } from '@aztec/noir-noir_js';
import { ServerCircuitArtifacts } from '@aztec/noir-protocol-circuits-types/server';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { ParityBasePrivateInputs } from '@aztec/stdlib/parity';

import { jest } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';

const logger = createLogger('bench:base-parity');

jest.setTimeout(120_000);

describe('Base Parity Benchmark Inputs', () => {
  it('generates bytecode and witness files for base parity benchmarking', async () => {
    const outputDir = process.env.BASE_PARITY_BENCH_DIR;
    if (!outputDir) {
      logger.info('Skipping base parity bench input generation (BASE_PARITY_BENCH_DIR not set)');
      return;
    }
    logger.info(`Generating base parity bench inputs to ${outputDir}`);

    await fs.mkdir(outputDir, { recursive: true });

    // Generate random L1-to-L2 messages
    logger.info(`Generating ${NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP} random L1-to-L2 messages...`);
    const l1ToL2Messages = new Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(null).map(() => Fr.random());

    // Create base parity inputs for the first slice
    const vkTreeRoot = getVKTreeRoot();
    const baseParityInputs = ParityBasePrivateInputs.fromSlice(l1ToL2Messages, 0, vkTreeRoot, Fr.random());
    logger.info('Created base parity inputs');

    // Convert inputs to Noir format (inline the mapping since it's simple)
    const noirInputs = {
      msgs: baseParityInputs.msgs.map(m => m.toString()),
      // eslint-disable-next-line camelcase
      vk_tree_root: baseParityInputs.vkTreeRoot.toString(),
      // eslint-disable-next-line camelcase
      prover_id: baseParityInputs.proverId.toString(),
    };
    logger.info('Converted inputs to Noir format');

    // Get the circuit artifact
    const artifact = ServerCircuitArtifacts.ParityBaseArtifact;

    // Execute the circuit with Noir to generate witness
    logger.info('Executing circuit with Noir to generate witness...');
    const program = new Noir(artifact as any);
    const { witness } = await program.execute({ inputs: noirInputs });
    logger.info('Witness generated');

    // Save bytecode as JSON (bb expects the full JSON artifact)
    const bytecodeOutputPath = path.join(outputDir, 'parity_base.json');
    await fs.writeFile(bytecodeOutputPath, JSON.stringify(artifact));
    logger.info(`Wrote bytecode to ${bytecodeOutputPath}`);

    // Save witness (already gzipped by Noir) - bb expects .gz format
    const witnessOutputPath = path.join(outputDir, 'witness.gz');
    await fs.writeFile(witnessOutputPath, witness);
    logger.info(`Wrote witness to ${witnessOutputPath}`);

    logger.info('Base parity bench inputs generated successfully');
    logger.info(`Output directory: ${outputDir}`);
    logger.info('Files:');
    logger.info(`  - ${bytecodeOutputPath} (circuit bytecode)`);
    logger.info(`  - ${witnessOutputPath} (compressed witness)`);
  });
});
