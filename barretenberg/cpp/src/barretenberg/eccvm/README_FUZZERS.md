# ECCVM Fuzzer

This document describes the ECCVM (Elliptic Curve Circuit Virtual Machine) fuzzer implementation, which provides comprehensive testing of the ECCVM circuit builder and trace checker.

## Overview

The ECCVM fuzzer generates random ECC operations to test the ECCVM circuit builder. It checks the correctness of the trace without constructing the full proof.


## Architecture

### Data Structures

The fuzzer operates on the following data structures:

```cpp
// Operation types for the fuzzer
enum class OpType : uint8_t { 
    ADD = 0,           // Add a point to the accumulator
    MUL = 1,           // Multiply a point by a scalar and add to accumulator
    EQ_AND_RESET = 2,  // Check equality and reset accumulator
    MERGE = 3,         // Merge operation (used internally)
    EMPTY_ROW = 4,     // Insert empty row for testing
    MAX_OP = 5 
};

struct FieldVMDataChunk {
    std::array<uint8_t, 64> data;  // 64 bytes of FieldVM data
};

struct SingleOp {
    OpType op_type;        // Operation type
    uint8_t generator_index; // Generator index and top bit for negating the generator
    uint8_t scalar_index;    // Scalar index (0-255)
};

struct FuzzerTuple {
    FieldVMDataChunk fieldvm_data;  // FieldVM data for scalar computation
    SingleOp operation;              // ECCVM operation
};
```

### Operation Flow

1. **Input Processing**: The fuzzer processes `FuzzerTuple` structures containing FieldVM data and ECC operations.

2. **FieldVM Computation**: Uses FieldVM to precompute scalars from the input data with controlled settings:
   - Disabled heavy operations (inversion, square root, batch inversion, power, division)
   - Limited to 65536 steps for performance

3. **Point Generation**: Creates base generators and linear combinations for testing.

4. **Operation Execution**: Processes operations through the ECCOpQueue:
   - ADD: Adds points to accumulator
   - MUL: Multiplies points by scalars and adds to accumulator
   - EQ_AND_RESET: Checks equality and resets accumulator
   - MERGE: Merges operations
   - EMPTY_ROW: Inserts empty rows for testing

5. **Circuit Validation**: Uses `ECCVMTraceChecker::check()` to validate the circuit.

## Conditional Skip Optimization

The fuzzer includes conditional skip optimization that is only enabled in fuzzing builds:

### Fuzzing Builds (`FUZZING` macro defined)
- Skip optimization is enabled for performance
- Relations with `skip` methods are skipped when their skip condition is met
- Currently only `ECCVMSetRelation` has a skip method

### Production Builds (default)
- Skip optimization is disabled for maximum security
- All relations are always accumulated
- Ensures no performance optimizations affect correctness

### Skip Conditions

Currently, only `ECCVMSetRelation` implements skip optimization:

```cpp
template <typename AllEntities> inline static bool skip(const AllEntities& in)
{
    // Skip when no non-trivial copy constraints and no transcript operations
    return (in.z_perm - in.z_perm_shift).is_zero() && 
           in.transcript_mul.is_zero() && 
           in.lagrange_last.is_zero();
}
```

## Build Configuration

### Compilation Flags

```bash
# For fuzzing builds (with skip optimization)
clang++ -DFUZZING -fsanitize=fuzzer -O2 -g eccvm.fuzzer.cpp -o eccvm_fuzzer

# For production builds (without skip optimization)
clang++ -O2 -g eccvm.fuzzer.cpp -o eccvm_fuzzer
```

### Function Signature

The fuzzer function signature changes based on build configuration:

```cpp
// Fuzzing builds
bool ECCVMTraceChecker::check(Builder& builder, 
                             numeric::RNG* engine_ptr,
                             bool disable_fixed_dyadic_trace_size);

// Production builds  
bool ECCVMTraceChecker::check(Builder& builder, 
                             numeric::RNG* engine_ptr);
```

## Usage

### Running the Fuzzer

```bash
# Basic fuzzing run
./eccvm_fuzzer

# Run with specific corpus directory
./eccvm_fuzzer corpus/

# Run with custom parameters
./eccvm_fuzzer -max_len=1024 -timeout=30 corpus/
```

### Fuzzer Parameters

- **Input Size**: Must be at least `sizeof(FuzzerTuple)` bytes
- **Number of Operations**: Determined by `Size / sizeof(FuzzerTuple)`
- **FieldVM Data**: 64 bytes per operation for scalar computation
- **Generator Indices**: 0-255 range, with modulo operations for safety
- **Scalar Indices**: 0-255 range, used to select precomputed scalars

## Error Handling

The fuzzer includes comprehensive error handling:

1. **Input Validation**: Checks minimum input size and valid operation count
2. **Bounds Checking**: All array accesses are bounds-checked
3. **Exception Handling**: Catches and reports exceptions without crashing
4. **Circuit Validation**: Reports detailed failure information when circuit check fails

### Error Reporting

When the circuit validation fails, the fuzzer reports:
- Number of operations
- Operation sequence that caused failure
- Generator indices
- Detailed operation information including infinity checks and negation flags

## Performance Considerations

### Fuzzing Builds
- **Skip Optimization**: Reduces computation for inactive relations
- **FieldVM Settings**: Disabled heavy operations for better performance
- **Controlled Data Size**: Limited FieldVM data to prevent excessive computation

### Production Builds
- **Maximum Security**: All relations always accumulated
- **No Performance Optimizations**: Ensures correctness over speed

## Testing Strategy

The fuzzer is designed to test:

1. **Basic Operations**: ADD, MUL, EQ_AND_RESET operations
2. **Edge Cases**: Points at infinity, negation, empty operations
3. **Complex Sequences**: Multiple operations with various combinations
4. **Circuit Correctness**: Validation through ECCVMTraceChecker
5. **Memory Safety**: Proper bounds checking and error handling

## Integration with LibFuzzer

The fuzzer integrates seamlessly with LibFuzzer:

1. **Automatic Discovery**: LibFuzzer automatically detects and uses the fuzzer
2. **Corpus Management**: Works with LibFuzzer's corpus management features
3. **Crash Reporting**: Integrates with LibFuzzer's crash reporting
4. **Performance Metrics**: Provides performance data for optimization

## Troubleshooting

### Common Issues

1. **Compilation Errors**: Ensure all required headers are included
2. **Runtime Errors**: Check that input data is properly aligned
3. **Performance Issues**: Verify skip optimization is enabled in fuzzing builds
4. **Memory Issues**: Check for proper bounds checking and error handling

### Debugging

Enable debug output by setting environment variables:

```bash
export FUZZER_DEBUG=1
./eccvm_fuzzer
```

## Contributing

When modifying the fuzzer:

1. **Test Thoroughly**: Run extensive fuzzing tests after changes
2. **Maintain Security**: Ensure all security considerations are preserved
3. **Update Documentation**: Keep this README up to date
4. **Performance**: Benchmark changes to ensure no performance regression
5. **Skip Optimization**: Only enable skip optimization in fuzzing builds

## References

- [LibFuzzer Documentation](https://llvm.org/docs/LibFuzzer.html)
- [ECCVM Circuit Documentation](../README.md)
- [Barretenberg Fuzzing Guide](../../../docs/fuzzing.md)
