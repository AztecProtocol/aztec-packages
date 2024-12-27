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

The test suite verifies correctness of ACIR operations through SMT solving:

### Arithmetic Tests
- `uint_terms_add`: Tests 127-bit unsigned addition. Execution time: ~2.8s
- `uint_terms_sub`: Tests 127-bit unsigned subtraction. Execution time: ~2.6s
- `uint_terms_mul`: Tests 127-bit unsigned multiplication. Execution time: ~10.0s
- `uint_terms_div`: Tests 126-bit unsigned division
- `integer_terms_div`: Tests 126-bit signed division. Execution time: >10 days
- `field_terms_div`: Tests field division. Execution time: ~0.22s
- `uint_terms_mod`: Tests 126-bit unsigned modulo. Execution time: ~0.354s

### Bitwise Tests
- `uint_terms_and`: Tests 127-bit unsigned bitwise AND DOESNT WORK*
- `uint_terms_or`: Tests 127-bit unsigned bitwise OR DOESNT WORK*
- `uint_terms_xor`: Tests 127-bit unsigned bitwise XOR DOESNT WORK*
- `uint_terms_not`: Tests 127-bit unsigned bitwise NOT

### Shift Tests
- `uint_terms_shl32`: Tests 32-bit left shift. Execution time: ~4574s, Memory: ~30GB
- `uint_terms_shl64`: Tests 64-bit left shift. Execution time: ~4588s, Memory: ~30GB
- `uint_terms_shr`: Tests right shift. Execution time: ~3927.88s, Memory: ~10GB

### Comparison Tests
- `uint_terms_eq`: Tests 127-bit unsigned equality comparison. Verifies both equal and unequal cases. Execution time: ~22.8s
- `uint_terms_lt`: Tests 127-bit unsigned less than comparison. Verifies both a < b and a >= b cases. Execution time: ~56.7s

Each test attempts to find counterexamples that violate the expected behavior. A failing test indicates the operation is correctly implemented, while a passing test reveals potential issues.

*Note: The bitwise tests are not working yet. (probably because of bug in the SMT solver). It works only for variables with 32 bits.
