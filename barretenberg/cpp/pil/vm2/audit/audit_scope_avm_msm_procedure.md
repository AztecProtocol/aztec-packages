# External Audit Scope: MSM Transpiler Procedure

Commit hash: _TBD_

**Prerequisites:** This audit requires understanding of components covered in:
1. The "Derivations, ECC, and Radix Decomposition" audit scope (`audit_scope_avm_derivations_and_ecc.md`)
2. The "Execution, Memory, and Calls" audit scope (`audit_scope_avm_execution_and_calls.md`)
3. The "ALU and Bitwise" audit scope (`audit_scope_avm_alu_and_bitwise.md`)
4. The "Hash Gadgets and Memory-Aware Opcode Wrappers" audit scope (`audit_scope_avm_hash_gadgets_and_mem_wrappers.md`)

## Prerequisite Components

The following components are dependencies of this audit scope but are covered in prior audit scopes. They are listed here for context only and do not need to be re-audited.

**From "Derivations, ECC, and Radix Decomposition" audit (`audit_scope_avm_derivations_and_ecc.md`):**
- `ecc.pil` -- Grumpkin point addition gadget. The MSM procedure's ECADD instructions are verified against this.
- `to_radix.pil` -- Radix decomposition gadget. The MSM procedure's TORADIXBE instructions are verified against this.

**From "Hash Gadgets and Memory-Aware Opcode Wrappers" audit (`audit_scope_avm_hash_gadgets_and_mem_wrappers.md`):**
- `ecc_mem.pil` -- ECADD opcode memory wrapper. Bridges between execution dispatch and `ecc.pil`.
- `to_radix_mem.pil` -- TORADIXBE opcode memory wrapper. Bridges between execution dispatch and `to_radix.pil`.

**From "Execution, Memory, and Calls" audit (`audit_scope_avm_execution_and_calls.md`):**
- `execution.pil` -- Execution trace. Dispatches the ECADD, TORADIXBE, and arithmetic/control-flow instructions used by the MSM bytecode.
- `memory.pil` -- Memory trace. All memory reads and writes in the procedure are verified by this.
- `opcodes/internal_call.pil` -- INTERNALCALL/INTERNALRETURN. The procedure is invoked via INTERNALCALL and returns via INTERNALRETURN.

**From "ALU and Bitwise" audit (`audit_scope_avm_alu_and_bitwise.md`):**
- `alu.pil` -- Arithmetic operations. The MSM procedure uses ADD, MUL, EQ, LT.
- `bitwise.pil` -- Bitwise AND. The MSM procedure uses AND to check if both scalar limbs are zero.

## Files to Audit

Note: Paths relative to `aztec-packages/avm-transpiler/src`

1. `transpile.rs` (**limited scope**: only the `BlackBoxOp::MultiScalarMul` handler)
    - Transpiler MSM integration. When the Noir compiler emits a `MultiScalarMul` blackbox operation, the transpiler: (1) validates input array sizes (points divisible by 3, output exactly 3); (2) generates MOV/SET instructions to pass arguments via registers d0-d3; (3) emits an INTERNALCALL to the MSM procedure. The procedure's compiled bytecode is appended to the contract's bytecode.
2. The compiled MSM bytecode (immutable -- produced by compiling `procedures/msm.rs` through the procedure compiler)
    - The compiled bytecode is the actual artifact that the AVM circuit proves. It consists of **57 instructions in 445 bytes**. Since the procedure compiler is deterministic, the bytecode is always the same for a given commit. The audit should verify the bytecode's correctness as an AVM program, using the assembly source (`procedures/msm.rs`) as a readable reference.

### Assembly source (reference, not directly audited)

The following files produce the compiled bytecode. They are not directly in audit scope (since the compiled bytecode is immutable and can be audited as-is), but serve as a readable reference for understanding what the bytecode does:

- `procedures/msm.rs` -- MSM assembly source. A hand-written AVM assembly program (~85 lines) that implements multi-scalar multiplication over the Grumpkin curve using the double-and-add algorithm. Given N points and N scalars (each split into 128-bit lo/hi limbs), computes `sum(scalar_i * point_i)`. The algorithm: (1) for each point/scalar pair, skips if both scalar limbs are zero; (2) decomposes the 254-bit scalar into bits via two TORADIXBE calls (126 bits for hi, 128 bits for lo); (3) finds the most significant bit by scanning the bit array; (4) runs a double-and-add inner loop from MSB downward using ECADD; (5) accumulates each per-point result into the MSM total via ECADD. Uses scratch memory allocated via the free memory pointer (`$1`). This is the **only hand-written AVM program** in the codebase.
- `procedures/compiler.rs` -- Procedure compiler. Compiles the parsed assembly into AVM bytecode.
- `procedures/parser.rs` -- Assembly parser. Parses the text assembly format into structured opcodes.

## Summary of Module

This audit covers the **MSM transpiler procedure** -- the only hand-written AVM program in the codebase. It implements multi-scalar multiplication (`MultiScalarMul`) as a Noir blackbox operation.

Unlike all other audit scopes which cover PIL constraints (the verifier's rules), this scope covers **executable AVM bytecode** that the circuit faithfully proves. The distinction matters: a bug in PIL constraints is a soundness issue (a malicious prover could forge proofs), while a bug in the MSM bytecode is a correctness issue (every honest execution of `MultiScalarMul` would produce wrong results that the circuit would provably attest to).

The compiled bytecode is immutable and deterministic -- the procedure compiler and parser are build-time tools that always produce the same output. The audit therefore focuses on the compiled bytecode (using the assembly source as a readable reference) and the transpiler integration that invokes it.

The MSM procedure is compositional -- it uses only standard AVM instructions (ECADD, TORADIXBE, arithmetic, control flow) whose individual correctness is verified by the PIL constraints in prerequisite scopes. The audit focus is therefore on:

1. **Algorithm correctness**: Does the bytecode correctly implement double-and-add multi-scalar multiplication? Are the scalar bit decompositions correct (254 bits split as 126 hi + 128 lo)? Is the MSB-first iteration order correct?
2. **Edge case handling**: Zero scalars (skipped via early check), point at infinity, single-point MSM, all-zero scalars.
3. **Memory safety**: Scratch memory allocation via the free memory pointer (`$1`) must not overlap with input/output arrays. The 254-element bit array must be correctly indexed.
4. **Transpiler integration**: The register setup (d0=points, d1=scalars, d2=count, d3=output) must match what the procedure expects. Array size validation must be correct.

## Reference Documentation

For background on the Aztec Virtual Machine -- its purpose, execution model, instruction set, memory model, gas metering, and error handling -- see the [AVM Reference Documentation](../../../../../yarn-project/simulator/docs/avm/README.md). This is the primary reference for the VM that the circuit is designed to prove.

For a comprehensive guide to the AVM **circuit** architecture, trace structure, subtraces, and the proving system, see the [AVM Circuit Guide](../docs/README.md).

For standard algebraic patterns and recipes used throughout PIL files, see [VM Circuit Recipes](../docs/recipes.md).

## Test Files

Note: Paths relative to `aztec-packages/avm-transpiler/src`

- `procedures/msm.rs` (inline `#[test]` module: `smoke_parse_msm`, `smoke_compile_msm`)
