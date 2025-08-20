# ECCVM Fuzzer

This directory contains a comprehensive fuzzer for testing the ECCVM (Elliptic Curve Circuit Virtual Machine) circuit builder and trace checker.

## Overview

The ECCVM fuzzer integrates FieldVM for scalar computation and tests the ECCVM circuit builder with various operation sequences. It focuses on the `check_circuit` mechanism without full proving to avoid potential security issues with proving key generation or proof verification.

## Architecture

### Input Structure

The fuzzer uses a flexible input structure that allows for variable-sized operation sequences:

```cpp
struct SingleOp {
    OpType op_type;        // Operation type (ADD, MUL, EQ_AND_RESET, MERGE, EMPTY_ROW)
    uint8_t generator_index; // Generator index with negation control
    uint8_t scalar_index;    // Index into FieldVM scalar array
};

struct FuzzerInput {
    uint8_t fieldvm_bytes_to_consume;                   // How many bytes FieldVM should consume (1-2048)
    uint8_t fieldvm_data[MAX_FIELDVM_BYTES_TO_CONSUME]; // FieldVM instructions (2048 bytes)
};
```

### Input Layout

The complete input consists of:
1. **FuzzerInput header** (2049 bytes):
   - Byte 0: FieldVM bytes to consume (1-2048)
   - Bytes 1-2048: FieldVM instruction data
2. **Variable-length operation sequence**:
   - Each operation is 3 bytes (SingleOp structure)
   - Number of operations = (total_size - 2049) / 3

### Operation Types

- `ADD`: Add a generator point to the accumulator
- `MUL`: Multiply a generator point by a FieldVM-computed scalar
- `EQ_AND_RESET`: Check equality and reset the accumulator
- `MERGE`: Merge operation (with automatic EQ_AND_RESET)
- `EMPTY_ROW`: Add an empty row for testing

### Generator Index Format

Each generator index is an 8-bit value where:
- **Lower 7 bits (0-6)**: Select the generator point (0-4 for generators, 5 for infinity)
- **Top bit (7)**: Controls point negation (0 = no negation, 1 = negate the point)

### Scalar Selection

Each scalar index is an 8-bit value that selects from the 32 FieldVM-computed scalars:
- **Value 0-31**: Direct index into the precomputed scalars array
- **Value 32-255**: Uses modulo 32 to wrap around (e.g., 32 → 0, 33 → 1, etc.)

## FieldVM Integration

The fuzzer integrates FieldVM to compute scalars for multiplication operations:

1. **FieldVM Execution**: Runs FieldVM once at the beginning with controlled byte consumption (1-2048 bytes)
2. **Performance Optimization**: Disables heavy operations (inversion, square root, batch inversion) for better performance
3. **Scalar Extraction**: Extracts all 32 field elements from FieldVM's internal state
4. **Generator Creation**: Uses first 16 FieldVM scalars to create 4 linear combinations of base generators:
   - Generator 0 = base_gen[0]*scalar[0] + base_gen[1]*scalar[1] + base_gen[2]*scalar[2] + base_gen[3]*scalar[3]
   - Generator 1 = base_gen[0]*scalar[4] + base_gen[1]*scalar[5] + base_gen[2]*scalar[6] + base_gen[3]*scalar[7]
   - Generator 2 = base_gen[0]*scalar[8] + base_gen[1]*scalar[9] + base_gen[2]*scalar[10] + base_gen[3]*scalar[11]
   - Generator 3 = base_gen[0]*scalar[12] + base_gen[1]*scalar[13] + base_gen[2]*scalar[14] + base_gen[3]*scalar[15]
5. **Operation Scalars**: Uses scalar_indices to select from all 32 FieldVM scalars for multiplication operations

## Key Features

- **FieldVM Integration**: Uses FieldVM to compute scalars for multiplication operations
- **Performance Optimized**: Disables heavy FieldVM operations (inversion, square root, batch inversion) for better performance
- **Pre-computed Scalars**: Runs FieldVM once at the beginning to generate exactly 32 scalars
- **Linear Combination Generators**: Creates 4 generators as linear combinations of base generators using FieldVM scalars
- **Variable Operation Count**: Supports any number of operations based on input size
- **Point Negation**: Top bit of generator indices controls point negation for ADD/MUL operations
- **Robust Error Handling**: Includes comprehensive error reporting and operation logging
- **Circuit Validation**: Tests the `check_circuit` mechanism without full proving

## Building and Running

### Prerequisites

- CMake 3.20+
- C++20 compiler
- libFuzzer

### Build Configuration

```bash
# Configure with fuzzing enabled
cmake -B build-fuzzing -S . -DCMAKE_BUILD_TYPE=Release -DFUZZING=ON

# Build the fuzzer
cmake --build build-fuzzing --parallel --target eccvm_eccvm_fuzzer
```

### Running the Fuzzer

```bash
# Run the ECCVM fuzzer
./bin/eccvm_eccvm_fuzzer

# Run with specific input file
./bin/eccvm_eccvm_fuzzer input_file

# Run with corpus directory
./bin/eccvm_eccvm_fuzzer corpus_directory/
```

## Input Format Examples

### Minimal Input (2052 bytes)
- 2049 bytes: FuzzerInput header
- 3 bytes: Single operation (SingleOp)

### Typical Input (2061 bytes)
- 2049 bytes: FuzzerInput header
- 12 bytes: 4 operations (4 × SingleOp)

### Large Input (4096 bytes)
- 2049 bytes: FuzzerInput header
- 2047 bytes: ~682 operations (2047 ÷ 3 ≈ 682 SingleOp structures)

## FieldVM Instruction Format

The FieldVM data section (up to 2048 bytes) contains instructions for scalar computation:

- **Settings** (4 bytes): VM operation settings
- **Instructions**: Sequence of field arithmetic operations
- **Supported Operations**: ADD, MUL, SUB, DIV, NEG, SQR, POW, etc.
- **Disabled Operations**: INV (inversion), SQRT (square root), BATCH_INVERT (batch inversion) - disabled for performance

Each instruction includes:
- **Opcode** (1 byte): Operation type
- **Indices** (1-3 bytes): Operand indices
- **Values** (0-32 bytes): Constant values for SET_VALUE operations

### Performance Optimizations

The fuzzer disables computationally expensive FieldVM operations to improve performance:
- **Inversion (INV)**: Disabled - uses division instead when needed
- **Square Root (SQRT)**: Disabled - not needed for scalar generation
- **Batch Inversion (BATCH_INVERT)**: Disabled - not needed for scalar generation

## Example Output

```
ERROR: ECCVMTraceChecker::check returned false!
Input parameters:
  num_operations: 5
  operations: 1 0 2 1 3
  generator_indices: 0 129 0 130 0
  FieldVM bytes to consume: 256
Operation sequence that caused failure:
Operation 0: MUL(generator=0, scalar=12345)
Operation 1: ADD(generator=1, negated)
Operation 2: EQ_AND_RESET
Operation 3: MUL(generator=2, negated, scalar=67890)
Operation 4: MERGE
```

## Security Considerations

- **No Full Proving**: Uses only the `check_circuit` mechanism to avoid proving key generation
- **Input Validation**: Validates all input parameters and array bounds
- **Robust Indexing**: Uses modulo arithmetic to prevent out-of-bounds access
- **Circuit Completeness**: Ensures proper operation sequence with EQ_AND_RESET before MERGE
- **Point Negation Testing**: Ensures the circuit handles negative points correctly
- **Variable Input Size**: Tests with different operation counts and FieldVM data sizes
- **Performance Optimizations**: Disables heavy FieldVM operations to prevent DoS attacks and improve fuzzer efficiency

## Troubleshooting

### Common Issues

1. **Build Failures**: Ensure FUZZING=ON is set during CMake configuration
2. **Input Size Errors**: Input must be at least 2052 bytes (2049 + 3 for one operation)
3. **FieldVM Failures**: Check FieldVM instruction format and data validity
4. **Circuit Validation Failures**: Review operation sequence and scalar values

### Debug Mode

To enable debug output, modify the FieldVM constructor:
```cpp
FieldVM<Fr> field_vm(true, 65536); // Enable debug output
```

## Contributing

When adding new features to the fuzzer:

1. Maintain the flexible input size structure
2. Update error reporting to include new operation details
3. Test with various input sizes and operation sequences
4. Document any new security considerations
5. Ensure FieldVM integration remains robust

## References

- [ECCVMCircuitBuilder Tests](../eccvm_circuit_builder.test.cpp)
- [ECCVMTraceChecker](../eccvm_trace_checker.cpp)
- [ECCOpQueue](../op_queue/ecc_op_queue.hpp)
- [FieldVM Implementation](../../ecc/fields/field.fuzzer.hpp)
