# The Translator Circuit: Complete Technical Specification

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

## Interleaving: The Key Optimization

### Why Interleaving is Necessary

The Translator needs to perform range constraints on ~64 different microlimb sets using a permutation argument. Without optimization, this creates a major problem with the relation degree.

**The Core Issue: Permutation Argument Degree**

In a permutation argument, the degree of the relation is determined by **how many columns** are being permuted simultaneously:

```
Grand product relation:
z_perm[i+1] × ∏_{j=1}^{NUM_COLS} (ordered[j] + β + γ) =
z_perm[i] × ∏_{j=1}^{NUM_COLS} (interleaved[j] + β + γ)

Degree = 1 + NUM_COLS (polynomial z_perm × product of NUM_COLS columns)
```

$$
z_{\textsf{perm}}[i+1] \cdot \prod_{j=1}^{\textsf{NUM\_COLS}} (\textsf{ordered}[j] + \beta + \gamma) =
z_{\textsf{perm}}[i] \cdot \prod_{j=1}^{\textsf{NUM\_COLS}} (\textsf{interleaved}[j] + \beta + \gamma)
$$

**The Translator's Challenge:**

- We have **~64 different logical microlimb columns** that need range constraints:
  - P.x: 4 limbs × 6 microlimbs each = 24 microlimb columns
  - P.y: 4 limbs × 6 microlimbs each = 24 microlimb columns
  - z₁, z₂: 4 limbs × 6 microlimbs each = 24 microlimb columns
  - Accumulator: 4 limbs × 6 microlimbs each = 24 microlimb columns
  - Quotient: 4 limbs × 6 microlimbs each = 24 microlimb columns
  - Relation wide limbs: 2 × 6 microlimbs = 12 microlimb columns
  - **Total: ~130 logical microlimb columns** (many reuse physical wires)

**Naive approach:**
If we tried to permute all ~64 active columns at once:

- Degree = 1 + 64 = **65**
- This is **prohibitively expensive** for sumcheck!
- The relation would dominate proof generation time
- Higher degree = more FFT operations, more commitment cost

**The Solution: Interleaving to Reduce Column Count**

Instead of checking 64 columns in one permutation, we:

1. **Group 16 logical columns together** and pack them into the circuit at different row segments
2. **Use only 5 physical wires** for each permutation check (4 interleaved + 1 extra numerator)
3. **Reuse these 5 wires across 16 different segments** of the circuit
4. Each segment checks a different subset of ~4 logical columns from the original 64

**Result:**

- Relation degree: 1 + 5 = **6** (plus Lagrange = 7 total)
- This is manageable for the proof system!
- We perform 16 separate permutation checks (one per segment), each with low degree

### How Interleaving Works

#### The Basic Concept

**Mini-circuit vs. Full Circuit:**

```
Mini-circuit size:  2^13 = 8,192 rows    (where actual computation happens)
Full circuit size:  2^17 = 131,072 rows  (16× larger for interleaving)

Relationship: FULL_SIZE = MINI_SIZE × INTERLEAVING_GROUP_SIZE
             131,072    = 8,192      × 16
```

**Key idea:** Instead of 64+ columns in one permutation check (degree 65+), we group logical columns together and reuse 5 physical columns across 16 circuit segments (degree 7).

#### The Interleaving Structure

For each **set of range constraint wires** (e.g., all P.x microlimbs), we create two types of polynomials:

**1. Interleaved Polynomials** (in full circuit)

- Size: 131,072 (full circuit size)
- Contains microlimbs from **multiple mini-circuit rows** packed together

**2. Ordered Polynomials** (in full circuit)

- Size: 131,072 (full circuit size)
- Contains the **sorted version** of the interleaved values

### Detailed Interleaving Mapping

Let's trace exactly how microlimbs from the mini-circuit map to the full circuit:

#### Example: P.x Low Limbs Range Constraint 0 (First Microlimb)

**In the mini-circuit:** Each even row i ∈ {0, 2, 4, ..., 8190} generates a microlimb value:

```
mini_row 0    → P_X_LOW_LIMBS_RANGE_CONSTRAINT_0[0]    = micro_0_0
mini_row 2    → P_X_LOW_LIMBS_RANGE_CONSTRAINT_0[2]    = micro_0_2
mini_row 4    → P_X_LOW_LIMBS_RANGE_CONSTRAINT_0[4]    = micro_0_4
...
mini_row 8190 → P_X_LOW_LIMBS_RANGE_CONSTRAINT_0[8190] = micro_0_8190
```

Total: ~4,096 microlimbs (half of 8,192 rows, since only even rows are active).

**Interleaving into full circuit:**

These 4,096 values are **interleaved** into 16 groups:

```
Group 0:  mini_rows {0, 32, 64, 96, ...}     → full_circuit rows {0, 1, 2, 3, ...}
Group 1:  mini_rows {2, 34, 66, 98, ...}     → full_circuit rows {8192, 8193, 8194, ...}
Group 2:  mini_rows {4, 36, 68, 100, ...}    → full_circuit rows {16384, 16385, 16386, ...}
...
Group 15: mini_rows {30, 62, 94, 126, ...}   → full_circuit rows {122880, 122881, 122882, ...}
```

**Formula:**

```
For mini_row = 2k (even rows only):
  group_id = k mod 16
  position_in_group = k ÷ 16

  full_circuit_row = group_id × 8192 + position_in_group
```

**Example calculation:**

```
mini_row = 64 (32nd even row, so k = 32)
  group_id = 32 mod 16 = 0
  position = 32 ÷ 16 = 2
  full_circuit_row = 0 × 8192 + 2 = 2

mini_row = 66 (33rd even row, so k = 33)
  group_id = 33 mod 16 = 1
  position = 33 ÷ 16 = 2
  full_circuit_row = 1 × 8192 + 2 = 8194
```

### The Complete Circuit Trace Structure

Here's the exact layout of the full circuit with interleaving:

```
┌─────────────────────────────────────────────────────────────────┐
│                    FULL CIRCUIT (2^17 = 131,072 rows)           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  INTERLEAVED GROUP 0                           Rows 0-8191     │
│  ├─ Contains values from mini_rows: 0, 32, 64, 96, ...        │
│  ├─ interleaved_range_constraints_0[i] for i ∈ [0, 8191]      │
│  └─ ordered_range_constraints_0[i] = sorted version            │
│                                                                 │
│  INTERLEAVED GROUP 1                           Rows 8192-16383  │
│  ├─ Contains values from mini_rows: 2, 34, 66, 98, ...        │
│  ├─ interleaved_range_constraints_1[i]                         │
│  └─ ordered_range_constraints_1[i] = sorted version            │
│                                                                 │
│  INTERLEAVED GROUP 2                           Rows 16384-24575 │
│  ├─ Contains values from mini_rows: 4, 36, 68, 100, ...       │
│  ├─ interleaved_range_constraints_2[i]                         │
│  └─ ordered_range_constraints_2[i] = sorted version            │
│                                                                 │
│  INTERLEAVED GROUP 3                           Rows 24576-32767 │
│  ├─ Contains values from mini_rows: 6, 38, 70, 102, ...       │
│  ├─ interleaved_range_constraints_3[i]                         │
│  └─ ordered_range_constraints_3[i] = sorted version            │
│                                                                 │
│  ...                                                            │
│  (Groups 4-14 follow same pattern)                             │
│  ...                                                            │
│                                                                 │
│  INTERLEAVED GROUP 15                          Rows 122880-131071│
│  ├─ Contains values from mini_rows: 30, 62, 94, 126, ...      │
│  ├─ interleaved_range_constraints_4[i] (reuses wire 4)        │
│  └─ ordered_range_constraints_4[i] = sorted version            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Important observation:** We only have **5 physical wires** for range constraints:

- `ordered_range_constraints_0` through `ordered_range_constraints_4`
- `interleaved_range_constraints_0` through `interleaved_range_constraints_3`
- Plus one extra numerator wire

But we need to check **many more** microlimb sets. The solution:

- Each wire is **reused across different interleaving groups**
- Within each 8,192-row segment, the wire represents a different logical microlimb set
- The permutation argument operates **within each segment independently**

### Why Interleaving Reduces Relation Degree

**The Critical Insight: Degree = Number of Columns in Product**

The permutation relation has the form:

```
z_perm[i+1] × ∏_{j=0}^{NUM_COLS-1} (ordered[j][i] + β + γ) =
z_perm[i] × ∏_{j=0}^{NUM_COLS-1} (interleaved[j][i] + β + γ)
```

**Degree = 1 (from z_perm) + NUM_COLS (from the products)**

**Without interleaving (naive approach):**

```
Check all ~64 logical microlimb columns in one relation:

Relation:
  z_perm[i+1] × ∏_{j=0}^{63} (ordered[j][i] + β + γ) =
  z_perm[i] × ∏_{j=0}^{63} (interleaved[j][i] + β + γ)

DEGREE = 1 + 64 = 65

This creates a degree-65 relation!
- Sumcheck round complexity: 65 univariate polynomials per round
- FFT operations: O(n · 65)
- Prover time: dominated by high-degree relation
- **Completely impractical!**
```

**With interleaving (only 5 physical columns per check):**

```
Group 16 logical columns together, use 5 physical wires per segment:

Relation (same for all 16 segments):
  z_perm[i+1] × (ordered_0[i] + β + γ)
               × (ordered_1[i] + β + γ)
               × (ordered_2[i] + β + γ)
               × (ordered_3[i] + β + γ)
               × (ordered_4[i] + β + γ)
             = z_perm[i] × (interleaved_0[i] + β + γ)
                          × (interleaved_1[i] + β + γ)
                          × (interleaved_2[i] + β + γ)
                          × (interleaved_3[i] + β + γ)
                          × (extra_numerator[i] + β + γ)

DEGREE = 1 + 5 = 6 (or 7 with Lagrange selector)

Much more manageable!
```

**Degree reduction: 65 → 7 (more than 9× reduction!)**

**How it works:**

- **Segment 0** (rows 0-8,191): Wires represent logical columns {0, 1, 2, 3, 4}
- **Segment 1** (rows 8,192-16,383): Same wires represent logical columns {5, 6, 7, 8, 9}
- **Segment 2** (rows 16,384-24,575): Same wires represent logical columns {10, 11, 12, 13, 14}
- ... and so on for 16 segments

Each segment checks a different subset of logical columns, but all use the **same low-degree relation**!

### The Permutation Check with Interleaving

The permutation relation operates **within each 8,192-row segment**:

**For segment s ∈ {0, 1, ..., 15}:**

```
Base row index: base = s × 8,192

For row i within segment [0, 8191]:
  full_row = base + i

  z_perm[full_row + 1] × DENOMINATOR = z_perm[full_row] × NUMERATOR

  Where:
    NUMERATOR = (interleaved_0[full_row] + β·L_mask + γ)
              × (interleaved_1[full_row] + β·L_mask + γ)
              × (interleaved_2[full_row] + β·L_mask + γ)
              × (interleaved_3[full_row] + β·L_mask + γ)
              × (extra_numerator[full_row] + β·L_mask + γ)

    DENOMINATOR = (ordered_0[full_row] + β·L_mask + γ)
                × (ordered_1[full_row] + β·L_mask + γ)
                × (ordered_2[full_row] + β·L_mask + γ)
                × (ordered_3[full_row] + β·L_mask + γ)
                × (ordered_4[full_row] + β·L_mask + γ)
```

**Key insight:** The permutation argument doesn't know or care that these values came from different mini-circuit rows. It just checks that within each 8,192-row segment, the interleaved values are a permutation of the ordered values.

### Concrete Example: Tracing One Microlimb

Let's trace one specific microlimb through the entire system:

**Setup:**

- We're checking P.x_low_limbs[0] (first 68-bit limb of P.x's lower 136 bits)
- At mini_row = 100 (even row, 50th accumulation)
- The value of the first 14-bit microlimb is: `micro = 0x2A5F = 10847`

**Step 1: Mini-circuit computation (row 100)**

```
P_X_LOW_LIMBS[0] = limb_value = 0x1234567890ABCDEF
Decompose into microlimbs:
  P_X_LOW_LIMBS_RANGE_CONSTRAINT_0[100] = 0xCDEF = 52719
  P_X_LOW_LIMBS_RANGE_CONSTRAINT_1[100] = 0x9012 = 36882
  ...
```

**Step 2: Determine interleaving group**

```
k = 100 / 2 = 50 (since mini_row 100 is the 50th even row)
group_id = 50 mod 16 = 2
position = 50 ÷ 16 = 3
```

**Step 3: Map to full circuit**

```
full_circuit_row = 2 × 8192 + 3 = 16384 + 3 = 16387

interleaved_range_constraints_2[16387] = 52719
```

**Step 4: Sorting**

All microlimbs in group 2 are collected and sorted:

```
interleaved_2 = [52719, 36882, ..., 4096 more values from group 2 mini-rows]
ordered_2     = sorted(interleaved_2) = [0, 0, 0, ..., 1, 1, 2, ..., 16383]
                                           ↑ with step values inserted
```

**Step 5: Permutation check**

The permutation relation verifies:

```
For full_circuit_row ∈ [16384, 24575] (group 2 segment):

  Accumulate in z_perm:
    z_perm[16384] = 1
    z_perm[16385] = z_perm[16384] × (interleaved_2[16384] + ...) / (ordered_2[16384] + ...)
    ...
    z_perm[16387] = ... includes our value 52719 ...
    ...
    z_perm[24575] should equal 1 (modulo public input delta)
```

If the permutation is valid, our microlimb `52719` is proven to be ≤ 16383. ✓

### The Sorted Array Structure

Each `ordered_range_constraints_j` polynomial contains:

```
Row 0:     0
Row 1:     0      (possible duplicate)
Row 2:     0      (possible duplicate)
Row 3:     1      (step by 0 or 1 or 2 or 3)
Row 4:     3      (step by 2)
Row 5:     4      (step by 1)
Row 6:     7      (step by 3)
Row 7:     7      (possible duplicate, step by 0)
...
Row 5461:  16380  (step by 3)
Row 5462:  16383  (step by 3)
Row 5463:  16383  ← Last value must be exactly 16383
```

With periodic "step" values inserted every few rows to ensure coverage of [0, 16383]. The delta range constraint relation enforces:

1. Each step ∈ {0, 1, 2, 3}
2. Final value = 16383

### Benefits of Interleaving

**1. Relation Degree Reduction (Most Important):**

- **From degree 65 to degree 7** (9× reduction)
- This is the primary benefit - keeps relations efficient
- Sumcheck complexity is dominated by max relation degree

**2. Proof Size Stays Constant:**

- Only need one z_perm polynomial
- Reuse it across all 16 segments
- Proof doesn't grow with number of groups

**3. Verification Efficiency:**

- Verifier checks same polynomial across segments
- No additional cost for more interleaving groups

**4. Flexibility:**

- Can adjust INTERLEAVING_GROUP_SIZE based on circuit size
- Balances polynomial degree vs. circuit size blowup

### Trade-offs

**Cost of interleaving:**

- Circuit size increases by 16× (from 8,192 to 131,072 rows)
- More zero padding needed (Relation 7 ensures unused rows are zero)
- More complex witness generation (need to correctly map mini-circuit to full circuit)

**Why it's worth it:**

- **Relation degree reduction** >>> circuit size increase
- Sumcheck is dominated by max relation degree
- Without interleaving, degree-65 relation would make the circuit impractical
- With interleaving, degree-7 is manageable for production use

### Summary

**Interleaving is the technique that makes the Translator practical:**

Without interleaving:

- Permutation checks ~64 columns at once
- **Relation degree: 65**
- Sumcheck with degree-65 polynomials: impractical
- Prover time: hours (if even feasible)
- Unusable in production

With interleaving:

- Permutation checks only 5 columns at once
- **Relation degree: 7**
- Circuit size: 131,072 rows (16× increase, acceptable trade-off)
- Prover time: minutes
- **Production-ready! ✓**

**The key insight:** Interleaving trades circuit size (cheap to increase) for relation degree (expensive if high). By grouping 16 logical columns together and reusing 5 physical wires across 16 circuit segments, we keep the relation degree low while still checking all necessary columns.

---

## Witness Polynomials (81 Total)

The Translator circuit uses **81 witness polynomials** (no selector polynomials). These can be categorized as follows:

### Category 1: EccOpQueue Transcript (4 wires)

These contain the raw data from the EC operation queue:

| Wire         | Description                                                 | Range              |
| ------------ | ----------------------------------------------------------- | ------------------ |
| `OP`         | Operation code                                              | {0, 1, 2, 3, 4, 8} |
| `X_LOW_Y_HI` | P.x_lo (136-bit) at even rows, P.y_hi (118-bit) at odd rows | < 2¹³⁶ or < 2¹¹⁸   |
| `X_HIGH_Z_1` | P.x_hi (118-bit) at even rows, z₁ (128-bit) at odd rows     | < 2¹¹⁸ or < 2¹²⁸   |
| `Y_LOW_Z_2`  | P.y_lo (136-bit) at even rows, z₂ (128-bit) at odd rows     | < 2¹³⁶ or < 2¹²⁸   |

**Note:** The circuit operates in a 2-row cycle:

- **Even rows (accumulation):** Compute new accumulator value
- **Odd rows (copy):** Transfer accumulator to next cycle

### Category 2: Binary Limb Decompositions (12 wires)

These decompose coordinates and z-values into 68-bit limbs:

**P.x limbs (4 wires):**

- `P_X_LOW_LIMBS`: Two 68-bit limbs from P.x_lo
- `P_X_HIGH_LIMBS`: One 68-bit + one 50-bit limb from P.x_hi

**P.y limbs (4 wires):**

- `P_Y_LOW_LIMBS`: Two 68-bit limbs from P.y_lo
- `P_Y_HIGH_LIMBS`: One 68-bit + one 50-bit limb from P.y_hi

**z limbs (4 wires):**

- `Z_LOW_LIMBS`: 68-bit limbs of z₁ and z₂ (low parts)
- `Z_HIGH_LIMBS`: 60-bit limbs of z₁ and z₂ (high parts)

### Category 3: Accumulator Limbs (4 wires)

Store current and previous accumulator values:

| Wire                          | Description                 | Bits per limb |
| ----------------------------- | --------------------------- | ------------- |
| `ACCUMULATORS_BINARY_LIMBS_0` | Limb 0 (current & previous) | 68 bits       |
| `ACCUMULATORS_BINARY_LIMBS_1` | Limb 1 (current & previous) | 68 bits       |
| `ACCUMULATORS_BINARY_LIMBS_2` | Limb 2 (current & previous) | 68 bits       |
| `ACCUMULATORS_BINARY_LIMBS_3` | Limb 3 (current & previous) | 50 bits       |

**Layout:** Previous accumulator is at higher indices (row i+1) due to KZG commitment structure.

### Category 4: Quotient Limbs (2 wires)

The quotient from dividing by q:

| Wire                         | Description                  |
| ---------------------------- | ---------------------------- |
| `QUOTIENT_LOW_BINARY_LIMBS`  | Lower two 68-bit limbs       |
| `QUOTIENT_HIGH_BINARY_LIMBS` | One 68-bit + one 52-bit limb |

### Category 5: Relation Wide Limbs (1 wire)

Used for modulo 2²⁷² computation:

| Wire                  | Description                           | Bits         |
| --------------------- | ------------------------------------- | ------------ |
| `RELATION_WIDE_LIMBS` | Carries for 136-bit computation steps | 84 bits each |

Contains two values:

- **relation_wide_lower_limb:** Carry from lower 136-bit computation
- **relation_wide_higher_limb:** Carry from higher 136-bit computation

### Category 6: Range Constraint Microlimbs (52 wires)

Each limb is further decomposed into 14-bit microlimbs for tight range constraints:

**Pattern for each element (P.x_lo, P.x_hi, P.y_lo, P.y_hi, z₁_lo, z₁_hi, z₂_lo, z₂_hi, acc_lo, acc_hi, quot_lo, quot_hi):**

- `*_RANGE_CONSTRAINT_0` through `*_RANGE_CONSTRAINT_4`: Five 14-bit microlimbs
- `*_RANGE_CONSTRAINT_TAIL`: Shifted highest microlimb (for stricter constraint)

Examples:

```
P_X_LOW_LIMBS_RANGE_CONSTRAINT_0   // Microlimb 0 (bits 0-13)
P_X_LOW_LIMBS_RANGE_CONSTRAINT_1   // Microlimb 1 (bits 14-27)
...
P_X_LOW_LIMBS_RANGE_CONSTRAINT_4   // Microlimb 4 (bits 56-69, actually 56-67)
P_X_LOW_LIMBS_RANGE_CONSTRAINT_TAIL // Microlimb 4 << 4 (for exact 68-bit constraint)
```

**Relation wide limb microlimbs (4 wires):**

- `RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_0` through `_3`: Four 14-bit chunks

Total range constraint wires:

- 10 elements × 6 microlimbs = 60 wires
- But relation_wide_limbs only needs 4 microlimbs
- **Total: 56 microlimb wires**

### Category 7: Ordered Range Constraint Wires (5 wires)

Used for the permutation argument to prove all microlimbs are ≤ 2¹⁴ - 1:

| Wire                          | Description                        |
| ----------------------------- | ---------------------------------- |
| `ordered_range_constraints_0` | Sorted values for constraint set 0 |
| `ordered_range_constraints_1` | Sorted values for constraint set 1 |
| `ordered_range_constraints_2` | Sorted values for constraint set 2 |
| `ordered_range_constraints_3` | Sorted values for constraint set 3 |
| `ordered_range_constraints_4` | Sorted values for constraint set 4 |

These are not explicit wires but are part of the interleaving structure.

**Interleaving:** To handle 131,072 rows with efficient permutation, microlimbs from 16 consecutive mini-circuit rows are interleaved into single full-circuit rows.

---

## Selector Polynomials

**Critical fact:** The Translator circuit uses **ZERO selector polynomials** (`NUM_SELECTORS = 0`).

Instead, the circuit uses **Lagrange polynomials** to control which constraints are active:

### Lagrange Polynomials (Precomputed)

| Polynomial                     | Description                     | Active Rows                     |
| ------------------------------ | ------------------------------- | ------------------------------- |
| `lagrange_even_in_minicircuit` | Even indices in mini-circuit    | i ∈ {0, 2, 4, ..., 8190} (mini) |
| `lagrange_odd_in_minicircuit`  | Odd indices in mini-circuit     | i ∈ {1, 3, 5, ..., 8191} (mini) |
| `lagrange_first`               | First row                       | i = 0                           |
| `lagrange_last_in_minicircuit` | Last row in mini-circuit        | i = 8191 (mini)                 |
| `lagrange_result_row`          | Row containing final result     | Specific row in trace           |
| `lagrange_masking`             | Masking rows for zero-knowledge | Last few rows                   |
| `lagrange_mini_masking`        | Masking within mini-circuit     | Last rows of mini-circuit       |

**Why no selectors?** The circuit's regularity (2-row cycles, uniform structure) allows using Lagrange polynomials, which are more efficient than custom selectors.

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
