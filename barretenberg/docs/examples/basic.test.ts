// docs:start:imports
import { UltraHonkBackend } from '@aztec/bb.js';
// docs:end:imports
import { Barretenberg, Fr, ProofData, VerifierTarget } from '@aztec/bb.js';
import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { expect, describe, it } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Basic Barretenberg Example', () => {
  it('should prove and verify a circuit', async () => {

    // docs:start:setup
    // Load circuit bytecode (from Noir compiler output)
    const circuitPath = path.join(__dirname, 'fixtures/main/target/program.json');
    const circuitJson = JSON.parse(readFileSync(circuitPath, 'utf8'));
    const bytecode = circuitJson.bytecode;

    // Load witness data
    const witnessPath = path.join(__dirname, 'fixtures/main/target/program.gz');
    const witnessBuffer = readFileSync(witnessPath);

    // Initialize backend
    const backend = new UltraHonkBackend(bytecode);
    // docs:end:setup

    try {
      console.log('Generating proof...');
      const startTime = Date.now();

      // docs:start:prove
      // Generate proof for EVM verification (uses keccak hash, no ZK)
      const proofData: ProofData = await backend.generateProof(witnessBuffer, {
        verifierTarget: 'evm-no-zk',
      });

      const provingTime = Date.now() - startTime;
      console.log(`Proof generated in ${provingTime}ms`);
      console.log(`Proof size: ${proofData.proof.length} bytes`);
      console.log(`Public inputs: ${proofData.publicInputs.length}`);
      // docs:end:prove

      // docs:start:verify
      // Verify the proof
      console.log('Verifying proof...');
      const isValid = await backend.verifyProof(proofData, { verifierTarget: 'evm-no-zk' });
      console.log(`Proof verification: ${isValid ? 'SUCCESS' : 'FAILED'}`);
      // docs:end:verify

      // Get Solidity verifier contract
      const vk = await backend.getVerificationKey({ verifierTarget: 'evm-no-zk' });
      const contract = await backend.getSolidityVerifier(vk, { verifierTarget: 'evm-no-zk' });

      console.log('Solidity verifier contract generated');

      // Assertions
      expect(isValid).toBe(true);
      expect(proofData.proof.length).toBeGreaterThan(0);
      expect(typeof contract).toBe('string');
      expect(contract).toContain('contract');

    } finally {
      // Always clean up
      await backend.destroy();
    }
  });

  it('should generate proofs with different hash variants', async () => {

    // Load circuit bytecode (from Noir compiler output)
    const circuitPath = path.join(__dirname, 'fixtures/main/target/program.json');
    const circuitJson = JSON.parse(readFileSync(circuitPath, 'utf8'));
    const bytecode = circuitJson.bytecode;

    // Load witness data
    const witnessPath = path.join(__dirname, 'fixtures/main/target/program.gz');
    const witnessBuffer = readFileSync(witnessPath);

    // Initialize backend
    const backend = new UltraHonkBackend(bytecode);

    try {
      // docs:start:verifier_targets
      // Default: recursive verification in Noir (poseidon2, ZK enabled)
      const proof = await backend.generateProof(witnessBuffer);
      expect(proof.proof.length).toBeGreaterThan(0);

      // EVM verification without ZK (keccak hash)
      const proofEvm = await backend.generateProof(witnessBuffer, { verifierTarget: 'evm-no-zk' });
      expect(proofEvm.proof).to.have.length.greaterThan(0);

      // EVM verification with ZK (keccak hash)
      const proofEvmZk = await backend.generateProof(witnessBuffer, { verifierTarget: 'evm' });
      expect(proofEvmZk.proof).to.have.length.greaterThan(0);

      // Recursive verification in Noir (explicit)
      const proofRecursive = await backend.generateProof(witnessBuffer, { verifierTarget: 'noir-recursive' });
      expect(proofRecursive.proof).to.have.length.greaterThan(0);
      // docs:end:verifier_targets

    } finally {
      // Always clean up
      await backend.destroy();
    }
  });

  it('should get verification keys', async () => {

    // Load circuit bytecode (from Noir compiler output)
    const circuitPath = path.join(__dirname, 'fixtures/main/target/program.json');
    const circuitJson = JSON.parse(readFileSync(circuitPath, 'utf8'));
    const bytecode = circuitJson.bytecode;

    // Initialize backend
    const backend = new UltraHonkBackend(bytecode);

    try {
      // docs:start:verification_keys
      // Get verification key for recursive verification (default)
      const vk = await backend.getVerificationKey();

      // For a solidity verifier (EVM target):
      const vkEvm = await backend.getVerificationKey({ verifierTarget: 'evm-no-zk' });
      // docs:end:verification_keys

      // Test that verification keys are valid
      expect(vk).toBeInstanceOf(Uint8Array);
      expect(vk.length).toBeGreaterThan(0);
      expect(vkKeccak).toBeInstanceOf(Uint8Array);
      expect(vkKeccak.length).toBeGreaterThan(0);

    } finally {
      // Always clean up
      await backend.destroy();
    }
  });

  it('should get solidity verifier contract', async () => {

    // Load circuit bytecode (from Noir compiler output)
    const circuitPath = path.join(__dirname, 'fixtures/main/target/program.json');
    const circuitJson = JSON.parse(readFileSync(circuitPath, 'utf8'));
    const bytecode = circuitJson.bytecode;

    // Initialize backend
    const backend = new UltraHonkBackend(bytecode);

    try {
      // Get EVM verification key first
      const vkEvm = await backend.getVerificationKey({ verifierTarget: 'evm-no-zk' });

      // docs:start:solidity_verifier
      // Needs the EVM target VK (uses keccak hash)
      const solidityContract = await backend.getSolidityVerifier(vkEvm, { verifierTarget: 'evm-no-zk' });
      // docs:end:solidity_verifier

      // Test that solidity contract is valid
      expect(typeof solidityContract).toBe('string');
      expect(solidityContract).toContain('contract');
      expect(solidityContract).toContain('function verify');

    } finally {
      // Always clean up
      await backend.destroy();
    }
  });

  it('should perform low-level cryptographic operations', async () => {

    // docs:start:low_level_api
    const api = await Barretenberg.new({ threads: 1 });

    // Blake2s hashing
    const input = Buffer.from('hello world!');
    const hash = await api.blake2s(input);

    // Pedersen commitment
    const left = Fr.random();
    const right = Fr.random();
    const commitment = await api.pedersenCommit([left, right], 0);

    await api.destroy();
    // docs:end:low_level_api

    // Test that operations produce valid results
    expect(hash).toBeDefined();
    expect(commitment).toBeDefined();
  });
});
