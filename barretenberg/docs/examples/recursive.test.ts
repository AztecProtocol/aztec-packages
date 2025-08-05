// docs:start:imports
import { UltraHonkBackend, ProofData, Barretenberg, RawBuffer, deflattenFields } from '@aztec/bb.js';
import { Noir } from '@noir-lang/noir_js';
// docs:end:imports
import { readFileSync } from 'fs';
import { expect } from 'chai';
import path from 'path';

describe('Recursive Aggregation Example', () => {
  let mainBackend: UltraHonkBackend;
  let recursiveBackend: UltraHonkBackend;
  let mainNoir: Noir;
  let recursiveNoir: Noir;
  let recursiveInputs: any;

  before(async function() {
    this.timeout(120000);

    // docs:start:setup
    // Load main circuit bytecode
    const mainCircuitPath = path.join(__dirname, 'fixtures/main/target/program.json');
    const mainCircuitJson = JSON.parse(readFileSync(mainCircuitPath, 'utf8'));
    const mainBytecode = mainCircuitJson.bytecode;

    // Load recursive circuit bytecode
    const recursiveCircuitPath = path.join(__dirname, 'fixtures/recursive/target/recursive.json');
    const recursiveCircuitJson = JSON.parse(readFileSync(recursiveCircuitPath, 'utf8'));
    const recursiveBytecode = recursiveCircuitJson.bytecode;

    // Create Noir instances
    mainNoir = new Noir(mainCircuitJson);
    recursiveNoir = new Noir(recursiveCircuitJson);
    // docs:end:setup

    // docs:start:backend_setup
    // Setup backend for main circuit (inner circuit)
    mainBackend = new UltraHonkBackend(
      mainBytecode,
      { threads: 8 },
      { recursive: true }
    );

    // Setup backend for recursive circuit (outer circuit)
    recursiveBackend = new UltraHonkBackend(
      recursiveBytecode,
      { threads: 8 },
      { recursive: false }
    );
    // docs:end:backend_setup
  });

  after(async function() {
    // Clean up resources
    if (mainBackend) await mainBackend.destroy();
    if (recursiveBackend) await recursiveBackend.destroy();
  });

  it('should execute witness generation for both circuits', async function() {
    this.timeout(60000);

    // docs:start:witness_generation
    // Generate witness for main circuit
    const { witness: mainWitness } = await mainNoir.execute({ x: 1, y: 2 });

    // Note: recursiveWitness will be generated later after we have the proof inputs
    // const { witness: recursiveWitness } = await recursiveNoir.execute(recursiveInputs);
    // docs:end:witness_generation

    // Test that witness was generated
    expect(mainWitness).to.exist;
    expect(mainWitness.length).to.be.greaterThan(0);
  });

  it('should generate proof and verification key for main circuit', async function() {
    this.timeout(120000);

    // Generate witness for main circuit
    const { witness: mainWitness } = await mainNoir.execute({ x: 1, y: 2 });

    // docs:start:proof_generation
    // Generate proof for main circuit with keccakZK for recursive verification
    const mainProofData = await mainBackend.generateProof(mainWitness, { keccakZK: true });

    // Generate verification key for main circuit
    const mainVerificationKey = await mainBackend.getVerificationKey({ keccakZK: true });
    // docs:end:proof_generation

    // Test that proof and VK were generated
    expect(mainProofData.proof).to.exist;
    expect(mainProofData.proof.length).to.be.greaterThan(0);
    expect(mainVerificationKey).to.exist;
    expect(mainVerificationKey.length).to.be.greaterThan(0);
  });


  it('should prepare recursive inputs from proof and verification key', async function() {
    this.timeout(120000);

    // Generate witness and proof for main circuit
    const { witness: mainWitness } = await mainNoir.execute({ x: 1, y: 2 });
    const mainProofData = await mainBackend.generateProof(mainWitness);
    const mainVerificationKey = await mainBackend.getVerificationKey();

    // docs:start:recursive_inputs
    // Convert proof and VK to fields for recursive circuit
    const barretenbergAPI = await Barretenberg.new({ threads: 1 });
    const vkAsFields = (await barretenbergAPI.acirVkAsFieldsUltraHonk(new RawBuffer(mainVerificationKey)))
      .map(field => field.toString());

    recursiveInputs = {
      proof: deflattenFields(mainProofData.proof),
      public_inputs: [2],
      verification_key: vkAsFields
    };

    await barretenbergAPI.destroy();
    // docs:end:recursive_inputs

    // Test that inputs were prepared correctly
    expect(recursiveInputs.proof).to.exist;
    expect(recursiveInputs.proof.length).to.be.greaterThan(0);
    expect(recursiveInputs.verification_key).to.exist;
    expect(recursiveInputs.verification_key.length).to.be.greaterThan(0);
    expect(recursiveInputs.public_inputs).to.deep.equal([2]);
  });

  it('should generate recursive proof', async function() {
    this.timeout(180000);

    // docs:start:recursive_proof
    // Generate witness for recursive circuit
    const { witness: recursiveWitness } = await recursiveNoir.execute(recursiveInputs);

    // Generate recursive proof
    const recursiveProofData = await recursiveBackend.generateProof(recursiveWitness);
    // docs:end:recursive_proof

    // Test that recursive proof was generated
    expect(recursiveProofData.proof).to.exist;
    expect(recursiveProofData.proof.length).to.be.greaterThan(0);
    expect(recursiveProofData.publicInputs).to.exist;

    // Verify the recursive proof
    const isValid = await recursiveBackend.verifyProof(recursiveProofData);
    expect(isValid).to.be.true;
  });
});
