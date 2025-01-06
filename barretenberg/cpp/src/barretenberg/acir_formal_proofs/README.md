# Formal Verification of ACIR Instructions

This module provides formal verification capabilities for ACIR (Arithmetic Circuit Intermediate Representation) instructions generated from Noir SSA code.

## Overview

The verifier uses SMT (Satisfiability Modulo Theories) solving to formally verify the correctness of ACIR instructions. It supports verification of:

- Arithmetic operations (add, subtract, multiply, divide)
- Bitwise operations (AND, OR, XOR, NOT)
- Shifts (left shift, right shift)
- Comparisons (equality, less than, greater than)
- Field arithmetic

## Tests

⚠️ **WARNING**: Do not run these tests on a local machine without sufficient memory (>32GB RAM). The tests can consume large amounts of memory and CPU resources. Some tests like integer division can run for multiple days. It is recommended to run these tests in a controlled environment with adequate resources.

### Results

| Opcode      | Lhs type/size | Rhs type/size | Time/seconds | Memory/GB | Success | SMT Term Type    | Reason                     |
| ----------- | ------------- | ------------- | ------------ | --------- | ------- | ---------------- | -------------------------- |
| Binary::Add | Field         | Field         | 0.024        | -         | &check; | TermType::FFTerm |                            |
| Binary::Add | Unsigned_127  | Unsigned_127  | 2.8          | -         | &check; | TermType::BVTerm |                            |
| Binary::And | Unsigned_32   | Unsigned_32   | 6.7          | -         | &check; | TermType::BVTerm |                            |
| Binary::And | Unsigned_127  | Unsigned_127  | 7.5          | -         | &cross; | TermType::BVTerm | Probably bug in smt solver |
| Binary::Div | Field         | Field         | 0.024        | -         | &check; | TermType::FFTerm |                            |
| Binary::Div | Unsigned_126  | Unsigned_126  | 402.7        | 3.5       | &cross; | TermType::BVTerm | Analysis in progress       |
| Binary::Div | Signed_126    | Signed_126    | >17 days     | 5.1       | &cross; | TermType::ITerm  | Test takes too long        |
| Binary::Eq  | Field         | Field         | 19.2         | -         | &check; | TermType::FFTerm |                            |
| Binary::Eq  | Unsigned_127  | Unsigned_127  | 22.8         | -         | &check; | TermType::BVTerm |                            |
| Binary::Lt  | Unsigned_127  | Unsigned_127  | 56.7         | -         | &check; | TermType::BVTerm |                            |
| Binary::Mod | Unsigned_127  | Unsigned_127  | -            | 3.2       | &cross; | TermType::BVTerm | Analysis in progress       |
| Binary::Mul | Field         | Field         | 0.024        | -         | &check; | TermType::FFTerm |                            |
| Binary::Mul | Unsigned_127  | Unsigned_127  | 10.0         | -         | &check; | TermType::BVTerm |                            |
| Binary::Or  | Unsigned_32   | Unsigned_32   | 18.0         | -         | &check; | TermType::BVTerm |                            |
| Binary::Or  | Unsigned_127  | Unsigned_127  | 7.5          | -         | &cross; | TermType::BVTerm | Probably bug in smt solver |
| Binary::Shl | Unsigned_64   | Unsigned_8    | 42331.61     | 63.2      | &check; | TermType::BVTerm |                            |
| Binary::Shl | Unsigned_32   | Unsigned_8    | 4574.0       | 30        | &check; | TermType::BVTerm |                            |
| Binary::Shr | Unsigned_64   | Unsigned_8    | 3927.88      | 10        | &check; | TermType::BVTerm |                            |
| Binary::Sub | Unsigned_127  | Unsigned_127  | 3.3          | -         | &check; | TermType::BVTerm |                            |
| Binary::Xor | Unsigned_32   | Unsigned_32   | 14.7         | -         | &check; | TermType::BVTerm |                            |
| Binary::Xor | Unsigned_127  | Unsigned_127  | 7.5          | -         | &cross; | TermType::BVTerm | Probably bug in smt solver |
| Not         | Unsigned_127  | -             | 0.2          | -         | &check; | TermType::BVTerm |                            |

The test suite verifies correctness of ACIR operations through SMT solving:

### Arithmetic Tests

- `uint_terms_add`: Tests 127-bit unsigned addition. Execution time: ~2.8s
- `uint_terms_sub`: Tests 127-bit unsigned subtraction. Execution time: ~2.6s
- `uint_terms_mul`: Tests 127-bit unsigned multiplication. Execution time: ~10.0s
- `uint_terms_div`: Tests 126-bit unsigned division
- `integer_terms_div`: Tests 126-bit signed division. Execution time: >10 days
- `field_terms_div`: Tests field division. Execution time: ~0.22s
- `uint_terms_mod`: Tests 126-bit unsigned modulo. Execution time: ???. Unknown time due to bug found during reviewing.

### Bitwise Tests

- `uint_terms_and`: Tests 127-bit unsigned bitwise AND DOESNT WORK\*
- `uint_terms_or`: Tests 127-bit unsigned bitwise OR DOESNT WORK\*
- `uint_terms_xor`: Tests 127-bit unsigned bitwise XOR DOESNT WORK\*
- `uint_terms_not`: Tests 127-bit unsigned bitwise NOT

### Shift Tests

- `uint_terms_shl32`: Tests 32-bit left shift. Execution time: ~4574s, Memory: ~30GB
- `uint_terms_shl64`: Tests 64-bit left shift. Execution time: ~4588s, Memory: ~30GB
- `uint_terms_shr`: Tests right shift. Execution time: ~3927.88s, Memory: ~10GB

### Comparison Tests

- `uint_terms_eq`: Tests 127-bit unsigned equality comparison. Verifies both equal and unequal cases. Execution time: ~22.8s
- `uint_terms_lt`: Tests 127-bit unsigned less than comparison. Verifies both a < b and a >= b cases. Execution time: ~56.7s

Each test attempts to find counterexamples that violate the expected behavior. A passing test indicates the operation is correctly implemented, while a failing test reveals potential issues.

\*Note: The bitwise tests are not working yet. (probably because of bug in the SMT solver). It works only for variables with 32 bits.
