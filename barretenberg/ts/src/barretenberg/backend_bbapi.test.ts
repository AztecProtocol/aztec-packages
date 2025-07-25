import { BbApiUltraHonkBackend } from './backend_bbapi.js';
import { gzip } from 'pako';

// Example test to demonstrate the new BbApiUltraHonkBackend usage
describe('BbApiUltraHonkBackend', () => {
  // Example bytecode for a simple circuit (this would normally come from Noir compiler)
  const mockBytecode = 'H4sIAAAAAAAAA+3Y...'; // Base64 encoded gzipped bytecode
  
  // Example witness data
  const mockWitness = new Uint8Array([
    // Witness data would go here
  ]);

  it('should create a new backend instance', () => {
    const backend = new BbApiUltraHonkBackend(mockBytecode);
    expect(backend).toBeDefined();
  });

  it('should generate and verify a proof', async () => {
    const backend = new BbApiUltraHonkBackend(mockBytecode);
    
    // Compress witness
    const compressedWitness = gzip(mockWitness);
    
    // Generate proof
    const proofData = await backend.generateProof(compressedWitness);
    expect(proofData.proof).toBeDefined();
    expect(proofData.publicInputs).toBeDefined();
    
    // Verify proof
    const isValid = await backend.verifyProof(proofData);
    expect(isValid).toBe(true);
    
    await backend.destroy();
  });

  it('should generate proof with different oracle hash types', async () => {
    const backend = new BbApiUltraHonkBackend(mockBytecode);
    
    // Test with keccak
    const compressedWitness = gzip(mockWitness);
    const proofDataKeccak = await backend.generateProof(compressedWitness, { keccak: true });
    expect(proofDataKeccak.proof).toBeDefined();
    
    // Test with starknet
    const proofDataStarknet = await backend.generateProof(compressedWitness, { starknet: true });
    expect(proofDataStarknet.proof).toBeDefined();
    
    await backend.destroy();
  });

  it('should get verification key', async () => {
    const backend = new BbApiUltraHonkBackend(mockBytecode);
    
    const vk = await backend.getVerificationKey();
    expect(vk).toBeInstanceOf(Uint8Array);
    expect(vk.length).toBeGreaterThan(0);
    
    await backend.destroy();
  });

  it('should generate Solidity verifier', async () => {
    const backend = new BbApiUltraHonkBackend(mockBytecode);
    
    const solidityCode = await backend.getSolidityVerifier();
    expect(solidityCode).toContain('contract');
    expect(solidityCode).toContain('function verify');
    
    await backend.destroy();
  });

  it('should generate recursive proof artifacts', async () => {
    const backend = new BbApiUltraHonkBackend(mockBytecode);
    
    // Generate a proof first
    const compressedWitness = gzip(mockWitness);
    const proofData = await backend.generateProof(compressedWitness);
    
    // Get recursive artifacts
    const artifacts = await backend.generateRecursiveProofArtifacts(
      proofData.proof,
      proofData.publicInputs.length
    );
    
    expect(artifacts.proofAsFields).toBeDefined();
    expect(artifacts.vkAsFields).toBeDefined();
    expect(artifacts.vkAsFields.length).toBeGreaterThan(0);
    
    await backend.destroy();
  });
});