# The Translator Circuit

> $\textcolor{orange}{\textsf{Warning}}$: This document provides a technical overview of the Translator Circuit used in the Goblin Plonk proving system. It is intended for understanding the design and optimizations. The code is the source of truth for implementation specifics.

## Table of Contents

1. [Overview](#overview)
2. [High-Level Statement](#high-level-statement)
3. [Architecture and Constants](#architecture-and-constants)
4. [Witness Polynomials (81 Total)](#witness-polynomials-81-total)
5. [Selector Polynomials](#selector-polynomials)
6. [The Seven Relations](#the-seven-relations)
7. [Proof System Details](#proof-system-details)
8. [Proof Size Analysis](#proof-size-analysis)
9. [Critical Components for Auditing](#critical-components-for-auditing)

---

## Overview

The **Translator Circuit** is a critical component of the Goblin Plonk proving system in Aztec. It serves as a bridge between the Mega and ECCVM circuits.

| Curve    | Base Field     | Scalar Field   | Usage                                     |
| -------- | -------------- | -------------- | ----------------------------------------- |
| BN254    | $\mathbb{F}_q$ | $\mathbb{F}_r$ | Used in Mega circuits                     |
| Grumpkin | $\mathbb{F}_r$ | $\mathbb{F}_q$ | Used in ECCVM for efficient EC operations |

When proving recursive circuits with Mega circuit builder, we accumulate elliptic curve operations in an `EccOpQueue`. Proving these ECC operations is delegated to the ECCVM circuit, which operates over the Grumpkin curve. However, the representation of the `EccOpQueue` is different in the Mega circuit (BN254) and ECCVM (Grumpkin) circuit because:

- Mega circuit operates over the BN254 scalar field $\mathbb{F}_r$ so elements in $\mathbb{F}_q$ are non-native (i.e., they need to decomposed into limbs in $\mathbb{F}_r$)
- ECCVM operates over the Grumpkin scalar field $\mathbb{F}_q$ so elements in $\mathbb{F}_q$ are circuit native

For example, consider the operation $(z \cdot P)$ where $P$ is a point on the curve and $z$ is a scalar:

The ECCVM arithmetisation represents this operation (in 1 row) as:

| Opcode | $x$-coordinate | $y$-coordinate | Scalar $z_1$ | Scalar $z_2$ | Full scalar $z$ |
| ------ | -------------- | -------------- | ------------ | ------------ | --------------- |
| `MUL`  | $P_x$          | $P_y$          | $z_1$        | $z_2$        | $z$             |
|        |                |                |              |              |                 |

The Mega circuit arithmetisation represents the same operation (in 2 rows) as:

| Column 1 | Column 2             | Column 3             | Column 4             |
| -------- | -------------------- | -------------------- | -------------------- |
| `MUL`    | $P_{x, \textsf{lo}}$ | $P_{x, \textsf{hi}}$ | $P_{y, \textsf{lo}}$ |
| $0$      | $P_{y, \textsf{hi}}$ | $z_1$                | $z_2$                |
|          |                      |                      |                      |

where $P_x = (P_{x, \textsf{lo}} + 2^{136} \cdot P_{x, \textsf{hi}}), \ P_y = (P_{y, \textsf{lo}} + 2^{136} \cdot P_{y, \textsf{hi}})$ and the scalar $z = (z_1 + 2^{128} \cdot z_2)$.

We need to prove that these two representations are consistent, i.e., that the polynomial evaluations computed in the ECCVM circuit (over $\mathbb{F}_q$) match those computed in the Mega circuit (over $\mathbb{F}_r$).

The Translator circuit is a custom circuit designed to solve this problem. It:

1. **Receives** the ECC op queue in Mega arithmetisation and the batched polynomial evaluation problem from ECCVM (operating over $\mathbb{F}_q$),
2. **Computes** the batched polynomial evaluation using non-native field arithmetic in $\mathbb{F}_r$ and,
3. **Verifies** that the result matches the evaluation provided by ECCVM.

---

## High-Level Statement

Given:

- A sequence of `UltraOp` operations from the `EccOpQueue`
- An evaluation challenge $x \in \mathbb{F}_q$
- A batching challenge $v \in \mathbb{F}_q$

**Prove:**
$$\boxed{\text{accumulator}_{\text{final}} = \sum_{i=0}^{n-1} x^{n-1-i} \cdot \left( \text{op}_i + v \cdot P_x^{(i)} + v^2 \cdot P_y^{(i)} + v^3 \cdot z_1^{(i)} + v^4 \cdot z_2^{(i)} \right) \pmod{q}}$$

where:

- each `UltraOp` contains: $(\text{op}, \ P_x, \ P_y, \ z_1, \ z_2)$,
- the computation is performed modulo $q$.

Specifically, for each accumulation step (every 2 rows), prove:

$$\text{acc}_{\text{curr}} = \text{acc}_{\text{prev}} \cdot x + \text{op} + P_x \cdot v + P_y \cdot v^2 + z_1 \cdot v^3 + z_2 \cdot v^4 \pmod{q}$$

**Method:** Similar to the technique used in [bigfield](../stdlib/primitives/bigfield/README.md), we prove in integers that:

$$\text{acc}_{\text{prev}} \cdot x + \text{op} + P_x \cdot v + P_y \cdot v^2 + z_1 \cdot v^3 + z_2 \cdot v^4 - \text{quotient} \cdot q - \text{acc}_{\text{curr}} = 0$$

This equation must hold:

1. modulo $2^{272}$ (proven via limb arithmetic)
2. modulo $r$ (proven in native field)
3. with appropriate range constraints (to prevent overflows/underflows)

Then the Chinese Remainder Theorem guarantees that the equation holds modulo $q$.

## Architecture and Constants

#### Circuit Size Parameters

```cpp
CONST_TRANSLATOR_MINI_CIRCUIT_LOG_SIZE = 13      // Mini-circuit: 2^13 = 8,192 rows
INTERLEAVING_GROUP_SIZE = 16                     // Interleaving factor
CONST_TRANSLATOR_LOG_N = 13 + 4 = 17             // Full circuit: 2^17 = 131,072 rows
```

**Why interleaving?** To reduce the degree of the permutation argument polynomial for range constraints.

#### Field Moduli

```
BN254 Base Field (Fq):
q = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47
  ≈ 2^254

BN254 Scalar Field (Fr):
r = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001
  ≈ 2^254
```

**Key observation:** $q \neq r$ (they differ by $\approx 2^{47}$), so we cannot directly compute in $\mathbb{F}_q$ using $\mathbb{F}_r$ arithmetic.

#### Limb Decomposition Constants

```cpp
NUM_LIMB_BITS = 68                    // Each limb is 68 bits
NUM_LAST_LIMB_BITS = 50               // Top limb: 254 - 3*68 = 50 bits
NUM_BINARY_LIMBS = 4                  // Total limbs per element

NUM_Z_BITS = 128                      // z₁ and z₂ are 128-bit
NUM_Z_LIMBS = 2                       // z values use 2 limbs (68 + 60 bits)

NUM_QUOTIENT_BITS = 256               // Quotient needs 256 bits
NUM_LAST_QUOTIENT_LIMB_BITS = 52      // 256 - 3*68 = 52 bits

MICRO_LIMB_BITS = 14                  // Range constraint granularity
NUM_MICRO_LIMBS = 6                   // 68 / 14 ≈ 5, plus 1 for tail
```

#### Opcode Values

```cpp
Valid opcodes: {0, 1, 2, 3, 4, 8}
```

Encoding EC operations:

- `0`: No-op / NULL
- `1`: Add
- `2`: Mul (scalar multiplication)
- `3`: Equality check
- `4`: Reset accumulator
- `8`: [Special operation]

#### Range Constraint Constants

```cpp
SORT_STEP = 3                         // Max delta between sorted values
NUM_RANGE_CONSTRAINT_WIRES = 5        // ordered_range_constraints_{0,1,2,3,4}
SORTED_STEPS_COUNT = 2^14 / 3 + 1     // Number of "step" values inserted
                   = 5462 steps
```

Each microlimb must be $≤ 2^{14} - 1 = 16383$.

---

## Witness Trace Structure

The Translator circuit operates on a **2-row cycle structure**. Each EccOpQueue entry occupies exactly 2 rows:

- **Row $2i$ (Even rows)**: **Computation rows** where the non-native field relation is actively checked
- **Row $2i+1$ (Odd rows)**: **Data storage rows** that hold values accessed by the next even row via shifts

This architecture exists because of how polynomial commitments work in the KZG scheme: the "shifted" polynomial at index $i$ evaluates to the polynomial at index $i+1$. Thus:

- Even row $2i$ performs computation using "current" values from its own row
- Even row $2i$ accesses "previous" values from odd row $2i+1$ via shift columns
- Odd row $2i+1$ stores the data that will become "previous" for the next computation at row $2i+2$

The Translator circuit has **81 witness columns** organized into several categories:

#### 1. EccOpQueue Transcript Columns (4 columns)

These columns directly represent the EccOpQueue transcript:

| Column      | Even Row (2i)                     | Odd Row (2i+1)               | Description                                   |
| ----------- | --------------------------------- | ---------------------------- | --------------------------------------------- |
| `OP`        | $\texttt{op} \in \{0,1,2,3,4,8\}$ | 0 (no-op)                    | Opcode (the type of elliptic curve operation) |
| `X_LO_Y_HI` | $P_{x,\text{lo}}$ (136 bits)      | $P_{y,\text{hi}}$ (118 bits) | Low 136 bits of P.x and High 118 bits of P.y  |
| `X_HI_Z_1`  | $P_{x,\text{hi}}$ (118 bits)      | $z_1$ (128 bits)             | High 118 bits of P.x and first scalar         |
| `Y_LO_Z_2`  | $P_{y,\text{lo}}$ (136 bits)      | $z_2$ (128 bits)             | Low 136 bits of P.y and second scalar         |
|             |                                   |                              |                                               |

**Encoding scheme**: Point coordinates $P_x$ and $P_y$ are each 254 bits, split as:

- $P_x = (P_{x,\text{hi}}$ (118 bits) $\|$ $P_{x,\text{lo}}$ (136 bits) $)$
- $P_y = (P_{y,\text{hi}}$ (118 bits) $\|$ $P_{y,\text{lo}}$ (136 bits) $)$

#### 2. Limb Decomposition Columns (13 columns)

These columns store finer-grained limb decompositions for non-native arithmetic:

| Column Group                  | Even Row (2i)         | Odd Row (2i+1)        | Bits   | Purpose                                  |
| ----------------------------- | --------------------- | --------------------- | ------ | ---------------------------------------- |
| `P_X_LOW_LIMBS`               | $P_{x,0}^{\text{lo}}$ | $P_{x,1}^{\text{lo}}$ | 68     | Limbs 0 & 1 of $P_{x,\text{lo}}$         |
| `P_X_HIGH_LIMBS`              | $P_{x,0}^{\text{hi}}$ | $P_{x,1}^{\text{hi}}$ | 68, 50 | Limbs 0 & 1 of $P_{x,\text{hi}}$         |
| `P_Y_LOW_LIMBS`               | $P_{y,0}^{\text{lo}}$ | $P_{y,1}^{\text{lo}}$ | 68     | Limbs 0 & 1 of $P_{y,\text{lo}}$         |
| `P_Y_HIGH_LIMBS`              | $P_{y,0}^{\text{hi}}$ | $P_{y,1}^{\text{hi}}$ | 68, 50 | Limbs 0 & 1 of $P_{y,\text{hi}}$         |
| `Z_LOW_LIMBS`                 | $z_{1,0}$             | $z_{2,0}$             | 68     | Low limbs of $z_1$ and $z_2$             |
| `Z_HIGH_LIMBS`                | $z_{1,1}$             | $z_{2,1}$             | 60     | High limbs of $z_1$ and $z_2$            |
| `ACCUMULATORS_BINARY_LIMBS_0` | $a_0^{\text{curr}}$   | $a_0^{\text{prev}}$   | 68     | Limb 0 of current/previous accumulator   |
| `ACCUMULATORS_BINARY_LIMBS_1` | $a_1^{\text{curr}}$   | $a_1^{\text{prev}}$   | 68     | Limb 1 of current/previous accumulator   |
| `ACCUMULATORS_BINARY_LIMBS_2` | $a_2^{\text{curr}}$   | $a_2^{\text{prev}}$   | 68     | Limb 2 of current/previous accumulator   |
| `ACCUMULATORS_BINARY_LIMBS_3` | $a_3^{\text{curr}}$   | $a_3^{\text{prev}}$   | 50     | Limb 3 of current/previous accumulator   |
| `QUOTIENT_LOW_BINARY_LIMBS`   | $q_0$                 | $q_1$                 | 68     | Limbs 0 & 1 of quotient $\mathcal{Q}$    |
| `QUOTIENT_HIGH_BINARY_LIMBS`  | $q_2$                 | $q_3$                 | 68, 52 | Limbs 2 & 3 of quotient $\mathcal{Q}$    |
| `RELATION_WIDE_LIMBS`         | $c^{\text{lo}}$       | $c^{\text{hi}}$       | 84     | Carry/overflow from mod $2^{136}$ checks |

**Key insight**: The accumulator columns demonstrate the shift mechanism:

- Even row stores $a^{\text{curr}}$ (result of current computation)
- Odd row stores what will become $a^{\text{prev}}$ (input to next computation)
- Via shifts, even row $2i$ reads odd row $2i+1$ to get "previous" values

#### 3. Range Constraint Microlimb Columns (64 columns)

Each limb is further decomposed into **14-bit microlimbs** for range checking. Each 68-bit limb has 5 microlimbs (14 bits each) plus a "tail" microlimb that enforces tight range constraints. The columns are organized as follows:

| Column Group                                   | Even Row (2i)                                            | Odd Row (2i+1)                                            |
| ---------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------- |
| Coordinate $P_x$ microlimbs                    |                                                          |                                                           |
| `P_X_LOW_LIMBS_RANGE_CONSTRAINT_0`             | $P_{x,0}[0]$                                             | $P_{x,1}[0]$                                              |
| `P_X_LOW_LIMBS_RANGE_CONSTRAINT_1`             | $P_{x,0}[1]$                                             | $P_{x,1}[1]$                                              |
| `P_X_LOW_LIMBS_RANGE_CONSTRAINT_2`             | $P_{x,0}[2]$                                             | $P_{x,1}[2]$                                              |
| `P_X_LOW_LIMBS_RANGE_CONSTRAINT_3`             | $P_{x,0}[3]$                                             | $P_{x,1}[3]$                                              |
| `P_X_LOW_LIMBS_RANGE_CONSTRAINT_4`             | $P_{x,0}[4]$                                             | $P_{x,1}[4]$                                              |
| `P_X_HIGH_LIMBS_RANGE_CONSTRAINT_0`            | $P_{x,2}[0]$                                             | $P_{x,3}[0]$                                              |
| `P_X_HIGH_LIMBS_RANGE_CONSTRAINT_1`            | $P_{x,2}[1]$                                             | $P_{x,3}[1]$                                              |
| `P_X_HIGH_LIMBS_RANGE_CONSTRAINT_2`            | $P_{x,2}[2]$                                             | $P_{x,3}[2]$                                              |
| `P_X_HIGH_LIMBS_RANGE_CONSTRAINT_3`            | $P_{x,2}[3]$                                             | $P_{x,3}[3]$                                              |
| `P_X_HIGH_LIMBS_RANGE_CONSTRAINT_4`            | $P_{x,2}[4]$                                             | $\textcolor{yellow}{P_{x,3}[\textsf{tail}]}$ (reassigned) |
| Coordinate $P_y$ microlimbs                    |                                                          |                                                           |
| `P_Y_LOW_LIMBS_RANGE_CONSTRAINT_0`             | $P_{y,0}[0]$                                             | $P_{y,1}[0]$                                              |
| `P_Y_LOW_LIMBS_RANGE_CONSTRAINT_1`             | $P_{y,0}[1]$                                             | $P_{y,1}[1]$                                              |
| `P_Y_LOW_LIMBS_RANGE_CONSTRAINT_2`             | $P_{y,0}[2]$                                             | $P_{y,1}[2]$                                              |
| `P_Y_LOW_LIMBS_RANGE_CONSTRAINT_3`             | $P_{y,0}[3]$                                             | $P_{y,1}[3]$                                              |
| `P_Y_LOW_LIMBS_RANGE_CONSTRAINT_4`             | $P_{y,0}[4]$                                             | $P_{y,1}[4]$                                              |
| `P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_0`            | $P_{y,2}[0]$                                             | $P_{y,3}[0]$                                              |
| `P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_1`            | $P_{y,2}[1]$                                             | $P_{y,3}[1]$                                              |
| `P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_2`            | $P_{y,2}[2]$                                             | $P_{y,3}[2]$                                              |
| `P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_3`            | $P_{y,2}[3]$                                             | $P_{y,3}[3]$                                              |
| `P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_4`            | $P_{y,2}[4]$                                             | $\textcolor{yellow}{P_{y,3}[\textsf{tail}]}$ (reassigned) |
| Coordinate $z_1$ microlimbs                    |                                                          |                                                           |
| `Z_LOW_LIMBS_RANGE_CONSTRAINT_0`               | $z_{1,0}[0]$                                             | $z_{2,0}[0]$                                              |
| `Z_LOW_LIMBS_RANGE_CONSTRAINT_1`               | $z_{1,0}[1]$                                             | $z_{2,0}[1]$                                              |
| `Z_LOW_LIMBS_RANGE_CONSTRAINT_2`               | $z_{1,0}[2]$                                             | $z_{2,0}[2]$                                              |
| `Z_LOW_LIMBS_RANGE_CONSTRAINT_3`               | $z_{1,0}[3]$                                             | $z_{2,0}[3]$                                              |
| `Z_LOW_LIMBS_RANGE_CONSTRAINT_4`               | $z_{1,0}[4]$                                             | $z_{2,0}[4]$                                              |
| `Z_HIGH_LIMBS_RANGE_CONSTRAINT_0`              | $z_{1,1}[0]$                                             | $z_{2,1}[0]$                                              |
| `Z_HIGH_LIMBS_RANGE_CONSTRAINT_1`              | $z_{1,1}[1]$                                             | $z_{2,1}[1]$                                              |
| `Z_HIGH_LIMBS_RANGE_CONSTRAINT_2`              | $z_{1,1}[2]$                                             | $z_{2,1}[2]$                                              |
| `Z_HIGH_LIMBS_RANGE_CONSTRAINT_3`              | $z_{1,1}[3]$                                             | $z_{2,1}[3]$                                              |
| `Z_HIGH_LIMBS_RANGE_CONSTRAINT_4`              | $z_{1,1}[4]$                                             | $z_{2,1}[4]$                                              |
| Accumulator microlimbs                         |                                                          |                                                           |
| `ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_0`     | $a_{0}^{\text{curr}}[0]$                                 | $a_{1}^{\text{curr}}[0]$                                  |
| `ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_1`     | $a_{0}^{\text{curr}}[1]$                                 | $a_{1}^{\text{curr}}[1]$                                  |
| `ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_2`     | $a_{0}^{\text{curr}}[2]$                                 | $a_{1}^{\text{curr}}[2]$                                  |
| `ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_3`     | $a_{0}^{\text{curr}}[3]$                                 | $a_{1}^{\text{curr}}[3]$                                  |
| `ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_4`     | $a_{0}^{\text{curr}}[4]$                                 | $a_{1}^{\text{curr}}[4]$                                  |
| `ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_0`    | $a_{2}^{\text{curr}}[0]$                                 | $a_{3}^{\text{curr}}[0]$                                  |
| `ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_1`    | $a_{2}^{\text{curr}}[1]$                                 | $a_{3}^{\text{curr}}[1]$                                  |
| `ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_2`    | $a_{2}^{\text{curr}}[2]$                                 | $a_{3}^{\text{curr}}[2]$                                  |
| `ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_3`    | $a_{2}^{\text{curr}}[3]$                                 | $a_{3}^{\text{curr}}[3]$                                  |
| `ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_4`    | $a_{2}^{\text{curr}}[4]$                                 | $\textcolor{yellow}{a_{3}[\textsf{tail}]}$ (reassigned)   |
| Quotient microlimbs                            |                                                          |                                                           |
| `QUOTIENT_LOW_LIMBS_RANGE_CONSTRAINT_0`        | $q_{0}[0]$                                               | $q_{1}[0]$                                                |
| `QUOTIENT_LOW_LIMBS_RANGE_CONSTRAINT_1`        | $q_{0}[1]$                                               | $q_{1}[1]$                                                |
| `QUOTIENT_LOW_LIMBS_RANGE_CONSTRAINT_2`        | $q_{0}[2]$                                               | $q_{1}[2]$                                                |
| `QUOTIENT_LOW_LIMBS_RANGE_CONSTRAINT_3`        | $q_{0}[3]$                                               | $q_{1}[3]$                                                |
| `QUOTIENT_LOW_LIMBS_RANGE_CONSTRAINT_4`        | $q_{0}[4]$                                               | $q_{1}[4]$                                                |
| `QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAINT_0`       | $q_{2}[0]$                                               | $q_{3}[0]$                                                |
| `QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAINT_1`       | $q_{2}[1]$                                               | $q_{3}[1]$                                                |
| `QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAINT_2`       | $q_{2}[2]$                                               | $q_{3}[2]$                                                |
| `QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAINT_3`       | $q_{2}[3]$                                               | $q_{3}[3]$                                                |
| `QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAINT_4`       | $q_{2}[4]$                                               | $\textcolor{yellow}{q_{3}[\textsf{tail}]}$ (reassigned)   |
| Carry microlimbs                               |                                                          |                                                           |
| `RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_0`       | $c^{\text{lo}}[0]$                                       | $c^{\text{hi}}[0]$                                        |
| `RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_1`       | $c^{\text{lo}}[1]$                                       | $c^{\text{hi}}[1]$                                        |
| `RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_2`       | $c^{\text{lo}}[2]$                                       | $c^{\text{hi}}[2]$                                        |
| `RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_3`       | $c^{\text{lo}}[3]$                                       | $c^{\text{hi}}[3]$                                        |
| Tail microlimbs                                |                                                          |                                                           |
| `P_X_LOW_LIMBS_RANGE_CONSTRAINT_TAIL`          | $\textcolor{yellow}{P_{x,0}[\textsf{tail}]}$             | $\textcolor{yellow}{P_{x,1}[\textsf{tail}]}$              |
| `P_X_HIGH_LIMBS_RANGE_CONSTRAINT_TAIL`         | $\textcolor{yellow}{P_{x,2}[\textsf{tail}]}$             | $c^{\text{lo}}[4]$ (reassigned)                           |
| `P_Y_LOW_LIMBS_RANGE_CONSTRAINT_TAIL`          | $\textcolor{yellow}{P_{y,0}[\textsf{tail}]}$             | $\textcolor{yellow}{P_{y,1}[\textsf{tail}]}$              |
| `P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_TAIL`         | $\textcolor{yellow}{P_{y,2}[\textsf{tail}]}$             | $c^{\text{hi}}[4]$ (reassigned)                           |
| `Z_LOW_LIMBS_RANGE_CONSTRAINT_TAIL`            | $\textcolor{yellow}{z_{1,0}[\textsf{tail}]}$             | $\textcolor{yellow}{z_{2,0}[\textsf{tail}]}$              |
| `Z_HIGH_LIMBS_RANGE_CONSTRAINT_TAIL`           | $\textcolor{yellow}{z_{1,1}[\textsf{tail}]}$             | $\textcolor{yellow}{z_{2,1}[\textsf{tail}]}$              |
| `ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_TAIL`  | $\textcolor{yellow}{a_{0}^{\text{curr}}[\textsf{tail}]}$ | $\textcolor{yellow}{a_{1}^{\text{curr}}[\textsf{tail}]}$  |
| `ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_TAIL` | $\textcolor{yellow}{a_{2}^{\text{curr}}[\textsf{tail}]}$ | $c^{\text{lo}}[5]$ (reassigned)                           |
| `QUOTIENT_LOW_LIMBS_RANGE_CONSTRAINT_TAIL`     | $\textcolor{yellow}{q_{0}[\textsf{tail}]}$               | $\textcolor{yellow}{q_{1}[\textsf{tail}]}$                |
| `QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAINT_TAIL`    | $\textcolor{yellow}{q_{2}[\textsf{tail}]}$               | $c^{\text{hi}}[5]$ (reassigned)                           |
|                                                |                                                          |                                                           |

The tail microlimbs are shown in yellow and we will explain their role in enforcing tight range constraints in the following sections.
We reuse columns in some cases (to save space) by reassigning them to hold tail microlimbs. For example since limb $P_{x, 3}$ is only 50 bits, it only needs 4 full 14-bit microlimbs. So the odd row in the 5th microlimb column `P_X_HIGH_LIMBS_RANGE_CONSTRAINT_4` is reassigned to hold the tail microlimb for $P_{x,3}$.

### Virtual Columns

Some columns are "virtual" and not explicitly stored in the witness trace. Instead, they are computed on-the-fly during relation evaluation using existing columns. These include:

- Interleaved columns for range constraint microlimbs (computed from the physical microlimb columns)
- Sorted (ordered) columns for range constraint microlimbs (computed by sorting the physical microlimb columns)

### Lagrange Polynomials (Precomputed)

The Translator circuit uses **ZERO selector polynomials** (`NUM_SELECTORS = 0`).

Instead, the circuit uses **Lagrange polynomials** to control which constraints are active:

| Polynomial                     | Description                     | Active Rows                         |
| ------------------------------ | ------------------------------- | ----------------------------------- |
| `lagrange_even_in_minicircuit` | Even indices in mini-circuit    | $i \in {0, 2, 4, ..., 8190}$ (mini) |
| `lagrange_odd_in_minicircuit`  | Odd indices in mini-circuit     | $i \in {1, 3, 5, ..., 8191}$ (mini) |
| `lagrange_first`               | First row                       | $i = 0$                             |
| `lagrange_last_in_minicircuit` | Last row in mini-circuit        | $i = 8191$ (mini)                   |
| `lagrange_result_row`          | Row containing final result     | Specific row in trace               |
| `lagrange_masking`             | Masking rows for zero-knowledge | Last few rows                       |
| `lagrange_mini_masking`        | Masking within mini-circuit     | Last rows of mini-circuit           |

The circuit's regularity (2-row cycles, uniform structure) allows using Lagrange polynomials, which are more efficient than custom selectors.

---

## Interleaving: The Key Optimization

The Translator must range-constrain approximately 64 different microlimb sets using permutation argument. The permutation argument's degree equals $1 + \text{NUM\_COLS}$, where NUM_COLS is the number of columns being permuted:

$$
z_{\textsf{perm}}[i+1] \cdot \prod_{j=1}^{\textsf{NUM\_COLS}} (\textsf{ordered}[j] + \beta + \gamma) =
z_{\textsf{perm}}[i] \cdot \prod_{j=1}^{\textsf{NUM\_COLS}} (\textsf{interleaved}[j] + \beta + \gamma)
$$

**The Problem:** Permuting all ~64 microlimb columns simultaneously yields degree $1 + 64 = 65$, making sumcheck impractical.

**The Solution:** Interleave 16 logical column groups into the same 5 physical wires across 16 circuit segments. Each segment performs an independent permutation check with degree $1 + 5 = 6$ (or 7 with Lagrange selector). This reduces the relation degree by 9×.

### Circuit Structure

```
Mini-circuit size:  2^13 = 8,192 rows    (actual computation)
Full circuit size:  2^17 = 131,072 rows  (16× larger for interleaving)
FULL_SIZE = MINI_SIZE × INTERLEAVING_GROUP_SIZE = 8,192 × 16
```

To compute the interleaved polynomials, we group 16 polynomials together and interleave their coefficients. Consider the following 16 polynomials each of size $n=2^{13}$ in the mini-circuit:

$$
\newcommand{\arraystretch}{1.2}
\begin{array}{|c|c|c|c|c|c|}
\hline
\textsf{index} & \textsf{poly 1} & \textsf{poly 2} & \textsf{poly 3} & \ldots & \textsf{poly 16} \\
\hline
0 & \textcolor{skyblue}{a_0} & \textcolor{orange}{b_0} & \textcolor{lightgreen}{c_0} & \quad \ldots \quad & \textcolor{firebrick}{p_0} \\
1 & \textcolor{skyblue}{a_1} & \textcolor{orange}{b_1} & \textcolor{lightgreen}{c_1} & \quad \ldots \quad & \textcolor{firebrick}{p_1} \\
2 & \textcolor{skyblue}{a_2} & \textcolor{orange}{b_2} & \textcolor{lightgreen}{c_2} & \quad \ldots \quad & \textcolor{firebrick}{p_2} \\
3 & \textcolor{skyblue}{a_3} & \textcolor{orange}{b_3} & \textcolor{lightgreen}{c_3} & \quad \ldots \quad & \textcolor{firebrick}{p_3} \\[5pt]
\vdots & \vdots & \vdots & \vdots & \ddots & \vdots \\[5pt]
n-1 & \textcolor{skyblue}{a_{n-1}} & \textcolor{orange}{b_{n-1}} & \textcolor{lightgreen}{c_{n-1}} & \quad \ldots \quad & \textcolor{firebrick}{p_{n-1}} \\
\hline
\end{array}
\quad \longrightarrow \quad
\begin{array}{|c|c|c|}
\hline
\textsf{group} & \textsf{index} & \textsf{interleaved} \\
\hline
0 & 0 & \textcolor{skyblue}{a_0} \\
0 & 1 & \textcolor{orange}{b_0} \\
0 & 2 & \textcolor{lightgreen}{c_0} \\
\vdots & \vdots & \vdots \\[3pt]
1 & 15 & \textcolor{firebrick}{p_0} \\ \hline
1 & 4 & \textcolor{skyblue}{a_1} \\
1 & 5 & \textcolor{orange}{b_1} \\
1 & 6 & \textcolor{lightgreen}{c_1} \\
\vdots & \vdots & \vdots \\[3pt]
1 & 7 & \textcolor{firebrick}{p_1} \\ \hline
\vdots & \vdots & \vdots \\[5pt]
\vdots & \vdots & \vdots \\ \hline
n-1 & 4n-4 & \textcolor{skyblue}{a_{n-1}} \\
n-1 & 4n-3 & \textcolor{orange}{b_{n-1}} \\
n-1 & 4n-2 & \textcolor{lightgreen}{c_{n-1}} \\
\vdots & \vdots & \vdots \\[3pt]
n-1 & 4n-1 & \textcolor{firebrick}{p_{n-1}} \\
\hline
\end{array}
$$

The resulting interleaved polynomial has size $16n = 2^{17}$.
For 64 microlimb columns, we have 4 groups of 16 columns each, resulting in four interleaved polynomials. Note that the interleaved polynomials are "physical" wires in the circuit trace: we refer to them as virtual polynomials. Each of these groups performs an independent permutation check:

- **Numerator:** 4 interleaved wires + 1 extra = 5 terms
- **Denominator:** 5 ordered wires = 5 terms
- **Degree:** $1 + 5 = 6$ (or 7 with Lagrange)

The permutation argument verifies that within each group, the interleaved values are a permutation of the ordered (sorted) values. Due to interleaving, the total circuit size increases 16×, requiring more zero-padding (enforced by Relation 7). Interleaving trades circuit size (inexpensive) for relation degree (expensive). The 16× size increase is acceptable given the 9× degree reduction.

> $\textcolor{orange}{\textsf{Effect on Commitment Scheme}}$: The interleaved polynomials do not require separate commitments. During proving key construction, the prover computes them for use in sumcheck. In the Gemini PCS phase, the prover sends only **two additional field element evaluations** $P_+(r^{16})$ and $P_-(r^{16})$ where $r$ is the Gemini challenge:
> $$P_{\pm}(x) = \sum_{i=0}^{15} (\pm r)^i \cdot p_{i}(x)$$
> The verifier reconstructs full batched polynomial evaluations as $A_0(r) = A_{0+}(r) + P_+(r^{16})$ and $A_0(-r) = A_{0-}(-r) + P_-(r^{16})$. Since $P_{\pm}(r^{16})$ relates to evaluations $p_i(r^{16})$ already in the Gemini protocol, no additional commitments are needed. The PCS proof grows by only **2 field elements**.
>
> For polynomials $p_0, \dots, p_{15}$ of size $n$, the interleaved polynomial of size $16n$ is:
> $$p_{\textsf{interleaved}}(x) = \sum_{i=0}^{15} x^i \cdot p_{i}(x^{16})$$

---

## The Seven Relations

The Translator circuit enforces correctness through **7 distinct relations** totaling **151 subrelations**.

### Relation 1: Permutation Relation (2 subrelations)

**Purpose:** Prove that all microlimbs are properly range-constrained to 14 bits.

**Method:** Grand product argument over sorted vs. interleaved values.

#### Subrelation 1.1: Grand Product Identity

$$\boxed{(z_{\text{perm}} + L_0) \cdot \prod_{j=0}^{4} (\text{interleaved}_j + \beta \cdot L_{\text{mask}} + \gamma) = (z_{\text{perm,shift}} + L_{\text{last}}) \cdot \prod_{j=0}^{4} (\text{ordered}_j + \beta \cdot L_{\text{mask}} + \gamma)}$$

Where:

- **Numerator:** Product over 4 interleaved range constraint wires + 1 extra numerator
- **Denominator:** Product over 5 ordered range constraint wires
- **Masking:** `lagrange_masking` marks ZK rows to exclude from permutation

**Intuition:** If the multisets match (interleaved = permutation of ordered), the grand product telescopes to 1.

#### Subrelation 1.2: Final Value Check

$$\boxed{L_{\text{last}} \cdot z_{\text{perm,shift}} = 0}$$

Ensures the grand product returns to 1 at the end (accounting for masking).

**Degree:** 7 (highest in Translator)

**Critical for security:** If this fails, an attacker could use out-of-range values, breaking the non-native field arithmetic soundness.

### Relation 2: Delta Range Constraint Relation (10 subrelations)

**Purpose:** Ensure ordered polynomials are actually sorted and bounded.

**Method:** Check consecutive differences and final value.

#### Subrelations 2.1-2.5: Difference Constraints

For each `j ∈ {0, 1, 2, 3, 4}`:

$$\boxed{(L_{\text{real\_last}} - 1) \cdot (L_{\text{mask}} - 1) \cdot \Delta_j \cdot (\Delta_j - 1) \cdot (\Delta_j - 2) \cdot (\Delta_j - 3) = 0}$$

Where:
$$\Delta_j = \text{ordered}_j^{(\text{shift})} - \text{ordered}_j$$

**Meaning:** The difference between consecutive values must be in {0, 1, 2, 3} (non-descending, max step = 3).

**Why max step 3?** This allows the sorted array to contain "step" values every 3 increments, ensuring coverage of [0, 2¹⁴-1] without making the polynomial too dense.

#### Subrelations 2.6-2.10: Maximum Value Constraints

For each `j ∈ {0, 1, 2, 3, 4}`:

$$\boxed{L_{\text{real\_last}} \cdot (\text{ordered}_j - (2^{14} - 1)) = 0}$$

**Meaning:** The last value in each sorted array must be exactly 2¹⁴ - 1 = 16383.

**Together:** These constraints ensure every microlimb ∈ [0, 2¹⁴ - 1], which is the foundation for all range constraints.

**Degree:** 7 (due to 5-way product for difference check)

### Relation 3: Decomposition Relation (48 subrelations)

**Purpose:** Prove that limbs are correctly decomposed into microlimbs and wide limbs into narrow limbs.

**Method:** Polynomial identities checking decomposition formulas.

#### Subrelation Types

**Type A: Binary Limb Decomposition (6 subrelations)**

For each transcript value (x_lo, x_hi, y_lo, y_hi, z₁, z₂):

$$\boxed{L_{\text{even}} \cdot \left( \text{wide\_limb} - \text{limb}_{\text{low}} - 2^{68} \cdot \text{limb}_{\text{high}} \right) = 0}$$

Example for x_lo:
$$X\_LOW\_Y\_HI = P\_X\_LOW\_LIMBS[0] + 2^{68} \cdot P\_X\_LOW\_LIMBS[1]$$

**Type B: Limb to Microlimb Decomposition (44 subrelations)**

For standard 68-bit limbs:

$$\boxed{L_{\text{even}} \cdot \left( \text{limb} - \sum_{k=0}^{4} 2^{14k} \cdot \text{micro}_k - 2^{68} \cdot \text{micro}_{tail} \right) = 0}$$

Example for P.x limb 0:

```
P_X_LOW_LIMBS[0] =
    P_X_LOW_LIMBS_RANGE_CONSTRAINT_0 +
    2^14 · P_X_LOW_LIMBS_RANGE_CONSTRAINT_1 +
    2^28 · P_X_LOW_LIMBS_RANGE_CONSTRAINT_2 +
    2^42 · P_X_LOW_LIMBS_RANGE_CONSTRAINT_3 +
    2^56 · P_X_LOW_LIMBS_RANGE_CONSTRAINT_4 +
    2^68 · P_X_LOW_LIMBS_RANGE_CONSTRAINT_TAIL
```

For top limbs (50-bit, 60-bit, 52-bit), the formula adjusts accordingly.

For relation wide limbs (84-bit):
$$\text{relation\_wide\_limb} = \sum_{k=0}^{5} 2^{14k} \cdot \text{micro}_k$$

**Type C: Tail Microlimb Stricter Constraints (42 subrelations)**

For elements that need exact bit constraints (not just ≤ 68):

$$\boxed{L_{\text{even}} \cdot \left( \text{micro}_4 \cdot 2^{shift} - \text{micro}_{tail} \right) = 0}$$

Example: For 68-bit limb, shift = 4 (since 68 = 14×4 + 12, so top microlimb must be ≤ 2¹² - 1):
$$\text{micro}_4 \cdot 16 = \text{micro}_{tail}$$

Since both `micro_4` and `micro_tail` are constrained to 14 bits by the permutation, this forces `micro_4 ≤ 2¹² - 1`.

**Degree:** 4 (lagrange × decomposition identity)

**Why important:** Without correct decomposition, the non-native arithmetic breaks down completely.

### Relation 4: Non-Native Field Relation (3 subrelations)

**Purpose:** Prove the core accumulation identity in non-native field arithmetic.

**The Formula:**
$$\text{acc}_{\text{prev}} \cdot x + \text{op} + P_x \cdot v + P_y \cdot v^2 + z_1 \cdot v^3 + z_2 \cdot v^4 - \text{quot} \cdot q - \text{acc}_{\text{curr}} = 0$$

This must hold in two moduli for soundness.

#### Subrelation 4.1: Lower Mod 2¹³⁶ Check

Compute the formula using only limbs [0] and parts of limbs [1], check that result ÷ 2¹³⁶ equals `relation_wide_lower_limb`:

$$\boxed{L_{\text{even}} \cdot \left( \text{LOWER\_COMPUTATION} - 2^{136} \cdot \text{relation\_wide\_lower\_limb} \right) = 0}$$

Where `LOWER_COMPUTATION` includes:

```
  acc_prev[0]·x[0] + op + P_x[0]·v[0] + P_y[0]·v²[0] + z₁[0]·v³[0] + z₂[0]·v⁴[0]
+ quot[0]·(-q)[0] - acc_curr[0]
+ 2^68·(
    acc_prev[1]·x[0] + P_x[1]·v[0] + P_y[1]·v²[0] + z₁[1]·v³[0] + z₂[1]·v⁴[0]
  + quot[1]·(-q)[0]
  + acc_prev[0]·x[1] + P_x[0]·v[1] + P_y[0]·v²[1] + z₁[0]·v³[1] + z₂[0]·v⁴[1]
  + quot[0]·(-q)[1] - acc_curr[1]
)
```

All arithmetic is in 𝔽r, but the structure mimics integer arithmetic mod 2¹³⁶.

#### Subrelation 4.2: Higher Mod 2¹³⁶ Check

Use `relation_wide_lower_limb` as carry and compute for limbs [2], [3]:

$$\boxed{L_{\text{even}} \cdot \left( \text{HIGHER\_COMPUTATION} - 2^{136} \cdot \text{relation\_wide\_higher\_limb} \right) = 0}$$

Where `HIGHER_COMPUTATION` includes:

```
relation_wide_lower_limb
+ combinations of limbs: (0,2), (1,1), (2,0), (0,3), (1,2), (2,1), (3,0), ...
+ higher cross-terms from all products
```

**Together (4.1 & 4.2):** Prove the relation holds modulo 2²⁷².

#### Subrelation 4.3: Native Field Check

Reconstruct full elements in 𝔽r and check directly:

$$\boxed{L_{\text{even}} \cdot \text{NATIVE\_CHECK} = 0}$$

Where:

```
NATIVE_CHECK =
  acc_prev_native · x_native + op + P_x_native · v_native + P_y_native · v²_native
  + z₁_native · v³_native + z₂_native · v⁴_native
  - quot_native · q_native - acc_curr_native
```

And:

```
acc_prev_native = acc_prev[0] + 2^68·acc_prev[1] + 2^136·acc_prev[2] + 2^204·acc_prev[3] (mod r)
```

**Degree:** 4 (lagrange × triple products like acc·x)

**Soundness argument:**

- If the relation holds mod 2²⁷² AND mod r
- AND all values are properly range-constrained
- THEN 2²⁷² · r > 2⁵¹⁴ > max_possible_value
- IMPLIES the relation holds in integers
- IMPLIES the relation holds mod q (since q < 2²⁵⁴)

**This is the heart of the Translator circuit.**

### Relation 5: Opcode Constraint Relation (5 subrelations)

**Purpose:** Ensure opcodes are valid: op ∈ {0, 1, 2, 3, 4, 8}.

**Method:** Enforce polynomial identity with roots at valid opcodes.

$$\boxed{(L_{\text{even}} + L_{\text{mini\_mask}}) \cdot \text{op} \cdot (\text{op} - 1) \cdot (\text{op} - 2) \cdot (\text{op} - 3) \cdot (\text{op} - 4) \cdot (\text{op} - 8) = 0}$$

Actually implemented as 5 separate subrelations for efficiency (one per opcode comparison).

**Degree:** 6 (lagrange × 5-way product)

**Why important:** Invalid opcodes could allow injection of arbitrary values into the accumulation.

### Relation 6: Accumulator Transfer Relation (12 subrelations)

**Purpose:** Handle non-arithmetic accumulator transitions (initialization, copying, finalization).

#### Subrelations 6.1-6.4: Copy at Odd Rows

At odd rows, accumulator should not change:

$$\boxed{L_{\text{odd}} \cdot (\text{acc\_limb}_i - \text{acc\_limb}_i^{(\text{shift})}) = 0}$$

For `i ∈ {0, 1, 2, 3}`.

#### Subrelations 6.5-6.8: Initialize to Zero

At the start of accumulation (first row):

$$\boxed{L_{\text{first}} \cdot \text{acc\_limb}_i = 0}$$

For `i ∈ {0, 1, 2, 3}`.

#### Subrelations 6.9-6.12: Final Result Check

At the result row, accumulator must match expected value:

$$\boxed{L_{\text{result}} \cdot (\text{acc\_limb}_i - \text{expected\_result\_limb}_i) = 0}$$

For `i ∈ {0, 1, 2, 3}`.

The expected result is provided as relation parameters (from ECCVM output).

**Degree:** 4 (lagrange × difference)

### Relation 7: Zero Constraints Relation (68 subrelations)

**Purpose:** Ensure all range constraint microlimb wires are zero outside the mini-circuit.

**Why needed:** The interleaving structure means full circuit is 16× larger than mini-circuit. Rows outside mini-circuit must be zero to avoid polluting the permutation argument.

For each of 64 range constraint wires + 4 transcript wires:

$$\boxed{(L_{\text{odd}} + L_{\text{even}} + L_{\text{mini\_mask}})^{\text{complement}} \cdot \text{wire}_i = 0}$$

Equivalently (via De Morgan):
$$\boxed{\neg(L_{\text{in\_mini}} \lor L_{\text{mask}}) \implies \text{wire}_i = 0}$$

**Special case for no-ops:** If `op = 0` at even rows, additional constraints force range wires to zero.

**Degree:** 4 (lagrange × wire value)

**Why important:** Without this, garbage values in unused rows could satisfy the permutation argument while violating actual range constraints.

---

## Proof System Details

### Proof System Type

**TranslatorFlavor** uses:

- **HyperNova-style sumcheck** with ZK (zero-knowledge)
- **KZG polynomial commitment scheme** over BN254
- **Libra** for ZK masking
- **Gemini + Shplonk** for batched polynomial openings (Shplemini protocol)

### Inputs to the Prover

```cpp
struct TranslatorProverInput {
    // From ECCVM
    std::vector<UltraOp> ecc_op_queue;          // EC operations to batch
    Fq evaluation_challenge_x;                   // Challenge point x ∈ Fq
    Fq batching_challenge_v;                     // Batching challenge v ∈ Fq

    // Expected output (from ECCVM verification)
    Fq expected_accumulator_result;              // What acc_final should be

    // Powers of challenges (precomputed)
    Fq x;
    Fq v, v_squared, v_cubed, v_quarted;

    // Proving key
    std::shared_ptr<TranslatorProvingKey> proving_key;
};
```

**Construction:**

1. For each `UltraOp` in the queue, generate witness values:
   - Decompose P.x, P.y, z₁, z₂ into limbs and microlimbs
   - Compute quotient and new accumulator
   - Compute relation wide limbs
2. Fill witness polynomials (81 wires × circuit_size values)
3. Construct ordered range constraint polynomials via sorting
4. Create interleaved polynomials

### Prover Algorithm

```
TranslatorProver::prove():
  1. OINK phase (witness commitment):
     - Commit to all 91 witness polynomials (90 + masking)
     - Generate commitment challenges

  2. Sumcheck phase:
     - For each round d = 1 to 17:
       - Compute sumcheck univariates over all 7 relations
       - Send univariate coefficients to verifier
       - Receive challenge u_d
     - Output: Claimed evaluations at challenge point ū

  3. Libra ZK sumcheck masking:
     - Generate ZK commitments
     - Prove claimed evaluation matches with ZK

  4. Gemini multilinear opening:
     - Fold multilinear polynomials d-1 times
     - Reduce to d univariate openings

  5. Shplonk batching:
     - Batch all opening claims
     - Reduce to single KZG opening

  6. KZG opening proof:
     - Compute W commitment
     - Output final opening proof

  Return: TranslatorProof (568 field elements)
```

### Outputs from the Prover

```cpp
struct TranslatorProof {
    std::vector<Fr> proof_data;       // 568 field elements
    Fq accumulated_result;            // The batched evaluation result (Fq element)
};
```

The proof contains:

1. Witness commitments (88 × 2 = 176 Fr elements)
2. Libra commitments and sum (2 + 1 = 3 Fr)
3. Sumcheck univariates (17 rounds × 8 coefficients = 136 Fr)
4. Sumcheck evaluations (188 Fr)
5. Libra evaluation (1 Fr)
6. Libra grand sum and quotient commitments (2 + 2 = 4 Fr)
7. Gemini commitments (16 × 2 = 32 Fr)
8. Gemini evaluations (17 Fr)
9. Gemini positive/negative evaluations (2 Fr)
10. SmallSubgroupIPA evaluations (4 Fr)
11. Shplonk Q commitment (2 Fr)
12. KZG W commitment (2 Fr)
13. Accumulated result in Fq (1 Fq = 1 Fr for encoding)

### Verifier Algorithm

```
TranslatorVerifier::verify(proof, vk):
  1. Deserialize proof

  2. Reconstruct challenges (Fiat-Shamir):
     - Hash commitments to generate challenges

  3. Sumcheck verification:
     - For each round, check univariate identity
     - Accumulate claimed evaluations

  4. Libra verification:
     - Verify ZK grand sum
     - Check claimed evaluation

  5. Gemini verification:
     - Verify fold commitments
     - Check evaluation consistency

  6. Shplonk verification:
     - Batch all opening claims

  7. KZG pairing check:
     - Compute pairing e(W, [τ]₂) vs e(commitment, [1]₂)
     - Accept if pairing checks pass

  8. Check accumulated_result matches expected:
     - Compare proof's accumulator against ECCVM output

  Return: accept/reject
```

---

## Proof Size Analysis

As computed in CHONK_MATH_EXPLAINED.md, the Translator proof size is:

### Detailed Breakdown

| Component                         | Formula      | Field Elements |
| --------------------------------- | ------------ | -------------- |
| 1. Accumulated result (BN254 Fq)  | `1 × 1`      | **1**          |
| 2. Witness commitments            | `88 × 2`     | **176**        |
| 3. Libra concatenation commitment | `1 × 2`      | **2**          |
| 4. Libra sum                      | `1 × 1`      | **1**          |
| 5. Sumcheck univariates           | `17 × 8 × 1` | **136**        |
| 6. Sumcheck evaluations           | `188 × 1`    | **188**        |
| 7. Libra claimed evaluation       | `1 × 1`      | **1**          |
| 8. Libra grand sum commitment     | `1 × 2`      | **2**          |
| 9. Libra quotient commitment      | `1 × 2`      | **2**          |
| 10. Gemini fold commitments       | `16 × 2`     | **32**         |
| 11. Gemini evaluations            | `17 × 1`     | **17**         |
| 12. Gemini P positive evaluation  | `1 × 1`      | **1**          |
| 13. Gemini P negative evaluation  | `1 × 1`      | **1**          |
| 14. SmallSubgroupIPA evals        | `4 × 1`      | **4**          |
| 15. Shplonk Q commitment          | `1 × 2`      | **2**          |
| 16. KZG opening commitment        | `1 × 2`      | **2**          |

**Total: 568 field elements = 568 × 32 bytes = 18,176 bytes ≈ 17.8 KB**

### Comparison with Other Components

| Component      | Size (field elements) | Size (KB) | Percentage of Chonk |
| -------------- | --------------------- | --------- | ------------------- |
| **Translator** | **568**               | **17.8**  | **37.6%**           |
| Mega ZK        | 356                   | 11.1      | 23.6%               |
| ECCVM          | 488                   | 15.2      | 32.3%               |
| Merge          | 42                    | 1.3       | 2.8%                |

**Insight:** Translator is the **largest single component** in the Chonk proof, primarily due to:

1. 188 sumcheck evaluations (all 91 witness + 86 derived + shifts)
2. 136 sumcheck univariates (17 rounds × 8 coefficients)
3. 176 witness commitments (88 polynomials)

The large number of witness polynomials (81 explicit + derived) drives the proof size.

---

## Critical Components for Auditing

Ranked from most to least critical for security:

### 🔴 **CRITICAL (Audit First)**

#### 1. Non-Native Field Relation (Relation 4)

**File:** `translator_non_native_field_relation.hpp`

**Why critical:**

- **Core soundness:** This is the heart of the circuit. If this relation is wrong, the entire translation is invalid.
- **Complex arithmetic:** Involves intricate modular arithmetic across two moduli with limb-based computation.
- **Overflow risks:** If the mod 2²⁷² check is wrong, overflow could allow false proofs.

**What to audit:**

- Verify the limb combination formulas match the mathematical specification exactly
- Check all powers of 2 (2⁶⁸, 2¹³⁶, etc.) are correct
- Ensure the "wide" relation limbs correctly capture carries
- Confirm native field reconstruction is complete (all cross-terms present)
- Test edge cases: maximum values, zero values, boundary conditions

**Attack vector:** Incorrect arithmetic could allow proving wrong evaluations, breaking Goblin soundness.

#### 2. Permutation Relation (Relation 1)

**File:** `translator_permutation_relation.hpp`

**Why critical:**

- **Foundation for range constraints:** If permutation is broken, attacker can use out-of-range values.
- **Grand product soundness:** The z_perm computation must be absolutely correct.
- **Masking handling:** ZK rows must be properly excluded.

**What to audit:**

- Verify grand product formula matches the specification
- Check initialization (z_perm[0] = 1 accounting for L_0)
- Verify finalization (z_perm[last] = 0 accounting for L_last and masking)
- Ensure interleaving structure is correctly implemented
- Test with malicious permutations

**Attack vector:** Broken permutation → use 2⁶⁸ instead of 2¹⁴ limbs → completely break non-native arithmetic.

#### 3. Delta Range Constraint Relation (Relation 2)

**File:** `translator_delta_range_constraint_relation.hpp`

**Why critical:**

- **Enforces sorted property:** Without this, permutation check is meaningless.
- **Maximum value check:** Must ensure final value is exactly 2¹⁴ - 1.
- **Step constraint:** Max step of 3 is necessary for coverage.

**What to audit:**

- Verify Δ ∈ {0,1,2,3} check is correctly implemented
- Confirm final value check at lagrange_last is exact
- Check masking rows are properly excluded
- Test boundary: can attacker craft a sequence that looks sorted but isn't?

**Attack vector:** Wrong max value (e.g., 2¹⁵ instead of 2¹⁴) → double the range → break soundness.

### 🟠 **HIGH PRIORITY**

#### 4. Decomposition Relation (Relation 3)

**File:** `translator_decomposition_relation.hpp`

**Why high priority:**

- **Ensures consistency:** Limbs must match original values.
- **Many subrelations (48):** More code = more potential bugs.
- **Tail microlimb logic:** The shift factors must be exact.

**What to audit:**

- Verify all 48 decomposition formulas match specification
- Check powers of 2 are correct (2⁶⁸, 2¹⁴, etc.)
- Confirm tail shift calculations (especially the ×4, ×16 multipliers)
- Test: provide wrong decomposition, ensure relation catches it

**Attack vector:** Wrong decomposition → mismatch between transcript and limbs → arbitrary values.

#### 5. Opcode Constraint Relation (Relation 5)

**File:** `translator_extra_relations.hpp`

**Why high priority:**

- **Input validation:** Invalid opcodes could inject malicious data.
- **Relatively simple:** But critical to get right.

**What to audit:**

- Verify opcode set {0, 1, 2, 3, 4, 8} is complete and correct
- Check polynomial roots match opcodes exactly
- Ensure masking rows are handled

**Attack vector:** Missing opcode constraint → inject opcode 255 → break accumulation logic.

### 🟡 **MEDIUM PRIORITY**

#### 6. Accumulator Transfer Relation (Relation 6)

**File:** `translator_extra_relations.hpp`

**Why medium priority:**

- **Ensures state consistency:** But doesn't directly affect arithmetic soundness.
- **Edge cases:** Initialization and finalization must be correct.

**What to audit:**

- Verify odd row copy constraint is active at all odd rows
- Check initialization to zero at start
- Confirm final result comparison uses correct expected value
- Test: try to skip initialization, see if caught

**Attack vector:** Wrong initialization → start with non-zero acc → offset all computations.

#### 7. Zero Constraints Relation (Relation 7)

**File:** `translator_extra_relations.hpp`

**Why medium priority:**

- **Cleanup relation:** Ensures unused rows don't pollute permutation.
- **Many subrelations (68):** But mostly repetitive.

**What to audit:**

- Verify all 68 wires are covered
- Check lagrange polynomial logic for "outside minicircuit"
- Ensure no-op case (op = 0) is handled correctly

**Attack vector:** Garbage in unused rows → permutation allows wrong values → potential soundness break.

### 🟢 **LOW PRIORITY (But Still Check)**

#### 8. Circuit Builder Logic

**File:** `translator_circuit_builder.cpp`

**Why low priority for audit:**

- Prover-side only (doesn't affect verification soundness directly)
- But bugs here could cause proof generation failures

**What to check:**

- Witness generation formulas match relation formulas
- Quotient calculation is correct
- Microlimb splitting logic matches decomposition relation

#### 9. Flavor Configuration

**File:** `translator_flavor.hpp`

**Why low priority:**

- Configuration and constants
- But errors here (wrong NUM_LIMB_BITS) would be catastrophic

**What to check:**

- All constants match specification
- Proof length formula is correct
- Polynomial commitment configuration is sound

---

## Audit Checklist

Use this checklist when auditing the Translator:

### Mathematical Specification

- [ ] Verify q (Fq modulus) is correct BN254 base field
- [ ] Verify r (Fr modulus) is correct BN254 scalar field
- [ ] Confirm 2²⁷² · r > 2⁵¹⁴ (soundness bound)
- [ ] Check limb sizes: 68, 68, 68, 50 bits for 254-bit values
- [ ] Verify microlimb size: 14 bits
- [ ] Confirm SORT_STEP = 3 is sufficient for coverage

### Non-Native Field Arithmetic

- [ ] Audit all limb combination formulas in subrelation 4.1
- [ ] Audit all limb combination formulas in subrelation 4.2
- [ ] Verify native field reconstruction in subrelation 4.3
- [ ] Test with maximum value inputs
- [ ] Test with zero inputs
- [ ] Test with adversarial quotients

### Range Constraints

- [ ] Verify permutation grand product formula
- [ ] Check delta constraint polynomial (degree 5 product)
- [ ] Confirm final value = 2¹⁴ - 1 exactly
- [ ] Test with out-of-order values
- [ ] Test with values > 2¹⁴

### Decomposition

- [ ] Verify all 6 binary limb decompositions
- [ ] Verify all 44 microlimb decompositions
- [ ] Check all 42 tail microlimb stricter constraints
- [ ] Test with wrong decompositions

### Edge Cases

- [ ] First row (initialization)
- [ ] Last row (finalization)
- [ ] No-op case (op = 0)
- [ ] Masking rows (ZK)
- [ ] Interleaving boundary

### Implementation

- [ ] Code review all relation implementations
- [ ] Verify relation degrees match specification
- [ ] Check lagrange polynomial usage is correct
- [ ] Ensure no off-by-one errors in indices
- [ ] Test proof generation and verification end-to-end

---

**Document Version:** 1.0
**Author:** ZK Content Expert
**Last Updated:** 2025-12-04
**Purpose:** Advanced Modern Cryptography Course Material & Security Audit Guide
