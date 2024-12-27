# SSA Test Generator

This tool generates test artifacts for formally verifying SSA instructions and their conversion to ACIR .

## Purpose

The test generator creates test cases for:

- Bitvector operations (up to 127 bits): add, sub, mul, mod, xor, and, div, eq, lt, not, etc.
- Shift operations (tested with smaller bit sizes 32 and 64): shl, shr
- Binary operations (32-bit): xor, and, or
- Field operations: add, mul, div
- Signed integer operations: div (126-bit)

Each test case generates:
- Formatted SSA representation
- Serialized ACIR output

## Usage

Run the generator and copy artifacts to barretenberg:

```bash
cargo run && cp artifacts/* ../../../../../barretenberg/cpp/src/barretenberg/acir_formal_proofs/artifacts/
```
