import { AztecClientBackend, BackendType, Barretenberg } from '@aztec/bb.js';
import { createLogger } from '@aztec/foundation/log';

import { jest } from '@jest/globals';
import { existsSync } from 'node:fs';
import { ungzip } from 'pako';

import { defaultBbBinaryPath, verifyChonkProofNatively } from './native_verify.js';
import {
  MockAppCreatorCircuit,
  MockHidingCircuit,
  MockPrivateKernelInitCircuit,
  MockPrivateKernelTailCircuit,
  generateTestingIVCStack,
} from './witgen.js';

const logger = createLogger('ivc-integration:test:wasm');

jest.setTimeout(180_000);

describe.each([BackendType.Wasm, BackendType.NativeUnixSocket])('Client IVC Integration', backend => {
  describe(backend, () => {
    let barretenberg: Barretenberg;

    beforeAll(async () => {
      barretenberg = await Barretenberg.initSingleton({
        backend,
        threads: 16,
        logger: (m: string) => logger.info(m),
      });
    });

    afterAll(async () => {
      await Barretenberg.destroySingleton();
    });

    // This test will verify a client IVC proof of a simple tx:
    // 1. Run a mock app that creates two commitments
    // 2. Run the init kernel to process the app run
    // 3. Run the tail kernel to finish the client IVC chain.
    // 4. Run the hiding kernel.
    it('Should generate a verifiable client IVC proof from a simple mock tx via bb.js, verified by bb', async () => {
      const [bytecodes, witnessStack, , vks] = await generateTestingIVCStack(1, 0);
      const backend = new AztecClientBackend(bytecodes, barretenberg);
      const { proof, vk } = await backend.prove(witnessStack, vks);
      const verified = await backend.verify(proof, vk);
      expect(verified).toBe(true);
    });

    // This test will verify a client IVC proof of a more complex tx:
    // 1. Run a mock app that creates two commitments
    // 2. Run the init kernel to process the app run
    // 3. Run a mock app that reads one of those commitments
    // 4. Run the inner kernel to process the second app run
    // 5. Run the reset kernel to process the read request emitted by the reader app
    // 6. Run the tail kernel to finish the client IVC chain
    // 7. Run the hiding kernel.
    // Independent confirmation that the proof bb.js produces (the same proofFields the
    // browser WebGPU MSM path emits) is accepted by the native bb verifier — not just the
    // in-process WASM verify. Skips if the native bb binary hasn't been built.
    const bbBinaryPath = defaultBbBinaryPath();
    const itNative = existsSync(bbBinaryPath) ? it : it.skip;
    itNative('Should generate a client IVC proof that the native bb binary verifies', async () => {
      const [bytecodes, witnessStack, , vks] = await generateTestingIVCStack(1, 0);
      const backend = new AztecClientBackend(bytecodes, barretenberg);
      const { proofFields, vk } = await backend.prove(witnessStack, vks);
      const { verified, output } = await verifyChonkProofNatively(proofFields, vk, { bbBinaryPath });
      if (!verified) {
        logger.error(`Native bb verify failed:\n${output}`);
      }
      expect(verified).toBe(true);
    });

    it('Should generate a verifiable client IVC proof from a complex mock tx', async () => {
      const [bytecodes, witnessStack, , vks] = await generateTestingIVCStack(1, 1);
      const backend = new AztecClientBackend(bytecodes, barretenberg);
      const { proof, vk } = await backend.prove(witnessStack, vks);
      const verified = await backend.verify(proof, vk);
      expect(verified).toBe(true);
    });

    it('Should compress and decompress a client IVC proof, producing a smaller proof', async () => {
      const [bytecodes, witnessStack, , vks] = await generateTestingIVCStack(1, 0);
      const ivcBackend = new AztecClientBackend(bytecodes, barretenberg);
      const { proof, vk, compressedProof } = await ivcBackend.prove(witnessStack, vks, { compress: true });

      expect(compressedProof).toBeDefined();
      expect(compressedProof!.length).toBeGreaterThan(0);
      expect(compressedProof!.length).toBeLessThan(proof.length);
      logger.info(`Uncompressed proof: ${proof.length} bytes, compressed: ${compressedProof!.length} bytes`);
      logger.info(`Compression ratio: ${(proof.length / compressedProof!.length).toFixed(2)}x`);

      // Decompress and verify roundtrip
      const decompressResult = await barretenberg.chonkDecompressProof({ compressedProof: compressedProof! });
      const verified = await barretenberg.chonkVerify({ proof: decompressResult.proof, vk });
      expect(verified.valid).toBe(true);
    });

    it('Should generate an array of gate numbers for the stack of programs being proved by ClientIVC', async () => {
      // Create ACIR bytecodes
      const bytecodes = [
        MockAppCreatorCircuit.bytecode,
        MockPrivateKernelInitCircuit.bytecode,
        MockPrivateKernelTailCircuit.bytecode,
        MockHidingCircuit.bytecode,
      ]
        .map(base64 => Buffer.from(base64, 'base64'))
        .map((arr: Uint8Array) => ungzip(arr));

      // Initialize AztecClientBackend with the given bytecodes
      const backend = new AztecClientBackend(bytecodes, barretenberg);

      // Compute the numbers of gates in each circuit
      const gateNumbers = await backend.gates();
      // await backend.destroy();
      logger.info('Gate numbers for each circuit:', gateNumbers);
      // STARTER: add a test here instantiate an AztecClientBackend with the above bytecodes, call gates, and check they're correct (maybe just
      // eyeball against logs to start... better is to make another test that actually pins the sizes since the mock protocol circuits are
      // intended not to change, though for sure there will be some friction, and such test should actually just be located in barretenberg/ts)
    });
  });
});
