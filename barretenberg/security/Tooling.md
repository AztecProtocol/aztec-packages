# Security Tooling

There are various mechanisms that are used to ensure the security of the protocol.

## Boomerang value detection

Taking the value out of the circuit and then returning it without creating an appropriate constraint is a common bug. To detect such issues in our codebase we've created boomerand detection static analysis tool. It automatically detects variables in one gate and filters out false positives. It can also detect if a circuit has several subgraphs that are not connected with any constraints, which can also be a marker of a bug. You can find more in ../cpp/src/barretenberg/boomerang_value_detection.

## Origin Tags

Origin tags are used to track the provenance of values within the transcript. They are used to detect common pitfalls such as using a free witness in an inappropriate context.

You can find more information in the [Origin Tags Security Mechanism](../cpp/src/barretenberg/transcript/Origin Tags Security.md) file.


## Fuzzing

We use several specialized fuzzing tools to ensure correctness and security. 
For details on usage and instructions, see the main Fuzzing guide:
[Fuzzing of standard circuit primitives](../cpp/docs/Fuzzing.md)

### Fuzzing of standard circuit primitives

We use specialized fuzzing targets to fuzz the standard circuit primitives.

You can find more information in the [Fuzzing of standard circuit primitives](../cpp/docs/Fuzzing.md) file.

### Multi-Field Fuzzer

The multi-field fuzzer is a specialized security testing tool designed to validate the correctness of native field implementation

You can find detailed information in the [Multi-Field Fuzzer README](../cpp/src/barretenberg/ecc/curves/Fuzzing.md) file.

### ECCVM Fuzzer

The ECCVM fuzzer is a dedicated tool for testing the security and correctness of the ECCVM implementation.

You can find more information in the [ECCVM Fuzzer README](../cpp/src/barretenberg/eccvm/fuzz/README_FUZZERS.md) file.

