# Migration Guide: UltraHonkBackend to BbApiUltraHonkBackend

This guide helps you migrate from the old `UltraHonkBackend` to the new `BbApiUltraHonkBackend` which uses the unified bbapi interface.

## Benefits of Migration

1. **Unified API**: The new backend uses the same API as the C++ CLI, making it easier to maintain consistency across different language bindings.
2. **Better Performance**: Direct use of bbapi commands reduces overhead from the old WASM bindings.
3. **Future-proof**: All new features will be added to bbapi, while the old API is being phased out.

## Basic Usage Comparison

### Old Way (UltraHonkBackend)

```typescript
import { UltraHonkBackend } from '@aztec/bb.js';

const backend = new UltraHonkBackend(bytecode);
const proofData = await backend.generateProof(compressedWitness);
const isValid = await backend.verifyProof(proofData);
```

### New Way (BbApiUltraHonkBackend)

```typescript
import { BbApiUltraHonkBackend } from '@aztec/bb.js';

const backend = new BbApiUltraHonkBackend(bytecode);
const proofData = await backend.generateProof(compressedWitness);
const isValid = await backend.verifyProof(proofData);
```

## API Compatibility

The new `BbApiUltraHonkBackend` maintains the same public API as `UltraHonkBackend`, making migration straightforward:

- `generateProof(compressedWitness, options?)` - Same signature and behavior
- `verifyProof(proofData, options?)` - Same signature and behavior
- `getVerificationKey(options?)` - Same signature and behavior
- `getSolidityVerifier(vk?)` - Same signature and behavior
- `generateRecursiveProofArtifacts(proof, numOfPublicInputs)` - Same signature and behavior
- `destroy()` - Same signature and behavior

## Options Support

Both backends support the same options:

```typescript
interface BackendOptions {
  keccak?: boolean;    // For EVM verification
  keccakZK?: boolean;  // For EVM verification with zero-knowledge
  starknet?: boolean;  // For Starknet/Garaga verification
  starknetZK?: boolean; // For Starknet/Garaga verification with zero-knowledge
}
```

## Migration Steps

1. **Update Import**: Change your import statement
   ```typescript
   // Old
   import { UltraHonkBackend } from '@aztec/bb.js';
   
   // New
   import { BbApiUltraHonkBackend } from '@aztec/bb.js';
   ```

2. **Update Class Name**: Replace `UltraHonkBackend` with `BbApiUltraHonkBackend`
   ```typescript
   // Old
   const backend = new UltraHonkBackend(bytecode);
   
   // New
   const backend = new BbApiUltraHonkBackend(bytecode);
   ```

3. **No Other Changes Required**: The rest of your code should work without modification.

## Example: Complete Migration

### Before
```typescript
import { UltraHonkBackend } from '@aztec/bb.js';

async function proveAndVerify(bytecode: string, witness: Uint8Array) {
  const backend = new UltraHonkBackend(bytecode);
  
  try {
    // Generate proof
    const proofData = await backend.generateProof(witness);
    
    // Verify proof
    const isValid = await backend.verifyProof(proofData);
    console.log('Proof is valid:', isValid);
    
    // Get verification key
    const vk = await backend.getVerificationKey();
    console.log('VK size:', vk.length);
    
    // Generate Solidity verifier
    const solidityCode = await backend.getSolidityVerifier();
    console.log('Solidity verifier generated');
    
    return { proofData, vk, solidityCode };
  } finally {
    await backend.destroy();
  }
}
```

### After
```typescript
import { BbApiUltraHonkBackend } from '@aztec/bb.js';

async function proveAndVerify(bytecode: string, witness: Uint8Array) {
  const backend = new BbApiUltraHonkBackend(bytecode);
  
  try {
    // Generate proof
    const proofData = await backend.generateProof(witness);
    
    // Verify proof
    const isValid = await backend.verifyProof(proofData);
    console.log('Proof is valid:', isValid);
    
    // Get verification key
    const vk = await backend.getVerificationKey();
    console.log('VK size:', vk.length);
    
    // Generate Solidity verifier
    const solidityCode = await backend.getSolidityVerifier();
    console.log('Solidity verifier generated');
    
    return { proofData, vk, solidityCode };
  } finally {
    await backend.destroy();
  }
}
```

## Testing Your Migration

After migrating, run your existing test suite to ensure everything works correctly. The new backend should produce identical results to the old one.

## Rollback Plan

If you encounter issues, you can easily rollback by reverting the import and class name changes. Both backends will coexist during the transition period.

## Future Deprecation

The old `UltraHonkBackend` will be deprecated in a future release. We recommend migrating to `BbApiUltraHonkBackend` as soon as possible to access new features and improvements.