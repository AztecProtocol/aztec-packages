# Multi-Field Fuzzer

## Overview

`multi_field.fuzzer.cpp` runs random sequences of field operations on BN254, secp256k1 and secp256r1 `fq`/`fr`. It compares each result with a `uint256_t` reference model.

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

The input is a sequence of phases. Each phase is a 2-byte header followed by FieldVM instructions (`ecc/fields/field.fuzzer.hpp`). The header holds the field type (taken mod 6) and the step count (taken mod 64; 0 becomes 1).

State carries across phases. Before a phase runs, the previous state is reduced into the new field's modulus (`import_state_with_reduction`).

## Inversion Fuzzer

`invert_differential.fuzzer.cpp` (target `ecc_invert_differential_fuzzer`) uses the same FieldVM driver. It checks the Bernstein–Yang inverse (native `Native5x64` and WASM `Wasm9x29` kernels) against Fermat inversion on BN254 `fq`/`fr`.

## Usage

### Building

The `fuzzing` preset requires clang-20 (the preset sets `CC`/`CXX`).

```bash
cmake --preset fuzzing && cd build-fuzzing && cmake --build . --parallel --target ecc_multi_field_fuzzer ecc_invert_differential_fuzzer
```

### Running

Run from `build-fuzzing`. libFuzzer refuses to start if the corpus directory does not exist. Without limits it runs until it finds a crash, on every core.

```bash
mkdir -p corpus
./bin/ecc_multi_field_fuzzer corpus/ -max_total_time=60 -runs=100000 -workers=1 -jobs=1
```

## Debugging

On a mismatch the fuzzer prints the field type, step count and first 64 instruction bytes. It then re-runs the phase in a debug VM and returns non-zero either way. It asserts only on a confirmed discrepancy.

See [cpp/docs/Fuzzing.md](../../../../docs/Fuzzing.md) for fuzzing presets and coverage, and [security/Tooling.md](../../../../../security/Tooling.md) for the security tooling overview.
