/**
 * Tests that the bb.js debug wrapper writes files that are compatible with the bb CLI.
 * Generates a proof via bb.js with the debug wrapper enabled, then:
 * 1. Runs `bb prove` via CLI using the same inputs → compares proof output
 * 2. Runs `bb verify` via CLI using the proof files → checks verification passes
 */
import { BBJsInstance, type BBJsProofResult } from '@aztec/bb-prover';
import { DebugBBJsInstance } from '@aztec/bb-prover/debug';
import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { Noir } from '@aztec/noir-noir_js';
import { ServerCircuitArtifacts } from '@aztec/noir-protocol-circuits-types/server';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { ParityBasePrivateInputs } from '@aztec/stdlib/parity';

import { jest } from '@jest/globals';
import * as proc from 'child_process';
import * as fs from 'fs/promises';
import { ungzip } from 'pako';
import * as path from 'path';
import readline from 'readline';

// Spawn the bb CLI and resolve with its exit code. Inlined here (previously lived in bb-prover/bb/execute.ts)
// because this parity test is the only remaining consumer of the bb binary spawner in the TS tree.
function executeBB(pathToBB: string, command: string, args: string[], log: (msg: string) => void): Promise<number> {
  return new Promise(resolve => {
    const bb = proc.spawn(pathToBB, [command, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    readline.createInterface({ input: bb.stdout }).on('line', log);
    readline.createInterface({ input: bb.stderr }).on('line', log);
    bb.on('close', (code: number) => resolve(code ?? -1));
  });
}

const logger = createLogger('ivc-integration:test:bb-js-debug');

jest.setTimeout(120_000);

const BB_PATH = path.resolve(
  path.join(path.dirname(new URL(import.meta.url).pathname), '../../../barretenberg/cpp/build/bin/bb'),
);

describe('BB.js Debug Wrapper', () => {
  let debugDir: string;
  let bytecode: Uint8Array;
  let witness: Uint8Array;
  let vkBytes: Uint8Array;
  let bbJsResult: BBJsProofResult;

  beforeAll(async () => {
    // Verify bb binary exists
    await fs.access(BB_PATH);

    // Create a temporary debug output directory
    debugDir = await fs.mkdtemp(path.join(process.env.BB_WORKING_DIRECTORY || '/tmp', 'bb-debug-test-'));

    // Generate base parity inputs (same approach as base_parity_inputs.test.ts)
    const l1ToL2Messages = new Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(null).map(() => Fr.random());
    const vkTreeRoot = getVKTreeRoot();
    const baseParityInputs = ParityBasePrivateInputs.fromSlice(l1ToL2Messages, 0, vkTreeRoot, Fr.random());

    const noirInputs = {
      msgs: baseParityInputs.msgs.map(m => m.toString()),
      // eslint-disable-next-line camelcase
      vk_tree_root: baseParityInputs.vkTreeRoot.toString(),
      // eslint-disable-next-line camelcase
      prover_id: baseParityInputs.proverId.toString(),
    };

    const artifact = ServerCircuitArtifacts.ParityBaseArtifact;

    // Execute circuit with Noir JS to generate witness
    logger.info('Generating witness via Noir JS...');
    const program = new Noir(artifact as any);
    const { witness: compressedWitness } = await program.execute({ inputs: noirInputs });

    // Decompress for bb.js (it expects raw bytes)
    bytecode = ungzip(Buffer.from(artifact.bytecode, 'base64'));
    witness = ungzip(compressedWitness);
    vkBytes = Buffer.from(artifact.verificationKey!.bytes, 'hex');

    // Generate proof via bb.js with debug wrapper
    logger.info('Generating proof via bb.js with debug wrapper...');
    const raw = await BBJsInstance.create(BB_PATH, (msg: string) => logger.verbose(`bb.js - ${msg}`));
    const debug = new DebugBBJsInstance(raw, debugDir, BB_PATH, logger);

    try {
      bbJsResult = await debug.generateProof('ParityBase', bytecode, vkBytes, witness, 'ultra_honk');
      logger.info(
        `bb.js proof generated: ${bbJsResult.proofFields.length} proof fields, ${bbJsResult.publicInputFields.length} public input fields`,
      );
    } finally {
      await debug.destroy();
    }
  });

  afterAll(async () => {
    // Clean up debug dir
    if (debugDir) {
      await fs.rm(debugDir, { recursive: true, force: true });
    }
  });

  it('writes correct debug files and command.sh', async () => {
    const opDir = path.join(debugDir, 'ParityBase-001');

    // Check all expected files exist
    const files = await fs.readdir(opDir);
    expect(files).toContain('ParityBase-bytecode.gz');
    expect(files).toContain('ParityBase-vk');
    expect(files).toContain('partial-witness.gz');
    expect(files).toContain('proof');
    expect(files).toContain('public_inputs');
    expect(files).toContain('command.sh');

    // Check command.sh contains the expected prove command
    const command = await fs.readFile(path.join(opDir, 'command.sh'), 'utf-8');
    expect(command).toContain('prove');
    expect(command).toContain('--scheme ultra_honk');
    expect(command).toContain('--oracle_hash poseidon2');
    expect(command).toContain('--disable_zk');
    expect(command).toContain('-b');
    expect(command).toContain('-k');
    expect(command).toContain('-w');
    expect(command).toContain('-o');
  });

  it('CLI bb prove reproduces the same proof as bb.js', async () => {
    const opDir = path.join(debugDir, 'ParityBase-001');

    // Create a separate output directory for the CLI proof
    const cliOutputDir = path.join(debugDir, 'cli-prove-output');
    await fs.mkdir(cliOutputDir, { recursive: true });

    // Run the bb prove command using the same input files
    const bytecodePath = path.join(opDir, 'ParityBase-bytecode.gz');
    const vkPath = path.join(opDir, 'ParityBase-vk');
    const witnessPath = path.join(opDir, 'partial-witness.gz');

    const logFn = (msg: string) => logger.verbose(`bb-cli - ${msg}`);
    const exitCode = await executeBB(
      BB_PATH,
      'prove',
      [
        '--scheme',
        'ultra_honk',
        '--oracle_hash',
        'poseidon2',
        '--disable_zk',
        '-b',
        bytecodePath,
        '-k',
        vkPath,
        '-w',
        witnessPath,
        '-o',
        cliOutputDir,
      ],
      logFn,
    );

    expect(exitCode).toBe(0);

    // Read CLI proof output
    const cliProof = await fs.readFile(path.join(cliOutputDir, 'proof'));
    const cliPublicInputs = await fs.readFile(path.join(cliOutputDir, 'public_inputs'));

    // Read bb.js proof output (written by debug wrapper)
    const bbJsProof = await fs.readFile(path.join(opDir, 'proof'));
    const bbJsPublicInputs = await fs.readFile(path.join(opDir, 'public_inputs'));

    // With --disable_zk, proofs are deterministic — they should match exactly
    expect(Buffer.compare(cliProof, bbJsProof)).toBe(0);
    expect(Buffer.compare(cliPublicInputs, bbJsPublicInputs)).toBe(0);
  });

  it('CLI bb verify succeeds with debug output files', async () => {
    const opDir = path.join(debugDir, 'ParityBase-001');

    // We need the VK produced by the prover (not the input VK).
    // The prove command writes a VK only with --write_vk. Instead, we write_vk separately
    // then verify using those files. Or we can just use the proof + public_inputs + VK
    // from the CLI prove output which also writes them.
    // Actually, let's write the VK first and then verify.
    const vkDir = path.join(debugDir, 'cli-vk-output');
    await fs.mkdir(vkDir, { recursive: true });

    const bytecodePath = path.join(opDir, 'ParityBase-bytecode.gz');

    // Generate VK via CLI
    const logFn = (msg: string) => logger.verbose(`bb-cli - ${msg}`);
    const vkExitCode = await executeBB(
      BB_PATH,
      'write_vk',
      ['--scheme', 'ultra_honk', '--oracle_hash', 'poseidon2', '--disable_zk', '-b', bytecodePath, '-o', vkDir],
      logFn,
    );
    expect(vkExitCode).toBe(0);

    // Verify using the proof and public_inputs written by the debug wrapper
    const proofPath = path.join(opDir, 'proof');
    const publicInputsPath = path.join(opDir, 'public_inputs');
    const vkPath = path.join(vkDir, 'vk');

    const verifyExitCode = await executeBB(
      BB_PATH,
      'verify',
      [
        '--scheme',
        'ultra_honk',
        '--oracle_hash',
        'poseidon2',
        '--disable_zk',
        '-p',
        proofPath,
        '-k',
        vkPath,
        '-i',
        publicInputsPath,
      ],
      logFn,
    );
    expect(verifyExitCode).toBe(0);
  });
});
