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
| Binary::Add | Field         | Field         | 0.01         | -         | &check; | TermType::FFTerm | -      | 20.03.2026 |
| Binary::Add | Unsigned_128  | Unsigned_128  | 4.3          | 0.23      | &check; | TermType::BVTerm | -      | 20.03.2026 |
| Binary::Add | Signed_64     | Signed_64     | 79           | 2.87      | &check; | TermType::BVTerm | -      | 20.03.2026 |
| Binary::And | Unsigned_32   | Unsigned_32   | 1.25         | 0.20      | &check; | TermType::BVTerm | -      | 20.03.2026 |
| Binary::And | Unsigned_128  | Unsigned_128  | 90.6         | 0.87      | &check; | TermType::BVTerm | -      | 20.03.2026 |
| Binary::And | Signed_64     | Signed_64     | 12.5         | 0.42      | &check; | TermType::BVTerm | -      | 20.03.2026 |
| Binary::Div | Field         | Field         | 0.01         | -         | &check; | TermType::FFTerm | -      | 20.03.2026 |
| Binary::Div | Unsigned_128  | Unsigned_128  | TIMEOUT      | -         | &cross; | TermType::BVTerm | Test takes too long | 20.03.2026 |
| Binary::Div | Signed_64     | Signed_64     | TIMEOUT      | -         | &cross; | TermType::BVTerm | Test takes too long | 20.03.2026 |
| Binary::Eq  | Field         | Field         | 0.01         | -         | &check; | TermType::FFTerm | -      | 20.03.2026 |
| Binary::Eq  | Unsigned_128  | Unsigned_128  | 25.2         | 1.20      | &check; | TermType::BVTerm | -      | 20.03.2026 |
| Binary::Eq  | Signed_64     | Signed_64     | 0.04         | 0.04      | &check; | TermType::BVTerm | -      | 20.03.2026 |
| Binary::Lt  | Unsigned_128  | Unsigned_128  | 65.9         | 1.17      | &check; | TermType::BVTerm | -      | 20.03.2026 |
| Binary::Mod | Unsigned_127  | Unsigned_127  | TIMEOUT      | -         | &cross; | TermType::BVTerm | Test takes too long | 20.03.2026 |
| Binary::Mod | Signed_64     | Signed_64     | TIMEOUT      | -         | &cross; | TermType::BVTerm | Test takes too long | 20.03.2026 |
| Binary::Mul | Field         | Field         | 0.01         | -         | &check; | TermType::FFTerm | -      | 20.03.2026 |
| Binary::Mul | Unsigned_128  | Unsigned_128  | 35.1         | 1.09      | &check; | TermType::BVTerm | -      | 20.03.2026 |
| Binary::Mul | Signed_64     | Signed_64     | 101          | 3.00      | &check; | TermType::BVTerm | -      | 20.03.2026 |
| Binary::Or  | Unsigned_32   | Unsigned_32   | 5.3          | 0.25      | &check; | TermType::BVTerm | -      | 20.03.2026 |
| Binary::Or  | Unsigned_128  | Unsigned_128  | 124          | 0.88      | &check; | TermType::BVTerm | -      | 20.03.2026 |
| Binary::Or  | Signed_64     | Signed_64     | 20.7         | -         | &check; | TermType::BVTerm | -      | 20.03.2026 |
| Binary::Shl | Unsigned_64   | Unsigned_64   | 5000         | 12        | &check; | TermType::BVTerm | -      | 20.03.2026 |
| Binary::Shl | Signed_64     | Signed_64     | 1116         | 6         | &cross; | TermType::BVTerm | - | 20.03.2026 |
| Binary::Shl | Signed_8      | Signed_8      | 49.6         | 2.54      | &check; | TermType::BVTerm | -      | 20.03.2026 |
| Binary::Shr | Unsigned_64   | Unsigned_64   | 4981         | ~10       | &check; | TermType::BVTerm | -      | 20.03.2026 |
| Binary::Shr | Signed_8      | Signed_8      | 235          | -         | &check; | TermType::BVTerm | -      | 20.03.2026 |
| Binary::Sub | Unsigned_128  | Unsigned_128  | 4.1          | 0.23      | &check; | TermType::BVTerm | -      | 20.03.2026 |
| Binary::Sub | Signed_64     | Signed_64     | 81.6         | 2.86      | &check; | TermType::BVTerm | -      | 20.03.2026 |
| Binary::Xor | Unsigned_32   | Unsigned_32   | 1.1          | 0.20      | &check; | TermType::BVTerm | -      | 20.03.2026 |
| Binary::Xor | Unsigned_128  | Unsigned_128  | 137          | 0.89      | &check; | TermType::BVTerm | -      | 20.03.2026 |
| Binary::Xor | Signed_64     | Signed_64     | 14.9         | 0.43      | &check; | TermType::BVTerm | -      | 20.03.2026 |
| Not         | Unsigned_128  | -             | 6.6          | 0.11      | &check; | TermType::BVTerm | -      | 20.03.2026 |
| Not         | Signed_64     | -             | 0.58         | 0.07      | &check; | TermType::BVTerm | -      | 20.03.2026 |
| Truncate    | Field         | Unsigned_64   | TIMEOUT      | -         | &cross; | TermType::FFTerm | Test takes too long | 20.03.2026 |
| Truncate    | Unsigned_64   | Unsigned_8    | 1.3          | 0.20      | &check; | TermType::BVTerm | -      | 20.03.2026 |
| Truncate    | Signed_64     | Unsigned_8    | 1.2          | 0.20      | &check; | TermType::BVTerm | -      | 20.03.2026 |





Each test attempts to find counterexamples that violate the expected behavior. A passing test indicates the operation is correctly implemented, while a failing test reveals potential issues.

### bugs found

1. 3 bit overflow in AND/XOR/OR operations in barretenberg, fixed in [#11651](https://github.com/AztecProtocol/aztec-packages/commit/dddab22934b3abb798dbf204bccb68b557ee2193)
