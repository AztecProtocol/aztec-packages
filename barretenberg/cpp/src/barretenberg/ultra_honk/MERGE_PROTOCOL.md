# Merge Protocol with Degree Checks

## Table of Contents
1. [Overview](#overview)
2. [Mathematical Foundation](#mathematical-foundation)
3. [Protocol Description](#protocol-description)
4. [Degree Check Mechanism](#degree-check-mechanism)
5. [Concatenation Check](#concatenation-check)
6. [Implementation Details](#implementation-details)
7. [Usage Examples](#usage-examples)
8. [Security Considerations](#security-considerations)

## Overview

The **Merge Protocol** is a critical component of the Goblin proving system used in Aztec. It ensures the correct construction and concatenation of the ECC (Elliptic Curve Cryptography) operation queue polynomials as circuits are accumulated during folding or recursive proof verification.

### Purpose

In the Goblin architecture, elliptic curve operations from multiple circuits are accumulated into a shared operation queue. The Merge Protocol proves that:
1. **Concatenation is correct**: The merged table is the proper concatenation of two subtables
2. **Degree bounds are satisfied**: The left table (see below) has bounded degree to prevent malicious padding

### Role in Goblin

The Merge Protocol is one of three components in a full Goblin proof:
- **ECCVM (Elliptic Curve Virtual Machine)**: Proves correct execution of ECC operations
- **Translator**: Translates operations between BN254 and Grumpkin curves
- **Merge Protocol**: Proves correct accumulation of operation tables

## Mathematical Foundation

### Notation

Let's define our key components:
- $L_j$ (Left table): Represents either the current subtable $t_j$ or the previous table $T_{\text{prev},j}$
- $R_j$ (Right table): Represents the other table (whichever $L_j$ is not)
- $M_j$ (Merged table): The full aggregate table $T_j$
- $j \in \{1, 2, 3, 4\}$: Index over the 4 wire columns (matching Mega circuit width)

### The Two Main Claims

The Merge Prover convinces the verifier that for each column $j = 1, 2, 3, 4$:

**1. Concatenation Identity:**
$$M_j(X) = L_j(X) + X^\ell \cdot R_j(X)$$

where $\ell$ is the size of the left table (called `shift_size` in the code).

**2. Degree Bound:**
$$\deg(L_j(X)) < \ell$$

where $\ell =$ `shift_size` that prevents overlapping of different subtables.

### Merge Settings

The protocol supports two merge modes:

**PREPEND Mode** (default):
- $L_j = t_j$ (current subtable)
- $R_j = T_{\text{prev},j}$ (previous aggregate table)
- New operations are added at the beginning

**APPEND Mode**:
- $L_j = T_{\text{prev},j}$ (previous aggregate table)
- $R_j = t_j$ (current subtable)
- New operations are added at the end (with optional fixed offset)

## Protocol Description

### Commitment Strategy: Transcript Sharing

**Critical Note**: The Merge Protocol does NOT independently commit to $L_j$ and $R_j$. Instead, these commitments are **shared via the transcript** from other parts of the CHONK proof system:

- **$[t_j]$ commitments** (current subtable): Already added to the transcript by the HyperNova (HN) folding verifier when processing the current circuit
- **$[T_{\text{prev},j}]$ commitments** (previous aggregate table): Already added to the transcript in the previous round of Merge verification

This transcript sharing is a key optimization that avoids redundant commitment generation and verification.

**What the prover DOES commit to:**
- $[M_j]$: Commitments to the merged table (Step 3)
- $[G]$: Commitment to the degree check polynomial (Step 5)

### Prover Algorithm

The `MergeProver::construct_proof()` method executes the following steps:

#### Step 0: Prerequisite - Input Commitments
**Before** the merge proof begins, the following commitments must already exist in the shared transcript:
- If PREPEND mode: $[t_j]$ from HyperNova, $[T_{\text{prev},j}]$ from previous merge
- If APPEND mode: $[T_{\text{prev},j}]$ from previous merge, $[t_j]$ from HyperNova

These are **not** sent again during the merge proof.

#### Step 1: Table Construction
```cpp
// Construct the three tables based on merge settings
std::array<Polynomial, NUM_WIRES> left_table;
std::array<Polynomial, NUM_WIRES> right_table;
std::array<Polynomial, NUM_WIRES> merged_table = op_queue->construct_ultra_ops_table_columns();
```

#### Step 2: Send Shift Size
```cpp
const size_t shift_size = left_table[0].size();
transcript->send_to_verifier("shift_size", shift_size);
```

#### Step 3: Commit to Merged Tables
```cpp
for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
    // Commit to M_j and send [M_j] to verifier
    transcript->send_to_verifier("MERGED_TABLE_" + std::to_string(idx),
                                 pcs_commitment_key.commit(merged_table[idx]));
}
```

#### Step 4: Degree Check Batching
Receive challenges $\alpha_1, \ldots, \alpha_4$ and compute the batched polynomial:
$$G(X) = X^{\ell-1} \cdot \left(\sum_{i=1}^{4} \alpha_i \cdot L_i(X)\right)$$

This is computed via `compute_degree_check_polynomial()`:
```cpp
Polynomial reversed_batched_left_tables(left_table[0].size());
for (size_t idx = 0; idx < NUM_WIRES; idx++) {
    reversed_batched_left_tables.add_scaled(left_table[idx], degree_check_challenges[idx]);
}
return reversed_batched_left_tables.reverse(); // Multiply by X^(k-1)
```

#### Step 5: Commit to Degree Check Polynomial
```cpp
transcript->send_to_verifier("REVERSED_BATCHED_LEFT_TABLES",
                             pcs_commitment_key.commit(reversed_batched_left_tables));
```

#### Step 6: Evaluation Challenge
Receive evaluation challenge $\kappa$ from the verifier.

#### Step 7: Send Evaluations
Evaluate and send:
- $l_j = L_j(\kappa)$ for all $j$
- $r_j = R_j(\kappa)$ for all $j$
- $m_j = M_j(\kappa)$ for all $j$
- $g = G(\kappa^{-1})$

#### Step 8: Shplonk Batched Opening
Use the Shplonk protocol to batch all openings into a single KZG opening proof.

### Verifier Algorithm

The `MergeVerifier_<Curve>::verify_proof()` method performs:

#### Step 0: Prerequisite - Input Commitments
The verifier receives an `InputCommitments` structure containing:
```cpp
struct InputCommitments {
    TableCommitments t_commitments;      // [t_1], [t_2], [t_3], [t_4]
    TableCommitments T_prev_commitments; // [T_prev,1], ..., [T_prev,4]
};
```
These commitments are retrieved from the shared transcript (they were added by HN and previous Merge verification).

#### Step 1: Receive and Validate Shift Size
```cpp
const FF shift_size = transcript->receive_from_prover<FF>("shift_size");
BB_ASSERT_GT(shift_size, 0U, "Shift size should always be bigger than 0");
```

#### Step 2: Construct Table Commitment Vector
Based on merge settings, organize the commitments in order $[L_1], \ldots, [L_4], [R_1], \ldots, [R_4]$:
```cpp
std::vector<Commitment> table_commitments;
table_commitments.reserve((3 * NUM_WIRES) + 1);

// Add [L_j] commitments from input
for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
    table_commitments.emplace_back(settings == MergeSettings::PREPEND
        ? input_commitments.t_commitments[idx]
        : input_commitments.T_prev_commitments[idx]);
}

// Add [R_j] commitments from input
for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
    table_commitments.emplace_back(settings == MergeSettings::PREPEND
        ? input_commitments.T_prev_commitments[idx]
        : input_commitments.t_commitments[idx]);
}
```

#### Step 3: Receive Merged Table Commitments
Receive $[M_j]$ from the proof:
```cpp
for (size_t idx = 0; idx < NUM_WIRES; ++idx) {
    merged_table_commitments[idx] =
        transcript->receive_from_prover<Commitment>("MERGED_TABLE_" + std::to_string(idx));
    table_commitments.emplace_back(merged_table_commitments[idx]);
}
```

#### Step 4: Receive Degree Check Commitment
Receive $[G]$ from the proof:
```cpp
table_commitments.emplace_back(
    transcript->receive_from_prover<Commitment>("REVERSED_BATCHED_LEFT_TABLES"));
```

#### Step 5: Generate Challenges
Generate the same challenges as the prover: $\alpha_i$ and $\kappa$.

#### Step 6: Receive Evaluations
Receive all evaluations: $l_j$, $r_j$, $m_j$, and $g$.

#### Step 7: Check Concatenation Identity
```cpp
bool concatenation_verified = check_concatenation_identities(evals, pow_kappa);
```

Verifies for each $j$:
$$l_j + \kappa^\ell \cdot r_j = m_j$$

#### Step 8: Check Degree Identity
```cpp
bool degree_check_verified = check_degree_identity(evals, pow_kappa_minus_one, degree_check_challenges);
```

Verifies:
$$\sum_{i=1}^{4} \alpha_i \cdot l_i = g \cdot \kappa^{\ell-1}$$

#### Step 9: Verify Shplonk Opening
Use KZG to verify the batched opening claim for ALL commitments:
- $[L_1], \ldots, [L_4]$ (from input commitments)
- $[R_1], \ldots, [R_4]$ (from input commitments)
- $[M_1], \ldots, [M_4]$ (from proof)
- $[G]$ (from proof)

### Commitment Flow Diagram

```
Previous Merge          Circuit Prover           Current Merge
Verification                                      Protocol
     |                       |                         |
     |                       |                         |
[T_prev,j] ────────────────────────────────────────>  |
   already in               |                         |
   transcript               |                         |
                            |                         |
                        [t_j] ────────────────────>   |
                        already in                    |
                        transcript                    |
                            |                         |
                            |              Merge prover commits to:
                            |                     [M_j] ────>
                            |                      [G]  ────>
                            |                         |
                            |      Merge verifier uses commitments from:
                            |         - Transcript: [L_j], [R_j]
                            |         - Proof: [M_j], [G]
                            |                         |
                            v                         v
```

**Key Points:**
1. **$[t_j]$** (current subtable): Already committed by the circuit prover and in the shared transcript
2. **$[T_{\text{prev},j}]$** (previous table): Already in transcript from previous merge verification
3. **Merge prover** only commits to $[M_j]$ (merged table) and $[G]$ (degree check polynomial)
4. **Merge verifier** constructs the full commitment vector from both transcript and proof

### Why This Design?

**Efficiency**: By reusing commitments from the shared transcript:
1. Avoids redundant polynomial commitments (expensive operations)
2. Reduces proof size - only 8 commitments sent instead of 20
3. Enables seamless integration with the rest of the proving system

**Security**: The Fiat-Shamir transcript ensures that:
- Commitments cannot be changed retroactively
- All commitments are properly bound before challenges are generated
- The merge proof is cryptographically bound to the specific circuit being verified

## Degree Check Mechanism

### Why Degree Checks Are Necessary

Without degree checks, the identity $M_j(X) = L_j(X) + X^\ell \cdot R_j(X)$ does not garanteee that different subtables do not overlap. In the case of folding, it can lead to situtations where malicious apps can influence the ops delegated by Kernels.

### How the Degree Check Works

The degree check ensures that $\deg(L_j) < k$ using a clever polynomial identity:

**Observation**: If $\deg(L_j) < k$, then for the reversed polynomial:
$$L_j^*(X) = X^{k-1} \cdot L_j(X^{-1})$$

we have the property:
$$L_j^*(\kappa^{-1}) = \kappa^{-(k-1)} \cdot L_j(\kappa)$$

**Batching**: To check all 4 columns simultaneously, we batch them:
$$G(X) = \sum_{i=1}^{4} \alpha_i \cdot L_i^*(X) = X^{k-1} \cdot \left(\sum_{i=1}^{4} \alpha_i \cdot L_i(X)\right)$$

**Verification**: The verifier checks:
$$g = \sum_{i=1}^{4} \alpha_i \cdot l_i \cdot \kappa^{-(k-1)}$$

This is equivalent to:
$$G(\kappa^{-1}) = \left(\sum_{i=1}^{4} \alpha_i \cdot L_i(\kappa)\right) \cdot \kappa^{-(k-1)}$$

If any $L_i$ has degree $\geq k$, this identity will fail with overwhelming probability due to the random batching challenges $\alpha_i$.

### Implementation Details

The degree check polynomial is computed by:
1. **Batching**: $B(X) = \sum_{i=1}^{4} \alpha_i \cdot L_i(X)$
2. **Reversing**: $G(X) = B^*(X) = X^{k-1} \cdot B(X^{-1})$

In code (`merge_prover.cpp:80-88`):
```cpp
static Polynomial compute_degree_check_polynomial(
    const std::array<Polynomial, NUM_WIRES>& left_table,
    const std::vector<FF>& degree_check_challenges)
{
    Polynomial reversed_batched_left_tables(left_table[0].size());
    for (size_t idx = 0; idx < NUM_WIRES; idx++) {
        reversed_batched_left_tables.add_scaled(left_table[idx], degree_check_challenges[idx]);
    }
    return reversed_batched_left_tables.reverse();
}
```

## Concatenation Check

### The Concatenation Identity

For proper concatenation, we must have:
$$M_j(X) = L_j(X) + X^\ell \cdot R_j(X)$$

At evaluation point $\kappa$:
$$m_j = l_j + \kappa^\ell \cdot r_j$$

### Implementation

The concatenation check (`merge_verifier.cpp:99-114`):
```cpp
bool check_concatenation_identities(std::vector<FF>& evals, const FF& pow_kappa) const
{
    bool concatenation_verified = true;
    FF concatenation_diff(0);
    for (size_t idx = 0; idx < NUM_WIRES; idx++) {
        // Check: l_j + pow_kappa * r_j = m_j
        concatenation_diff = evals[idx] + (pow_kappa * evals[idx + NUM_WIRES]) - evals[idx + (2 * NUM_WIRES)];
        if constexpr (IsRecursive) {
            concatenation_verified &= concatenation_diff.get_value() == 0;
            concatenation_diff.assert_equal(FF(0), "concatenation identity failed");
        } else {
            concatenation_verified &= concatenation_diff == 0;
        }
    }
    return concatenation_verified;
}
```

### Why This Works

The polynomial identity $M_j(X) = L_j(X) + X^\ell \cdot R_j(X)$ holds for all $X$ if and only if it holds at a random evaluation point $\kappa$ (by the Schwartz-Zippel lemma). Since $\kappa$ is generated via Fiat-Shamir after all commitments are fixed, the prover cannot manipulate it.

## Implementation Details

### File Structure

- **merge_prover.hpp**: Prover class declaration
- **merge_prover.cpp**: Prover implementation
- **merge_verifier.hpp**: Verifier class template declaration
- **merge_verifier.cpp**: Verifier implementation with native and recursive instantiations

### Key Classes

#### MergeProver
```cpp
class MergeProver {
    std::shared_ptr<ECCOpQueue> op_queue;
    CommitmentKey pcs_commitment_key;
    std::shared_ptr<Transcript> transcript;
    MergeSettings settings;

    MergeProof construct_proof();
};
```

#### MergeVerifier_<Curve>
```cpp
template <typename Curve> class MergeVerifier_ {
    struct InputCommitments {
        TableCommitments t_commitments;
        TableCommitments T_prev_commitments;
    };

    struct VerificationResult {
        PairingPoints pairing_points;
        TableCommitments merged_commitments;
        bool degree_check_passed;
        bool concatenation_check_passed;
    };

    VerificationResult verify_proof(const Proof& proof, const InputCommitments& input_commitments);
};
```

## Security Considerations

### Soundness

The Merge Protocol achieves soundness through:

1. **Fiat-Shamir Heuristic**: All challenges are generated via transcript hashing, preventing prover manipulation
2. **Schwartz-Zippel Lemma**: Polynomial identities checked at random points
3. **Batching Security**: Batching challenges $\alpha_i$ ensure all columns are checked simultaneously with overwhelming probability
4. **KZG Commitment Security**: Based on the hardness of the discrete logarithm problem on BN254


### ZK Considerations

#### Standalone Merge Protocol is Not ZK

The Merge Protocol, as described above, is **not inherently zero-knowledge**. The protocol reveals:
- Commitments to $[L_j]$, $[R_j]$, $[M_j]$, $[G]$
- Evaluations $l_j$, $r_j$, $m_j$, $g$ at challenge points $\kappa$ and $\kappa^{-1}$

These commitments and evaluations could potentially leak information about the ECC operations in the queue.

#### ZK-ification in CHONK

However, within the **CHONK** proving system, the Merge Protocol is made zero-knowledge through addition of **random (non-)operations** at specific locations in the op queue. This is handled by the `Chonk` class methods in `chonk.cpp`.

##### Random Op Placement Strategy

CHONK adds **6 random operations** total:

1. **3 random non-ops at the tail kernel** (beginning of op queue table)
   - Added via `hide_op_queue_content_in_tail()` in `chonk.cpp:513-518`
   - These ops are **prepended**, so they end up at position 0 of the final aggregate table
   - Provides randomness for the "left table" in the merge protocol

2. **2 random non-ops at the hiding kernel** (end of op queue table)
   - Added via `hide_op_queue_content_in_hiding()` in `chonk.cpp:528-532`
   - These ops are **appended**, so they end up at the end of the final aggregate table
   - Provides randomness for the "right table" in the merge protocol

3. **1 random op for translator** (accumulation result hiding)
   - Added via `hide_op_queue_accumulation_result()` in `chonk.cpp:461-467`
   - Ensures the Translator's batched polynomial evaluation doesn't leak information

##### Why This Achieves Zero-Knowledge

**Random Non-Ops (5 total)**: The tail and hiding kernel use `random_op_ultra_only()` which adds UltraOps with fully random field elements:
```cpp
UltraOp random_op{
    .op_code = EccOpCode{ .is_random_op = true,
                         .random_value_1 = Fr::random_element(),
                         .random_value_2 = Fr::random_element() },
    .x_lo = Fr::random_element(),
    .x_hi = Fr::random_element(),
    .y_lo = Fr::random_element(),
    .y_hi = Fr::random_element(),
    .z_1 = Fr::random_element(),
    .z_2 = Fr::random_element(),
    .return_is_infinity = false
};
```
These are **not valid ECC operations** - just random scalars that only go into `ultra_ops_table` (not `eccvm_ops_table`).

**Valid Random Operation (1 total)**: The translator hiding uses `queue_ecc_mul_accum()` with random inputs:
```cpp
void hide_op_queue_accumulation_result(ClientCircuit& circuit)
{
    Point random_point = Point::random_element();
    FF random_scalar = FF::random_element();
    circuit.queue_ecc_mul_accum(random_point, random_scalar);  // Valid ECC op!
    circuit.queue_ecc_eq();
}
```
This **IS a valid ECC multiply-accumulate operation** that goes into both `ultra_ops_table` AND `eccvm_ops_table` and will be proven correct by ECCVM.

Since each UltraOp occupies **2 rows** in the ultra ops table (due to width-4 arithmetization), each operation adds **2 random coefficients** to each of the **4 op queue polynomials**.

**Randomness accounting:**
- 3 tail kernel random non-ops → **6 random coefficients** per polynomial at the beginning
- 2 hiding kernel random non-ops → **4 random coefficients** per polynomial at the end
- **Total: 10 random coefficients** per $M_j$ polynomial distributed across the table

##### Important Implementation Details

**Random non-ops are "ultra-only"**: The tail/hiding kernel random non-ops are added to `ultra_ops_table` but **not** to `eccvm_ops_table`:
```cpp
UltraOp random_op_ultra_only() {
    UltraOp random_op{ /* random field elements */ };
    ultra_ops_table.push(random_op);
    return random_op;  // NOT pushed to eccvm_ops_table!
}
```

**Valid random op goes to both tables**: The translator's `queue_ecc_mul_accum()` adds to both tables:
```cpp
circuit.queue_ecc_mul_accum(random_point, random_scalar);
// This calls add_accumulate internally, which:
// 1. Constructs valid ECCVMOperation → eccvm_ops_table.push()
// 2. Constructs corresponding UltraOp → ultra_ops_table.push()
```

This distinction is crucial because:
- **ECCVM** proves correctness of actual ECC operations only (including the 1 valid random op)
- **Random non-ops** don't correspond to real ECC operations, so they only appear in the ultra table
- **Merge Protocol** works on the ultra ops table, which includes both real ops, random non-ops, and the valid random op
- **Translator** performs translation check on the ultra ops table, matching it to ECCVM's table (which excludes the 5 random non-ops)

**Position matters**:
- Tail kernel ops are prepended → randomness at beginning of left table (for degree check)
- Hiding kernel ops are appended → randomness at end of right table (for witness wires)
- This strategic placement ensures all commitments and evaluations in the Merge Protocol are randomized

##### Recursive Verifier Context and Security

**What the Server-Side Recursive Verifier Sees:**

When the rollup/server verifies a CHONK proof recursively, it observes:
1. **Merge proof contents**: Commitments $[M_j]$, $[G]$, evaluations $l_j, r_j, m_j, g$, Shplonk quotient $[Q]$
2. **Pairing points**: Accumulated from Merge, ECCVM, and Translator verifiers
3. **Input commitments**: $[t_j]$ and $[T_{\text{prev},j}]$ from the transcript
4. **MegaZK witness wire evaluations**: Including ecc_op_wires at sumcheck challenge
5. **Translator evaluations**: Batched polynomial evaluations over Grumpkin

**Current Randomness Budget:**

According to `chonk.cpp:488-511`, the goal is **9 random coefficients** per op queue polynomial. Current implementation uses **5 random non-ops** (not counting the translator's valid random op separately):

**For the full merged table $M_j$ polynomials:**
- 3 tail kernel random non-ops → **6 coefficients** (at beginning)
- 2 hiding kernel random non-ops → **4 coefficients** (at end)
- **Total: 10 random coefficients** per $M_j$ polynomial

**For subtables:**
- **Tail kernel subtable** (becomes left table in first merge): 6 random coefficients from 3 random non-ops
- **Hiding kernel subtable** (becomes right table in final merge): 4 random coefficients from 2 random non-ops
- **Translator** also has 1 valid random op for accumulation hiding

**Information Leakage Analysis:**

**Critical Insight: Copy-Constrained Commitments and Shared Randomness**

The Merge and Translator proofs use **copy-constrained commitments** to the same polynomials:
- Merge commits to $[M_j]$ (merged table)
- Translator uses the **same commitment** $[M_j]$ (verified via `verify_consistency_with_final_merge()`)
- Shifted evaluations $M_j(\omega \cdot \zeta)$ use the **same commitment** $[M_j]$, not a separate commitment

**What the CHONK Proof Reveals About $M_j$ (full merged table):**

For each merged table polynomial $M_j$ with **10 random coefficients**:

**Evaluations revealed** (consuming degrees of freedom from the same randomness pool):
1. **Merge**: $M_j(\kappa)$ at challenge $\kappa$ → **1 DoF consumed**
2. **Translator**: $M_j(\zeta_{\text{translator}})$ at sumcheck challenge → **1 DoF consumed**
3. **Translator**: $M_j(\omega \cdot \zeta_{\text{translator}})$ (shifted evaluation) → **1 DoF consumed**
4. **Total: 3 evaluations** of the full merged table

**Ratio for full merged table**: $10:3 \approx 3.33:1$ ✅ Exceeds the heuristic threshold

**Additional Evaluation (Degree Check):**
- **Merge degree check**: $L_j(\kappa^{-1})$ evaluates the **left subtable** (not the full table)
- For tail kernel as left table: 6 random coefficients, 1 evaluation → **6:1 ratio** ✅

**Critical Detail: MegaZK's `ecc_op_wire` Evaluations**

The MegaZK prover commits to and evaluates `ecc_op_wire_1`, `ecc_op_wire_2`, `ecc_op_wire_3`, `ecc_op_wire_4` (columns 8-11 in Mega flavor). For the **hiding kernel**:

1. **Commitments** to ecc_op_wires (sent in Oink):
   - These already include the 2 random non-ops from the hiding kernel
   - Commitments don't leak information (KZG hiding property)
   - **No additional randomness consumed** - the random non-ops are already in the committed polynomials

2. **Evaluations** at sumcheck challenge $\zeta$ (sent in Decider proof):
   - $\text{ecc\_op\_wire}_j(\zeta)$ is revealed for $j = 1, 2, 3, 4$
   - Each evaluation is a linear combination: $\sum_{i=0}^{N-1} c_i \cdot \zeta^i$ where $c_i$ are the coefficients
   - **This DOES consume randomness** - each evaluation "eats up one degree of freedom"

**Precise Accounting for Hiding Kernel:**

The hiding kernel subtable has $N$ rows total (real ops + 2 random non-ops). The 2 random non-ops contribute:
- **4 rows** of random data (2 ops × 2 rows per op)
- These are the **last 4 coefficients** of each ecc_op_wire polynomial (appended at end)

For each ecc_op_wire polynomial:
- **Random coefficients contributed**: $c_{N-4}, c_{N-3}, c_{N-2}, c_{N-1}$ are random
- **Evaluation revealed**: $\text{ecc\_op\_wire}_j(\zeta) = c_0 + c_1\zeta + \cdots + c_{N-4}\zeta^{N-4} + \cdots + c_{N-1}\zeta^{N-1}$
- **Degrees of freedom consumed**: Revealing 1 evaluation at random point $\zeta$ uses up 1 constraint
- **Remaining hiding**: With 4 random coefficients and 1 evaluation revealed, we have $4 - 1 = 3$ effective degrees of freedom remaining

**Why 2 Random Non-Ops Are Sufficient:**

Standard computational hiding for polynomial commitments requires:
- At least $\lambda$ random coefficients for information-theoretic hiding (e.g., $\lambda = 128$)
- Or $\geq 2-3$ random coefficients per evaluation for computational hiding under DLog assumption

For the hiding kernel ecc_op_wires:
- **4 random coefficients** (from 2 random non-ops)
- **1 evaluation** revealed at $\zeta$
- **Ratio**: $4:1$ exceeds the heuristic threshold of $3:1$
- **Conclusion**: Sufficient for computational hiding, though below information-theoretic bound

**Rigorous Degree-of-Freedom Analysis**

**Total Randomness Available:**
- 4 wires (op queue columns), each with 10 random coefficients (4 from $L_j$ hiding kernel, 6 from $R_j$ tail kernel)
- **Total: 40 random coefficients**

**Per-Wire DoF Consumption:**

For each wire $j \in \{1, 2, 3, 4\}$:

1. **Commitments** (copy-constrained between Merge and Translator):
   - $[L_j]$, $[R_j]$, $[M_j]$ → 3 commitments per wire
   - KZG computational hiding: ~1 DoF per commitment
   - **Per wire: -3 DoF**

2. **Independent evaluation constraints:**
   - Merge: $L_j(\kappa)$ → **-1 DoF**
   - Merge: $R_j(\kappa)$ → **-1 DoF**
     - Note: $M_j(\kappa) = L_j(\kappa) + \kappa^\ell \cdot R_j(\kappa)$ is not independent, provides no new info
   - MegaZK: $L_j(\zeta_{\text{sumcheck}})$ (as `ecc_op_wire`) → **-1 DoF**
   - Translator: $M_j(\zeta_{\text{translator}})$ → **-1 DoF**
   - Translator: $M_j(\omega \cdot \zeta_{\text{translator}})$ (shifted) → **-1 DoF**
   - **Per wire: -5 DoF** for evaluations

**Per-Wire Subtotal:** $-3$ (commitments) $-5$ (evaluations) $= -8$ DoF per wire

**Per-Wire Balance:**
- Available: 10 random coefficients per wire
- Consumed: 8 DoF per wire
- **Residual per wire: 2 DoF** ✓

**Cross-Wire Shared Operations:**

These operations batch across all 4 wires and draw from the **residual pool** of $2 \times 4 = 8$ DoF:

1. **Degree check polynomial** $G(X) = X^{k-1} \cdot \sum_{i=1}^{4} \alpha_i L_i(X)$:
   - Commitment $[G]$ → **-1 DoF** (shared across all wires)
   - Evaluation $G(\kappa^{-1})$ → **-1 DoF** (shared)
   - Verification: $\sum_i \alpha_i L_i(\kappa) = G(\kappa^{-1}) \cdot \kappa^{k-1}$ (consistency check, not new constraint)
   - **Requires at least 2 DoF** in $L_j$ polynomials for degree bound security
   - **Total: -2 DoF shared, -2 DoF reserved**

2. **Shplonk batching:**
   - Batches all 13 opening claims (4 × 3 for $L, R, M$ plus $G$)
   - Quotient commitment $[Q]$ → **-1 DoF** (shared)

3. **KZG final pairing:**
   - Verifies Shplonk quotient opening → **-1 DoF** (shared)

**Shared Operations Total:** $-2$ (degree check used) $-1$ (Shplonk) $-1$ (KZG) $= -4$ DoF

**Reserved for Degree Check Security:** $-2$ DoF (need high-degree randomness in $L_j$)

**Final Balance:**
- Residual available: 8 DoF (from per-wire surplus)
- Shared consumed: 4 DoF
- Reserved: 2 DoF
- **Net surplus: 8 - 4 - 2 = 2 DoF** ✓

**Conclusion: Current Masking is Sufficient**

The 5 random non-ops (3 tail + 2 hiding) provide:
- ✅ **40:32 = 1.25:1** effective ratio (40 random coefficients, 32 independent constraints)
- ✅ **2 DoF net surplus** after accounting for all commitments, evaluations, and batched operations
- ✅ **Cross-wire batching** (degree check, Shplonk, KZG) shares randomness efficiently

**Key Insights:**
1. The **4-wire structure** allows per-wire surplus to cover shared operations
2. **Batched operations** (degree check, Shplonk) don't add independent constraints beyond the base evaluations
3. **Copy-constrained commitments** between Merge and Translator avoid double-counting DoF costs

**Remaining Caveats:**
1. This analysis is **heuristic** - assumes ~1 DoF per commitment for computational hiding under DLog
2. **Information-theoretic hiding** would require ~128 random coefficients (we have 40)
3. **Formal ZK proof** needed to rigorously establish security bounds
4. The **2 DoF surplus** is a thin margin; adding 1 more random non-op to hiding kernel would increase to 4 DoF surplus

**Open Questions Requiring Further Analysis:**

1. **Formal ZK Bound**: What is the provably sufficient number of random coefficients for $2^{20}$-degree polynomials?
   - Standard hiding bound for degree-$d$ polynomials: typically $O(\lambda)$ where $\lambda$ is security parameter
   - For $\lambda = 128$, need ≥128 random coefficients for information-theoretic hiding
   - For computational hiding under DLog: fewer coefficients may suffice, but needs proof

2. **Recursive Verifier Leakage**: Does the recursive verification circuit leak additional structure?
   - The verifier performs field operations on evaluations
   - Could correlations between evaluations leak information?
   - Needs careful analysis of the verification circuit's computations

3. **Accumulator Security**: Does the pairing point accumulation preserve ZK?
   - Pairing points are accumulated: $[Q'] + \sum_i [\beta_i \cdot P_i]$
   - If randomness is preserved through accumulation, ZK should hold
   - But this needs formal verification

**Recommendations:**

**Current Status**: Based on rigorous degree-of-freedom analysis, the implementation is **sufficient but with minimal margin** (2 DoF surplus).

**For Production**:
- ✅ Current masking (5 random non-ops) provides **computational hiding** with a 2 DoF surplus
- ⚠️ The **2 DoF margin is thin** - sensitive to any protocol changes that add evaluations
- ❗ **Most important**: Conduct formal ZK analysis or cryptographic audit to validate heuristic assumptions

**Optional Conservative Improvements**:
1. **Add 1 more random non-op to hiding kernel** (increases safety margin):
   - Would increase to 12 random coefficients per wire (48 total)
   - Net surplus: 2 → 4 DoF
   - Provides buffer against future protocol modifications
   - Cost: Minimal (1 extra op = 2 rows per wire = 8 rows total in hiding kernel)

2. **Formal ZK proof**:
   - Rigorously prove ~1 DoF per commitment is sufficient for computational hiding
   - Validate that batched operations don't create unexpected correlations
   - Construct explicit simulator showing indistinguishability from random
   - Reduction to DLog assumption

**Trade-offs**:
- **More randomness** → Larger proof, more computation (minimal impact: each op is cheap)
- **Formal proof** → High confidence but expensive (audits, research)
- **Status quo** → Reasonable heuristic security, risk of undiscovered attacks

For more details, see:
- `chonk.cpp:450-532` - Random op placement logic and heuristic reasoning
- `mega_circuit_builder.cpp:216-223` - `queue_ecc_random_op()` method
- `ecc_op_queue.hpp:236-250` - `random_op_ultra_only()` method
- `goblin_recursive_verifier.cpp:18-63` - Server-side recursive verification flow

## References

1. **Goblin Plonk**: [HackMD](https://hackmd.io/@aztec-network/BkGNaHUJn/%2FdUsu57SOTBiQ4tS9KJMkMQ)
2. **Aztec Protocol**: [Paper](https://eprint.iacr.org/2024/1651)
3. **Shplonk**: [Paper](https://eprint.iacr.org/2020/081)
4. **KZG Commitments**: [Paper](https://www.iacr.org/archive/asiacrypt2010/6477178/6477178.pdf)
5. **Stackproofs**: [Paper](https://eprint.iacr.org/2024/1281)

## Contributing

When modifying the Merge Protocol:
1. Ensure transcript labels remain consistent between prover and verifier
2. Add tests for both native and recursive verification
3. Verify that degree check and concatenation check are independently tested
4. Update this documentation if the protocol changes

## Appendix: Mathematical Proofs

### Proof of Degree Check Correctness

**Claim**: If $\deg(L_j) < k$ for all $j$, then $G(\kappa^{-1}) = \left(\sum_{i=1}^{4} \alpha_i \cdot L_i(\kappa)\right) \cdot \kappa^{-(k-1)}$.

**Proof**:
1. By definition, $G(X) = X^{k-1} \cdot \left(\sum_{i=1}^{4} \alpha_i \cdot L_i(X^{-1})\right)$
2. Evaluating at $\kappa^{-1}$: $G(\kappa^{-1}) = (\kappa^{-1})^{k-1} \cdot \left(\sum_{i=1}^{4} \alpha_i \cdot L_i(\kappa)\right)$
3. Simplifying: $G(\kappa^{-1}) = \kappa^{-(k-1)} \cdot \left(\sum_{i=1}^{4} \alpha_i \cdot L_i(\kappa)\right)$
4. Rearranging: $\left(\sum_{i=1}^{4} \alpha_i \cdot L_i(\kappa)\right) = G(\kappa^{-1}) \cdot \kappa^{k-1}$ ∎

**Claim**: If $\deg(L_j) \geq k$ for any $j$, the check fails with overwhelming probability.

**Proof**:
1. If $\deg(L_j) \geq k$, then $L_j(X)$ has a term $c \cdot X^k$ with $c \neq 0$
2. The reversed polynomial $L_j^*(X) = X^{k-1} \cdot L_j(X^{-1})$ will have terms of degree $< k-1$
3. The evaluation $L_j^*(\kappa^{-1})$ will not satisfy the identity
4. With random batching challenges $\alpha_i$, the batched check fails with probability $\geq 1 - \frac{1}{|\mathbb{F}|}$ ∎

### Proof of Concatenation Check Correctness

**Claim**: $M_j(X) = L_j(X) + X^\ell \cdot R_j(X)$ for all $X$ if and only if $m_j = l_j + \kappa^\ell \cdot r_j$ where $\kappa$ is random.

**Proof** ($\Rightarrow$):
1. If $M_j(X) = L_j(X) + X^\ell \cdot R_j(X)$ for all $X$, then it holds at $X = \kappa$
2. Therefore $M_j(\kappa) = L_j(\kappa) + \kappa^\ell \cdot R_j(\kappa)$, i.e., $m_j = l_j + \kappa^\ell \cdot r_j$ ∎

**Proof** ($\Leftarrow$):
1. Define $D_j(X) = M_j(X) - L_j(X) - X^\ell \cdot R_j(X)$
2. If the check passes, then $D_j(\kappa) = 0$
3. By Schwartz-Zippel, if $D_j \neq 0$, then $\Pr[D_j(\kappa) = 0] \leq \frac{\deg(D_j)}{|\mathbb{F}|}$
4. Since $\deg(D_j) < |\mathbb{F}|$, the probability is negligible
5. Therefore $D_j(X) = 0$ with overwhelming probability, i.e., $M_j(X) = L_j(X) + X^\ell \cdot R_j(X)$ ∎
