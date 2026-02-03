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

| Opcode      | Lhs type/size | Rhs type/size | Time/seconds | Memory/GB | Success | SMT Term Type    | Reason | Last Check (D/M/Y) |
| ----------- | ------------- | ------------- | ------------ | --------- | ------- | ---------------- | ------ | ---------- |
| Binary::Add | Field         | Field         | 0.024        | -         | &check; | TermType::FFTerm | -      | 01.12.2025 |
| Binary::Add | Unsigned_128  | Unsigned_128  | 5.9          | 240MiB    | &check; | TermType::BVTerm | -      | 01.12.2025 |
| Binary::And | Unsigned_32   | Unsigned_32   | 6.7          | -         | &check; | TermType::BVTerm | -      | 01.12.2025 |
| Binary::And | Unsigned_128  | Unsigned_128  | 176          | 985MB     | &check; | TermType::BVTerm | -      | 01.12.2025 |
| Binary::Div | Field         | Field         | 0.024        | -         | &check; | TermType::FFTerm | -      | 01.12.2025 |
| Binary::Div | Unsigned_128  | Unsigned_128  | ???          | 20        | &cross; | TermType::BVTerm | Test takes too long | 01.12.2025 |
| Binary::Div | Signed_64     | Signed_64     | ????         | 20        | &cross; | TermType::BVTerm | Test takes too long | 01.01.2025 |
| Binary::Eq  | Field         | Field         | 17ms         | -         | &check; | TermType::FFTerm | -      | 01.12.2025 |
| Binary::Eq  | Unsigned_128  | Unsigned_128  | 34.4         | -         | &check; | TermType::BVTerm | -      | 01.12.2025 |
| Binary::Lt  | Unsigned_128  | Unsigned_128  | 87.1         | -         | &check; | TermType::BVTerm | -      | 01.12.2025 |
| Binary::Mod | Unsigned_127  | Unsigned_127  | >130 days    | 3.2       | &cross; | TermType::BVTerm | Test takes too long | 01.01.2025 |
| Binary::Mul | Field         | Field         | 0.024        | -         | &check; | TermType::FFTerm | -      | 01.12.2025 |
| Binary::Mul | Unsigned_128  | Unsigned_128  | 52.3         | -         | &check; | TermType::BVTerm | -      | 01.12.2025 |
| Binary::Or  | Unsigned_32   | Unsigned_32   | 18.0         | -         | &check; | TermType::BVTerm | -      | 01.12.2025 |
| Binary::Or  | Unsigned_128  | Unsigned_128  | 7.5          | -         | &check; | TermType::BVTerm | -      | 01.12.2025 |
| Binary::Shl | Unsigned_64   | Unsigned_8    | 42331.61     | 63.2      | &check; | TermType::BVTerm | -      | 01.01.2025 |
| Binary::Shl | Unsigned_32   | Unsigned_8    | 4574.0       | 30        | &check; | TermType::BVTerm | -      | 01.01.2025 |
| Binary::Shr | Unsigned_64   | Unsigned_8    | 3927.88      | 10        | &check; | TermType::BVTerm | -      | 01.01.2025 |
| Binary::Sub | Unsigned_128  | Unsigned_128  | 5.7          | -         | &check; | TermType::BVTerm | -      | 01.12.2025 |
| Binary::Xor | Unsigned_32   | Unsigned_32   | 14.7         | -         | &check; | TermType::BVTerm | -      | 01.12.2025 |
| Binary::Xor | Unsigned_128  | Unsigned_128  | 355.2        | -         | &check; | TermType::BVTerm | -      | 01.12.2025 |
| Not         | Unsigned_128  | -             | 10.2         | -         | &check; | TermType::BVTerm | -      | 01.12.2025 |
| Truncate    | Field         | Unsigned_64   | ????         | -         | &cross; | TermType::FFTerm | TO INVESTIGATE (the test fails with SIGKILL after 2 hours) | 01.12.2025|
| Truncate    | Unsigned_64   | Unsigned_8    | 3.7          | -         | &check; | TermType::BVTerm | -      | 01.12.2025 |
| Truncate    | Signed_64     | Unsigned_8    | 3.2          | -         | &check; | TermType::BVTerm | -      | 01.12.2025 |
| Binary::Xor | Signed_64     | Signed_64     | 67.2         | -         | &check; | TermType::BVTerm | -      | 01.12.2025 |
| Binary::Shr | Signed_8      | Signed_8      | 266          | -         | &check; | TermType::BVTerm | -      | 01.12.2025 |
| Binary::Shl | Signed_8      | Signed_8      | 50           | -         | &check; | TermType::BVTerm | -      | 01.12.2025 |
| Not         | Signed_64     | -             | 0.7          | -         | &check; | TermType::BVTerm | -      | 01.12.2025 |
| Binary::Add | Signed_64     | Signed_64     | 97           | -         | &check; | TermType::BVTerm | -      | 01.12.2025 |
| Binary::And | Signed_64     | Signed_64     | 97           | -         | &check; | TermType::BVTerm | -      | 01.12.2025 |
| Binary::Sub | Signed_64     | Signed_64     | 85           | -         | &check; | TermType::BVTerm | -      | 01.12.2025 |
| Binary::Eq  | Signed_64     | Signed_64     | 34.4         | -         | &check; | TermType::BVTerm | -      | 01.12.2025 |
| Binary::Mul | Signed_64     | Signed_64     | 95           | -         | &check; | TermType::BVTerm | -      | 01.12.2025 |





Each test attempts to find counterexamples that violate the expected behavior. A passing test indicates the operation is correctly implemented, while a failing test reveals potential issues.

### bugs found

1. 3 bit overflow in AND/XOR/OR operations in barretenberg, fixed in [#11651](https://github.com/AztecProtocol/aztec-packages/commit/dddab22934b3abb798dbf204bccb68b557ee2193)
