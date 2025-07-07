# Multi-Field Fuzzer

## Overview

The `multi_field.fuzzer.cpp` is created to detect bugs in the native field implementations

## Supported Field Types

The fuzzer tests the following field types:

- **BN254**: 
  - `fq` (base field)
  - `fr` (scalar field)
- **Secp256k1**:
  - `fq` (base field) 
  - `fr` (scalar field)
- **Secp256r1**:
  - `fq` (base field)
  - `fr` (scalar field)

## Input Format

The fuzzer expects input data in a specific format:

```
[Phase Header][Instruction Data][Phase Header][Instruction Data]...
```

### Phase Header Structure
```cpp
struct VMPhaseHeader {
    uint8_t field_type; // Field type (0-5)
    uint8_t steps;      // Number of steps (0-63)
};
```

### Field Type Mapping
- `0`: BN254_FQ
- `1`: BN254_FR  
- `2`: SECP256K1_FQ
- `3`: SECP256K1_FR
- `4`: SECP256R1_FQ
- `5`: SECP256R1_FR

## Execution Flow

1. **Phase Reading**: Reads phase headers directly from input data
2. **Field Selection**: Validates and normalizes field type and step count
3. **VM Execution**: Creates appropriate FieldVM instance and executes instructions
4. **State Management**: Maintains state between phases for continuity
5. **Error Detection**: Checks internal state consistency after each phase
6. **Debug Information**: Provides detailed error reporting when failures occur

## Key Features

### State Continuity
- Each phase can import state from the previous phase
- State is reduced to field modulus to ensure validity
- Cross-field state transitions are handled safely

### Error Detection
- Internal state consistency checks after each phase
- Detailed debug output for failed phases
- Graceful handling of malformed input data

### Performance Optimizations
- Streaming execution without pre-parsing
- Minimal memory allocations
- Early termination on errors

## Usage

### Building
```bash
# Build with fuzzing support
cmake --preset fuzzing && cd build-fuzzing && cmake --build . --parallel --target ecc_multi_field_fuzzer
```

### Running
```bash
./bin/ecc_multi_field_fuzzer
```
## Debugging

When the fuzzer detects a failure:

1. **Error Information**: Field type, step count, and instruction data are logged
2. **Debug VM**: A debug VM instance is created to provide detailed analysis
3. **State Verification**: Initial state import is verified
4. **Reproduction**: Failed inputs can be reproduced for analysis

## Integration

This fuzzer should be integrated into the broader security testing framework and is referenced in the main security documentation (`security/Tooling.md`).
