/**
 * Generates parity circuit inputs (bytecode + witness) for UltraHonk benchmarks.
 * Only runs when BASE_PARITY_BENCH_DIR env var is set by the UltraHonk benchmark input generator.
 *
 * Run with: BASE_PARITY_BENCH_DIR=./bench-out yarn workspace @aztec/ivc-integration test src/base_parity_inputs.test.ts
 *
 * The parity base/root circuits were replaced by the single variable-size InboxParity circuit (AZIP-22 Fast Inbox);
 * this benchmark now targets the 256-message rung (`InboxParity256`), matching the old base-parity circuit's size. The
 * output files keep their legacy `parity_base.json` / `witness.gz` names because `ci_benchmark_ultrahonk_circuits.sh`
 * locates inputs as `${circuit_name}.json` with `circuit_name=parity_base`.
 */
import { INBOX_PARITY_SIZE_MEDIUM } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { Noir } from '@aztec/noir-noir_js';
import { ServerCircuitArtifacts } from '@aztec/noir-protocol-circuits-types/server';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { L1ToL2MessageSponge, computeInHashFromL1ToL2Messages } from '@aztec/stdlib/messaging';
import { InboxParityPrivateInputs } from '@aztec/stdlib/parity';

import { jest } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';

const logger = createLogger('bench:inbox-parity');

jest.setTimeout(120_000);

describe('Inbox Parity Benchmark Inputs', () => {
  it('generates bytecode and witness files for parity benchmarking', async () => {
    const outputDir = process.env.BASE_PARITY_BENCH_DIR;
    if (!outputDir) {
      logger.info('Skipping parity bench input generation (BASE_PARITY_BENCH_DIR not set)');
      return;
    }
    logger.info(`Generating parity bench inputs to ${outputDir}`);

    await fs.mkdir(outputDir, { recursive: true });

    // Generate random L1-to-L2 messages that fill the 256-message rung.
    logger.info(`Generating ${INBOX_PARITY_SIZE_MEDIUM} random L1-to-L2 messages...`);
    const l1ToL2Messages = new Array(INBOX_PARITY_SIZE_MEDIUM).fill(null).map(() => Fr.random());

    // Create InboxParity inputs (picks the 256 rung for 256 messages).
    const vkTreeRoot = getVKTreeRoot();
    const inputs = InboxParityPrivateInputs.fromMessages(
      l1ToL2Messages,
      Fr.ZERO,
      L1ToL2MessageSponge.empty(),
      computeInHashFromL1ToL2Messages(l1ToL2Messages),
      vkTreeRoot,
      Fr.random(),
    );
    logger.info('Created inbox parity inputs');

    // Convert inputs to Noir format (inline the mapping since it's simple)
    const startSponge = inputs.startSponge;
    const noirInputs = {
      msgs: inputs.messages.map(m => m.toString()),
      // eslint-disable-next-line camelcase
      num_msgs: inputs.numMessages,
      // eslint-disable-next-line camelcase
      start_rolling_hash: inputs.startRollingHash.toString(),
      // eslint-disable-next-line camelcase
      start_sponge: {
        sponge: {
          cache: startSponge.sponge.cache.map(f => f.toString()),
          state: startSponge.sponge.state.map(f => f.toString()),
          // eslint-disable-next-line camelcase
          cache_size: startSponge.sponge.cacheSize,
          // eslint-disable-next-line camelcase
          squeeze_mode: startSponge.sponge.squeezeMode,
        },
        // eslint-disable-next-line camelcase
        num_absorbed: startSponge.numAbsorbed,
      },
      // eslint-disable-next-line camelcase
      in_hash: inputs.inHash.toString(),
      // eslint-disable-next-line camelcase
      vk_tree_root: inputs.vkTreeRoot.toString(),
      // eslint-disable-next-line camelcase
      prover_id: inputs.proverId.toString(),
    };
    logger.info('Converted inputs to Noir format');

    // Get the circuit artifact
    const artifact = ServerCircuitArtifacts.InboxParity256Artifact;

    // Execute the circuit with Noir to generate witness
    logger.info('Executing circuit with Noir to generate witness...');
    const program = new Noir(artifact as any);
    const { witness } = await program.execute({ inputs: noirInputs });
    logger.info('Witness generated');

    // Save bytecode as JSON (bb expects the full JSON artifact). Filename is the harness's legacy contract.
    const bytecodeOutputPath = path.join(outputDir, 'parity_base.json');
    await fs.writeFile(bytecodeOutputPath, JSON.stringify(artifact));
    logger.info(`Wrote bytecode to ${bytecodeOutputPath}`);

    // Save witness (already gzipped by Noir) - bb expects .gz format
    const witnessOutputPath = path.join(outputDir, 'witness.gz');
    await fs.writeFile(witnessOutputPath, witness);
    logger.info(`Wrote witness to ${witnessOutputPath}`);

    logger.info('Inbox parity bench inputs generated successfully');
    logger.info(`Output directory: ${outputDir}`);
    logger.info('Files:');
    logger.info(`  - ${bytecodeOutputPath} (circuit bytecode)`);
    logger.info(`  - ${witnessOutputPath} (compressed witness)`);
  });
});
