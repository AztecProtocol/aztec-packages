# BBAPI - Barretenberg Binary API

BBAPI is a unified API interface for Barretenberg that provides a consistent way to interact with proving systems across different language bindings.

## Overview

The BBAPI (Barretenberg Binary API) provides a msgpack-based RPC interface that enables:

1. **Unified Interface**: Same API commands work across C++, TypeScript, and other language bindings
2. **In-Memory Operations**: Works with byte buffers instead of file I/O for better performance
3. **Extensibility**: Easy to add new commands and functionality
4. **Type Safety**: Strongly typed request/response structures

## Architecture

### Command Structure

Each BBAPI command follows a consistent pattern:

```cpp
struct CommandName {
    // Input parameters
    CircuitInput circuit;
    std::vector<uint8_t> witness;
    ProofSystemSettings settings;
    
    struct Response {
        // Output data
        std::vector<Fr> public_inputs;
        std::vector<Fr> proof;
    };
    
    Response execute(const BBApiRequest& request = {}) &&;
};
```

### Available Commands

#### Core Proving Commands

- **CircuitProve**: Generate a proof for a circuit
- **CircuitVerify**: Verify a proof
- **CircuitComputeVk**: Compute verification key
- **CircuitInfo**: Get circuit statistics (gate count, etc.)
- **CircuitWriteSolidityVerifier**: Generate Solidity verifier contract

#### Field Conversion Commands

- **ProofAsFields**: Convert proof to field elements
- **VkAsFields**: Convert verification key to field elements

#### Development Commands

- **CircuitCheck**: Check if witness satisfies circuit constraints
- **CircuitBenchmark**: Benchmark proving performance
- **CircuitProveAndVerify**: Prove and immediately verify (for testing)

### Proof System Settings

The `ProofSystemSettings` structure controls proof generation:

```cpp
struct ProofSystemSettings {
    bool ipa_accumulation;      // Use IPA accumulation (for rollup flavor)
    std::string oracle_hash_type; // "poseidon2", "keccak", "starknet"
    bool disable_zk;           // Disable zero-knowledge property
    uint32_t honk_recursion;   // Recursion mode
    bool recursive;            // Deprecated flag
};
```

## Usage Examples

### C++ CLI

```bash
# Generate proof
bb prove --scheme ultra_honk --bytecode circuit.acir --witness witness.gz -o proof

# Convert proof to fields
bb proof_as_fields --proof proof -o proof_fields.json

# Convert VK to fields
bb vk_as_fields --vk vk -o vk_fields.json
```

### TypeScript

```typescript
import { BbApiUltraHonkBackend } from '@aztec/bb.js';

const backend = new BbApiUltraHonkBackend(bytecode);
const proofData = await backend.generateProof(witness);
const isValid = await backend.verifyProof(proofData);
```

### Direct BBAPI Usage

```cpp
// Create circuit input
CircuitInput circuit{
    .name = "my_circuit",
    .bytecode = bytecode_bytes,
    .verification_key = {}
};

// Prove
CircuitProve prove_cmd{
    .circuit = circuit,
    .witness = witness_bytes,
    .settings = { .oracle_hash_type = "poseidon2" }
};
auto prove_response = std::move(prove_cmd).execute();

// Convert proof to fields
ProofAsFields fields_cmd{ .proof = prove_response.proof };
auto fields_response = std::move(fields_cmd).execute();
```

## Flavor Selection

The BBAPI automatically selects the appropriate UltraHonk flavor based on settings:

1. **UltraRollupFlavor**: When `ipa_accumulation = true`
2. **UltraZKFlavor**: When `oracle_hash_type = "poseidon2"` and `disable_zk = false`
3. **UltraFlavor**: When `oracle_hash_type = "poseidon2"` and `disable_zk = true`
4. **UltraKeccakZKFlavor**: When `oracle_hash_type = "keccak"` and `disable_zk = false`
5. **UltraKeccakFlavor**: When `oracle_hash_type = "keccak"` and `disable_zk = true`
6. **UltraStarknetFlavor**: When `oracle_hash_type = "starknet"` (if enabled)

## Migration from Old API

The old file-based API (`api_ultra_honk.cpp`) has been replaced with a wrapper around BBAPI. This maintains backward compatibility while using the new unified interface internally.

### Benefits of Migration:
- Better performance (no file I/O)
- Consistent behavior across languages
- Access to new features
- Better error handling

## Testing

Comprehensive tests are provided in `bbapi_ultra_honk.test.cpp`:

```bash
# Run all BBAPI tests
./barretenberg_test --gtest_filter="BBApiUltraHonkTest.*"
```

## Future Work

- Add streaming support for large circuits
- Implement progress callbacks
- Add more detailed benchmarking metrics
- Support for custom proving keys