# KZG Polynomial Commitment Module

This module integrates the Ethereum c-kzg-4844 library into Barretenberg, providing KZG polynomial commitment functionality including the critical `compute_kzg_proof` function needed by blob-lib.

## Integration Status

✅ **Completed:**
- Copied c-kzg-4844 source code (EIP-4844 implementation)
- Copied blst library (BLS12-381 cryptography)
- Created c_bind.cpp and c_bind.hpp for WASM exports
- Created CMakeLists.txt for building the module
- Updated parent CMakeLists.txt to include kzg subdirectory

## Source Files

The module includes:
- `c-kzg-4844` source from: https://github.com/ethereum/c-kzg-4844
- `blst` library from: https://github.com/supranational/blst
- Custom C++ bindings in `c_bind.cpp` / `c_bind.hpp`

## Exported Functions

The following functions are exported for WASM/JS use:

1. **`kzg_load_trusted_setup`** - Initialize KZG with trusted setup
2. **`kzg_free_trusted_setup`** - Cleanup
3. **`kzg_blob_to_kzg_commitment`** - Compute KZG commitment from blob
4. **`kzg_compute_kzg_proof`** - ⭐ **Compute proof at arbitrary point z** (returns proof + evaluation)
5. **`kzg_compute_blob_kzg_proof`** - Compute blob proof for EIP-4844
6. **`kzg_verify_kzg_proof`** - Verify KZG proof
7. **`kzg_verify_blob_kzg_proof`** - Verify blob proof
8. **`kzg_verify_blob_kzg_proof_batch`** - Batch verify multiple proofs

## Next Steps

### 1. Build Barretenberg with KZG Module

```bash
cd barretenberg/cpp
./bootstrap.sh
```

This will compile the KZG module into barretenberg.

### 2. Regenerate bb.js Bindings

After building barretenberg, regenerate the TypeScript bindings:

```bash
cd barretenberg/ts
yarn build
```

This will expose the KZG functions in bb.js.

### 3. Update blob-lib to Use bb.js

Modify `yarn-project/blob-lib` to use the KZG functions from bb.js instead of c-kzg:

```typescript
import { BarretenbergSync } from '@aztec/bb.js';

const bb = await BarretenbergSync.new();

// Example: compute_kzg_proof
const blob = Buffer.alloc(131072); // 4096 * 32 bytes
const z = Buffer.alloc(32);
const proof = Buffer.alloc(48);
const y = Buffer.alloc(32);

bb.kzg_compute_kzg_proof(blob, z, proof, y);
```

### 4. Handle Trusted Setup

The KZG module requires a trusted setup file. Options:
- Embed the setup in the WASM (increases size by ~800KB)
- Load from file path
- Download on first use

The `trusted_setup.txt` file is included in this directory.

## Benefits of This Approach

- ✅ No C toolchain required for blob-lib
- ✅ WASM support (works in browsers)
- ✅ All required functions including `compute_kzg_proof`
- ✅ Integrated with existing Barretenberg build system
- ✅ Consistent with other barretenberg crypto modules

## Testing

After integration, test with:

```bash
cd yarn-project/blob-lib
yarn test
```

All blob-lib tests should pass using the bb.js KZG implementation.
