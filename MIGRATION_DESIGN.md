# BB CLI → BB.js Msgpack Native Backend Migration

## Executive Summary

**Current State**: BBNativeRollupProver spawns bb CLI processes and uses file-based I/O for all proof operations
**Target State**: Direct bb.js msgpack API calls with in-memory buffer passing - **ZERO file I/O for proving**

**Impact**:
- Eliminate 196-280 file I/O operations per block
- Eliminate 28+ process spawns per block
- Expected 5-10× speedup for I/O-bound proving workloads

---

## Current Architecture Analysis

### File I/O Per Proof (Current)

For **each proof** (×28 for full epoch):

1. **Witness Generation (ACVM)**:
   - Write: `partial-witness.gz`
   - ACVM spawns, reads witness, generates partial witness
   - Read: `partial-witness.gz`

2. **Proof Generation (BB CLI)**:
   - Write: `{circuit}-bytecode` (from artifact)
   - Write: `{circuit}-vk` (from ServerCircuitVks)
   - Spawn `bb prove` process
   - BB reads: bytecode, VK, witness
   - BB writes: `proof`, `public_inputs`
   - Read: `proof`, `public_inputs`

3. **Verification (BB CLI)**:
   - Write: `proof`, `public_inputs`, `vk`
   - Spawn `bb verify` process
   - BB reads all three files
   - Output: exit code

4. **Cleanup**:
   - Delete 5-7 temporary files

**Total per proof**: ~7-10 file I/O operations, 2 process spawns

---

## New Architecture Design

### Core Principles

1. **Singleton API Instance**: Create Barretenberg instance once, reuse for all operations
2. **Buffer-Based Flow**: Pass Uint8Array buffers, never write/read files
3. **In-Memory VK Cache**: VKs already available via ServerCircuitVks - no file I/O needed
4. **Keep ACVM Separate**: ACVM witness generation remains file-based (different binary)
5. **Eliminate execute.ts Layer**: Call bb.js msgpack API directly from BBProver

### New Proof Flow

```typescript
// 1. Initialize once (constructor)
private bbApi: Barretenberg;

async init() {
  this.bbApi = await Barretenberg.new({
    threads: this.config.bbThreads || 1,
    bbPath: this.config.bbBinaryPath  // Point to native bb binary
  });
  // bb.js spawns: bb msgpack run --input <socket/shm>
  // Backend stays alive, accepts msgpack commands
}

// 2. Per proof (no files!)
async generateProofWithBBMsgpack(input, circuitType, ...) {
  // ACVM still needs partial witness file (unavoidable - different binary)
  const witnessBuffer = await fs.readFile(outputWitnessFile);

  // Get bytecode from artifact (already in memory)
  const artifact = getServerCircuitArtifact(circuitType);
  const bytecode = Buffer.from(artifact.bytecode, 'base64');

  // Get VK from cache (already in memory)
  const vkData = this.getVerificationKeyDataForCircuit(circuitType);
  const vk = vkData.keyAsBytes;

  // Generate proof via msgpack API - ALL IN MEMORY!
  const { proof, publicInputs } = await this.bbApi.circuitProve({
    witness: witnessBuffer,
    circuit: {
      name: circuitType,
      bytecode,
      verificationKey: vk,  // Provide VK = faster proving
    },
    settings: getProofSettingsFromFlavor(
      getUltraHonkFlavorForCircuit(circuitType)
    ),
  });

  // proof and publicInputs are Uint8Array[] (arrays of 32-byte field elements)
  // Convert to Aztec proof format
  return convertMsgpackProofToRecursiveProof(proof, publicInputs, vkData, proofLength);
}

// 3. Verification (no files!)
async verifyWithBBMsgpack(proof: Proof, vkData: VerificationKeyData, flavor: UltraHonkFlavor) {
  // Convert Proof object to msgpack format
  const { proofFields, publicInputFields } = convertProofToMsgpackFormat(proof);

  // Verify via msgpack API - ALL IN MEMORY!
  const { verified } = await this.bbApi.circuitVerify({
    verificationKey: vkData.keyAsBytes,
    publicInputs: publicInputFields,  // Uint8Array[]
    proof: proofFields,               // Uint8Array[]
    settings: getProofSettingsFromFlavor(flavor),
  });

  if (!verified) {
    throw new ProvingError('Proof verification failed');
  }
}

// 4. Cleanup (destructor)
async destroy() {
  await this.bbApi?.destroy();
}
```

---

## Detailed Migration Plan

### Phase 1: Infrastructure Setup

**Files to Create:**

1. **`yarn-project/bb-prover/src/bb/msgpack_api.ts`**
   ```typescript
   /**
    * Wrapper around bb.js msgpack API for Aztec protocol circuit proving.
    * Handles buffer conversions and proof format translations.
    */
   export class BBMsgpackProver {
     constructor(private api: Barretenberg) {}

     async proveCircuit(...): Promise<RecursiveProof<N>> { ... }
     async verifyCircuit(...): Promise<void> { ... }

     // Helper: Convert Aztec Proof ↔ Msgpack format
     private toMsgpackProof(proof: Proof): { proof: Uint8Array[], publicInputs: Uint8Array[] }
     private fromMsgpackProof(proof: Uint8Array[], publicInputs: Uint8Array[], ...): RecursiveProof<N>
   }
   ```

2. **Update `yarn-project/bb-prover/src/config.ts`**
   ```typescript
   export interface BBConfig {
     bbBinaryPath: string;
     bbWorkingDirectory: string;  // Still needed for ACVM witness temp files
     bbThreads?: number;           // NEW: thread count for bb.js
     bbSkipCleanup: boolean;
   }
   ```

### Phase 2: Refactor BBNativeRollupProver

**File: `yarn-project/bb-prover/src/prover/server/bb_prover.ts`**

**Changes:**

1. **Add bb.js API instance**:
   ```typescript
   export class BBNativeRollupProver implements ServerCircuitProver {
     private bbApi!: Barretenberg;
     private bbMsgpackProver!: BBMsgpackProver;

     static async new(config: BBProverConfig, telemetry: TelemetryClient) {
       const prover = new BBNativeRollupProver(config, telemetry);

       // Initialize bb.js native backend
       prover.bbApi = await Barretenberg.new({
         threads: config.bbThreads || 1,
         bbPath: config.bbBinaryPath,
       });

       prover.bbMsgpackProver = new BBMsgpackProver(prover.bbApi);

       return prover;
     }
   }
   ```

2. **Replace `generateProofWithBB`**:
   ```typescript
   private async generateProofWithBBMsgpack<Input, Output>(
     input: Input,
     circuitType: ServerProtocolArtifact,
     convertInput: (input: Input) => WitnessMap,
     convertOutput: (outputWitness: WitnessMap) => Output,
     workingDirectory: string,
   ): Promise<{ circuitOutput: Output; proof: RecursiveProof<N> }> {
     // Still use ACVM for witness generation (different binary)
     const outputWitnessFile = path.join(workingDirectory, 'partial-witness.gz');
     const simulator = new NativeACVMSimulator(...);
     const witnessResult = await simulator.executeProtocolCircuit(...);
     const output = convertOutput(witnessResult.witness);

     // Read witness buffer
     const witnessBuffer = await fs.readFile(outputWitnessFile);

     // Get circuit data (in-memory)
     const artifact = getServerCircuitArtifact(circuitType);
     const vkData = this.getVerificationKeyDataForCircuit(circuitType);

     // Prove via msgpack - NO FILE I/O!
     const proof = await this.bbMsgpackProver.proveCircuit(
       witnessBuffer,
       Buffer.from(artifact.bytecode, 'base64'),
       vkData.keyAsBytes,
       circuitType,
       proofLength,
     );

     return { circuitOutput: output, proof };
   }
   ```

3. **Replace `verifyWithKeyInternal`**:
   ```typescript
   private async verifyWithKeyMsgpack(
     proof: Proof,
     verificationKey: { keyAsBytes: Buffer },
     flavor: UltraHonkFlavor,
   ) {
     // Verify via msgpack - NO FILE I/O!
     await this.bbMsgpackProver.verifyCircuit(
       proof,
       verificationKey.keyAsBytes,
       flavor,
     );

     logger.info(`Successfully verified proof via msgpack API`);
   }
   ```

4. **Update `createRecursiveProof`** to call new methods:
   ```typescript
   private async createRecursiveProof<...>(...): Promise<{...}> {
     const operation = async (bbWorkingDirectory: string) => {
       // Use new msgpack method
       const { proof, circuitOutput } = await this.generateProofWithBBMsgpack(
         input,
         circuitType,
         convertInput,
         convertOutput,
         bbWorkingDirectory,
       );

       // No more readProofsFromOutputDirectory!
       return { circuitOutput, proof };
     };

     return await this.runInDirectory(operation);
   }
   ```

5. **Add cleanup**:
   ```typescript
   async destroy() {
     await this.bbApi?.destroy();
   }
   ```

### Phase 3: AVM Circuit Migration

**File: `yarn-project/bb-prover/src/bb/execute.ts`**

**Add msgpack version of AVM proving:**

```typescript
export async function generateAvmProofMsgpack(
  api: Barretenberg,
  input: AvmCircuitInputs,
  log: Logger,
): Promise<{ proof: Uint8Array[], vk: Uint8Array }> {
  // Serialize inputs
  const inputsBuffer = input.serializeWithMessagePack();

  // Call AVM-specific msgpack command
  const result = await api.avmProve({
    inputs: inputsBuffer,
  });

  return {
    proof: result.proof,
    vk: result.verificationKey,
  };
}

export async function verifyAvmProofMsgpack(
  api: Barretenberg,
  proof: Uint8Array[],
  publicInputs: AvmCircuitPublicInputs,
  vk: Uint8Array,
  log: Logger,
): Promise<void> {
  const { verified } = await api.avmVerify({
    proof,
    publicInputs: publicInputs.serializeWithMessagePack(),
    verificationKey: vk,
  });

  if (!verified) {
    throw new Error('AVM proof verification failed');
  }
}
```

### Phase 4: Deprecation & Cleanup

**After migration is complete and tested:**

1. **Mark old methods as deprecated**:
   ```typescript
   /** @deprecated Use generateProofWithBBMsgpack instead */
   private async generateProofWithBB(...) { ... }
   ```

2. **Remove file-based execute.ts functions**:
   - Keep only msgpack versions
   - Remove `executeBB`, `generateProof`, `verifyProof`, etc.

3. **Simplify directory management**:
   - `bbWorkingDirectory` only needed for ACVM witness temp files
   - Fewer temp directories created

---

## Testing Strategy

### Unit Tests

1. **Test proof format conversion**:
   - Aztec Proof ↔ Msgpack Uint8Array[] conversion
   - Field element packing/unpacking

2. **Test msgpack API wrapper**:
   - Mock Barretenberg API
   - Verify correct parameters passed

### Integration Tests

1. **Single circuit proving**:
   - Generate proof with msgpack API
   - Verify with msgpack API
   - Compare proof output with CLI version

2. **Full rollup flow**:
   - Run complete base → merge → root flow
   - Verify all proofs validate
   - Check orchestrator integration

### Performance Tests

1. **Benchmark file I/O elimination**:
   - Measure proof generation time: CLI vs msgpack
   - Measure full block proving: before vs after
   - Expected: 5-10× speedup

2. **Memory usage**:
   - Monitor memory with single API instance
   - Check for leaks in long-running tests

---

## Migration Checklist

- [ ] Create `msgpack_api.ts` wrapper
- [ ] Update `BBConfig` with new options
- [ ] Add Barretenberg instance to BBNativeRollupProver
- [ ] Implement `generateProofWithBBMsgpack`
- [ ] Implement `verifyWithKeyMsgpack`
- [ ] Refactor `createRecursiveProof` to use msgpack
- [ ] Refactor `verifyProof` to use msgpack
- [ ] Migrate AVM proving to msgpack
- [ ] Migrate AVM verification to msgpack
- [ ] Update BBNativePrivateKernelProver if needed
- [ ] Update BBVerifier if needed
- [ ] Add unit tests for buffer conversions
- [ ] Add integration tests for proof flow
- [ ] Run full e2e tests
- [ ] Benchmark performance improvements
- [ ] Deprecate old file-based methods
- [ ] Remove execute.ts CLI functions
- [ ] Update documentation

---

## Benefits

### Performance
- **Eliminate 196-280 file I/O operations** per epoch
- **Eliminate 28+ process spawns** per epoch
- **5-10× faster** proving for I/O-bound workloads
- **Reduced disk pressure** on proving infrastructure

### Architecture
- **Cleaner separation**: bb.js handles all BB operations
- **Persistent backend**: One long-running bb process vs 28+ short-lived spawns
- **Easier debugging**: In-process communication, better error messages
- **Better resource management**: Thread pool reuse, memory efficiency

### Maintainability
- **Fewer moving parts**: No file coordination, no temp directory cleanup
- **Type safety**: TypeScript types for all proof structures
- **Testability**: Mock bb.js API instead of mocking fs/process
- **Future-proof**: Native backend is the strategic direction

---

## Risks & Mitigations

### Risk: bb.js msgpack API bugs
**Mitigation**:
- Run both old and new paths in parallel initially
- Extensive integration testing
- Gradual rollout with feature flag

### Risk: Memory leaks with persistent backend
**Mitigation**:
- Proper cleanup in `destroy()`
- Memory profiling in long-running tests
- Monitor production memory usage

### Risk: ACVM still requires file I/O
**Mitigation**:
- Accept this limitation (different binary)
- Future: migrate ACVM to in-memory API when available
- Witness I/O is only 1-2 ops vs 7-10 total

---

## Timeline Estimate

1. **Phase 1 (Infrastructure)**: 1-2 days
2. **Phase 2 (BBProver Refactor)**: 2-3 days
3. **Phase 3 (AVM Migration)**: 1-2 days
4. **Phase 4 (Testing & Cleanup)**: 2-3 days

**Total**: ~6-10 days for complete migration
