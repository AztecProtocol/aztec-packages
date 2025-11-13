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

The **Merge Protocol** is a critical component of the CHONK proving system used in Aztec. It ensures the correct construction and concatenation of the ECC (Elliptic Curve Cryptography) operation queue polynomials as circuits are accumulated during folding or recursive proof verification.

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

Key components:
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

The Merge Protocol does NOT independently commit to $L_j$ and $R_j$. Instead, these commitments are **shared via the transcript**:

- **$[t_j]$** (current subtable): Added by HyperNova folding verifier
- **$[T_{\text{prev},j}]$** (previous aggregate table): Added in previous merge round

**At a given step, prover commits only to:**
- $[M_j]$: Merged table commitments
- $[G]$: Degree check polynomial commitment


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

#### Step 1: Receive Shift Size
```cpp
const FF shift_size = transcript->receive_from_prover<FF>("shift_size");
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


## Degree Check Mechanism

Without degree checks, $M_j(X) = L_j(X) + X^\ell \cdot R_j(X)$ doesn't guarantee non-overlapping subtables, allowing malicious apps to influence kernel-delegated ops during folding.

**Method:** Use reversed polynomial identity (based on Thakur's degree check protocol [[6](#ref-thakur)], Section 6.2). For $\deg(L_j) < k$:
$$L_j^*(X) = X^{k-1} \cdot L_j(X^{-1}) \implies L_j^*(\kappa^{-1}) = \kappa^{-(k-1)} \cdot L_j(\kappa)$$

**Batching:** Check all 4 columns simultaneously:
$$G(X) = X^{k-1} \cdot \sum_{i=1}^{4} \alpha_i \cdot L_i(X)$$

**Verification:** Check $g = \sum_{i=1}^{4} \alpha_i \cdot l_i \cdot \kappa^{-(k-1)}$. If any $\deg(L_i) \geq k$, this fails with overwhelming probability.

**Implementation** (`merge_prover.cpp:80-88`):
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

Verifies $M_j(X) = L_j(X) + X^\ell \cdot R_j(X)$ by checking at evaluation point $\kappa$: $m_j = l_j + \kappa^\ell \cdot r_j$

**Implementation** (`merge_verifier.cpp:99-114`):
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

The polynomial identity holds for all $X$ if and only if it holds at random $\kappa$ (Schwartz-Zippel lemma; see Appendix for proof).

## Implementation Details

### File Structure

- **merge_prover.hpp**: Prover class declaration
- **merge_prover.cpp**: Prover implementation
- **merge_verifier.hpp**: Verifier class template declaration
- **merge_verifier.cpp**: Verifier implementation with native and recursive instantiations


## Security Considerations

### Soundness

The Merge Protocol achieves soundness through:

1. **Thakur Degree Check** [[6](#ref-thakur)]: Reversed polynomial technique ensures $\deg(L_j) < \ell$
2. **Schwartz-Zippel Lemma**: Polynomial identities checked at random points
3. **Batching Security**: We are using Shplonk to batch different opening claims.
4. **KZG Commitment Security**: Based on the hardness of the discrete logarithm problem on BN254


### ZK Considerations

#### Standalone Merge Protocol is Not ZK

The Merge Protocol, as described above, is **not inherently zero-knowledge**. The protocol reveals:
- Commitments to $[L_j]$, $[R_j]$, $[M_j]$, $[G]$
- Evaluations $l_j$, $r_j$, $m_j$, $g$ at challenge points $\kappa$ and $\kappa^{-1}$

These commitments and evaluations could potentially leak information about the ECC operations in the queue.

#### ZK-ification in CHONK

Within the **CHONK** proving system, the Merge Protocol achieves zero-knowledge through **random (non-)operations** added at specific locations in the op queue (`chonk.cpp`):

##### Random Op Placement

**6 random operations total:**

1. **3 random non-ops** (tail kernel, `chonk.cpp:513-518`) → Prepended to table start
2. **2 random non-ops** (hiding kernel, `chonk.cpp:528-532`) → Appended to table end
3. **1 valid random ECC op** (translator, `chonk.cpp:461-467`) → For accumulation hiding

**Key distinctions:**
- **Random non-ops (5 total)**: Ultra-only operations with random field elements (not pushed to `eccvm_ops_table`)
- **Valid random op (1 total)**: Real ECC multiply-accumulate operation (pushed to both `ultra_ops_table` and `eccvm_ops_table`)

**Randomness budget:**
- Each UltraOp = 2 rows × 4 wires = 2 random coefficients per polynomial
- 3 tail non-ops → 6 coefficients per polynomial (beginning)
- 2 hiding non-ops → 4 coefficients per polynomial (end)
- **Total: 10 random coefficients** per $M_j$ polynomial

##### Degree-of-Freedom Analysis

**Copy-Constrained Commitments:** Merge and Translator use the **same commitment** $[M_j]$ (not separate commitments). Shifted evaluations $M_{j, \text{shifted}}(u)$ re-use $[M_j]$. Here $u$ is a sumcheck evaluation challenge.

**Total Randomness Available:**
- 4 wires (op queue columns), each with 10 random coefficients (4 from $L_j$ hiding kernel, 6 from $R_j$ tail kernel)
- **Total: 40 random coefficients**

**Per-Wire DoF Consumption:**

For each wire $j \in \{1, 2, 3, 4\}$:

1. **Commitments** (copy-constrained between Merge and Translator):
   - $[L_j]$, $[R_j]$, $[M_j]$ → 3 commitments per wire
   - KZG computational hiding: -1 DoF per commitment
   - **Per wire: -3 DoF**

2. **Independent evaluation constraints:**
   - Merge: $L_j(\kappa)$ → **-1 DoF**
   - Merge: $R_j(\kappa)$ → **-1 DoF**
     - Note: $M_j(\kappa) = L_j(\kappa) + \kappa^\ell \cdot R_j(\kappa)$ is not independent, provides no new info
   - MegaZK: $L_j(u)$ (as `ecc_op_wire`) → **-1 DoF**
   - Translator: $M_j(u^\prime)$ → **-1 DoF**
   - Translator: $M_{j, \text{shifted}}(u^\prime)$ → **-1 DoF**
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
- **Net surplus: 2 DoF** ✓

**Conclusion:** The 5 random non-ops provide computational hiding with a 2 DoF surplus (40 random coefficients, 38 consumed). The 4-wire structure allows per-wire surplus to cover shared batched operations. This is sufficient but with minimal margin.

##### Remaining Considerations

**Caveats:**
1. Analysis is heuristic (assumes ~1 DoF per commitment under DLog)
2. 2 DoF margin is thin - sensitive to protocol changes

**Implementation references:**
- `chonk.cpp:450-532` - Random op placement logic
- `ecc_op_queue.hpp:236-250` - `random_op_ultra_only()` method

## References

1. **Shplonk**: [Paper](https://eprint.iacr.org/2020/081)
2. **KZG Commitments**: [Paper](https://www.iacr.org/archive/asiacrypt2010/6477178/6477178.pdf)
3. **Stackproofs**: [Paper](https://eprint.iacr.org/2024/1281)
4. <a name="ref-thakur"></a>**Thakur - Batching Non-Membership Proofs with Bilinear Accumulators**: [Paper](https://eprint.iacr.org/2019/1147.pdf), Section 6.2 (Degree Check Protocol)

## Commitment Propagation and Consistency

### Overview

The merge protocol's soundness relies on **cryptographic consistency** between commitments used across folding steps. Commitments flow through the system via **public inputs**, ensuring that the prover cannot manipulate op queue state between circuits.

### Commitment Flow Through CHONK

```
Circuit i                 Circuit i+1 (Kernel)               Circuit i+2
   |                             |                                |
   | Oink/HN commits             | Reads from pub inputs          |
   | to ecc_op_wires             |                                |
   | [t_i,1]...[t_i,4]          |                                |
   |                             |                                |
   +---> Added to transcript --> +                                |
         (witness commitments)    |                                |
                                  |                                |
                              Merge Verifier                       |
                              • Receives [t_i,j]                   |
                              • Receives [T_prev,j]                |
                                from kernel_i.public_inputs        |
                              • Verifies merge proof               |
                              • Outputs [M_i,j]                    |
                                                                   |
                              kernel_i.public_inputs               |
                              • ecc_op_tables = [M_i,1]...[M_i,4] |
                              • Set to public                      |
                                                                   |
                                  +-------------------------------> +
                                  | [M_i,j] becomes [T_prev,j]     |
                                  | in next merge verification     |
                                                                   |
                                                              Next Merge
                                                              • [t_{i+1},j] from witness
                                                              • [T_prev,j] = [M_i,j]
                                                              • Outputs [M_{i+1},j]
```

**Source of commitments:**
- **`t_commitments`**: Extracted from witness commitments (ecc_op_wires) of the circuit being verified
- **`T_prev_commitments`**: Retrieved from public inputs of the previous kernel circuit

### Consistency Enforcement Mechanisms

#### 1. Public Input Binding

**KernelIO Structure** (`special_public_inputs.hpp:50-142`):
```cpp
class KernelIO {
    TableCommitments ecc_op_tables; // 4 commitments [M_1]...[M_4]
    // ... other fields ...

    void set_public() {
        // Each commitment is added as public input
        for (auto& table_commitment : ecc_op_tables) {
            table_commitment.set_public();
        }
    }

    void reconstruct_from_public(const std::vector<FF>& public_inputs) {
        // Reconstructs commitments from public inputs
        for (auto& table_commitment : ecc_op_tables) {
            table_commitment = PublicPoint::reconstruct(public_inputs, ...);
        }
    }
};
```

After merge verification in kernel $K_i$, merged commitments $[M_{i,j}]$ are set as public inputs. Kernel $K_{i+1}$ reads them via `kernel_input.ecc_op_tables` to use as `T_prev_commitments`.

#### 2. Witness Commitment Extraction

`chonk.cpp:204`: `merge_commitments.t_commitments = witness_commitments.get_ecc_op_wires().get_copy()` extracts columns 8-11 (`ecc_op_wire_1..4`). These commitments are already in transcript from Oink/HyperNova.

#### 3. Transcript Sharing

`merge_verifier.cpp:29-32`: $[t_j]$ already added by HyperNova, $[T_{\text{prev},j}]$ from previous merge. Shared transcript prevents forgery and binds all challenges to commitments via Fiat-Shamir.

#### 4. First Circuit Special Case

`chonk.cpp:130-132`: For OINK (first app), `T_prev_commitments = empty_ecc_op_tables(circuit)` (point at infinity, `special_public_inputs.hpp:36-44`). Fixes starting point, prevents initial state manipulation.

#### 5. Merge Mode

`merge_verifier.cpp:65-72`: PREPEND (default): $L_j = t_j$, $R_j = T_{\text{prev},j}$; APPEND (hiding kernel): $L_j = T_{\text{prev},j}$, $R_j = t_j$

### Verification Flow at Each Step

**Step-by-step for kernel $K_i$ verifying circuit $C_i$:**

1. **Extract commitments** (`chonk.cpp:204`):
   - `t_commitments` ← witness commitments (ecc_op_wires) from $C_i$'s proof
   - `T_prev_commitments` ← public inputs from $K_{i-1}$ (previous kernel)

2. **Pass to merge verifier** (`chonk.cpp:207-208`):
   ```cpp
   auto [merge_pairing_points, merged_table_commitments] =
       goblin.recursively_verify_merge(circuit, merge_commitments, transcript);
   ```

3. **Merge verification** (`merge_verifier.cpp:41-137`)

4. **Update state** (`chonk.cpp:277`):
   ```cpp
   T_prev_commitments = merged_table_commitments;
   ```

5. **Propagate via public inputs** (`chonk.cpp:307`):
   ```cpp
   kernel_output.ecc_op_tables = T_prev_commitments;
   kernel_output.set_public(); // Adds to public inputs
   ```

6. **Next iteration** reads from public inputs (step 1)

### Security Properties

1. Once commitments are in public inputs, they cannot be changed
2. **Consistency**: Same commitments used by Merge and Translator (copy-constrained)
3. **Tamper-Evidence**: Any modification breaks Fiat-Shamir transcript

### Final Goblin Verification

From `chonk.cpp:579-590`:
```cpp
// Extract final merged commitments from hiding kernel public inputs
auto [mega_verified, kernel_return_data, T_prev_commitments] =
    verifier.verify_proof<HidingKernelIO>(proof.mega_proof);

// Goblin verification uses final commitments
bool goblin_verified = Goblin::verify(
    proof.goblin_proof,
    { t_commitments, T_prev_commitments },  // InputCommitments
    chonk_verifier_transcript,
    MergeSettings::APPEND);
```

**Final consistency check:**
- `t_commitments`: Hiding kernel's ecc_op_wires (from witness commitments)
- `T_prev_commitments`: Final merged table (from hiding kernel public inputs)
- Goblin verifier runs final merge verification in APPEND mode
- Translator and ECCVM use the same merged table commitments

## Op Queue Lifecycle in CHONK

The ECC operation queue is built incrementally through CHONK execution, with **merge verification happening at each accumulation step**:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Step 1: First App Circuit (OINK)                                   │
├─────────────────────────────────────────────────────────────────────┤
│ • App circuit generates ECC ops → subtable t₁                      │
│ • Commitments [t₁,ⱼ] added to transcript by Oink                   │
│ • Merge verification: L = t₁, R = ∅ (empty)                        │
│ • Result: M₁ = t₁ (first aggregate table)                          │
│ • Update: T_prev ← M₁                                               │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Step 2 through N-3: App/Kernel Circuits (HN, PREPEND mode)         │
├─────────────────────────────────────────────────────────────────────┤
│ For each circuit i:                                                 │
│   • Circuit generates ECC ops → subtable tᵢ                         │
│   • Commitments [tᵢ,ⱼ] added to transcript by HyperNova            │
│   • Merge verification (PREPEND): L = tᵢ, R = T_prev               │
│   • Merge proves: Mᵢ = tᵢ + X^ℓ · T_prev                           │
│   • Merge proves: deg(tᵢ) < ℓ (degree check)                       │
│   • Result: Mᵢ = [tᵢ | T_prev]                                     │
│   • Update: T_prev ← Mᵢ                                             │
│                                                                     │
│ Growing structure: [t_N | ... | t_3 | t_2 | t_1]                   │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Step N-2: Tail Kernel (HN_FINAL, PREPEND mode)                     │
├─────────────────────────────────────────────────────────────────────┤
│ • No-op added first (for shiftability of translator wires)         │
│ • 3 RANDOM NON-OPS prepended (ZK masking for left table)           │
│ • Tail kernel operations                                            │
│ • Subtable: t_tail = [no-op | 3 random | tail_ops]                 │
│ • Commitments [t_tail,ⱼ] added to transcript                       │
│ • Merge verification (PREPEND): L = t_tail, R = T_prev             │
│ • Result: M_tail = [t_tail | all previous ops]                     │
│ • Update: T_prev ← M_tail                                           │
│                                                                     │
│ Structure now: [no-op | 3 random | tail_ops | app/kernel ops | t₁]│
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Step N-1: Hiding Kernel (MEGA, APPEND mode) ← KEY DIFFERENCE!      │
├─────────────────────────────────────────────────────────────────────┤
│ During recursive verification of tail kernel (HN_FINAL case):      │
│   • 1 VALID RANDOM ECC OP added (for translator accumulation)      │
│                                                                     │
│ Hiding kernel circuit completion:                                  │
│   • Hiding kernel operations                                        │
│   • 2 RANDOM NON-OPS appended at end (ZK masking for right table)  │
│   • Subtable: t_hiding = [hiding_ops | 2 random non-ops]           │
│   • Commitments [t_hiding,ⱼ] added to transcript                   │
│   • Merge verification (APPEND): L = T_prev, R = t_hiding          │
│   • FINAL merge proves: M_final = T_prev + X^ℓ · t_hiding          │
│   • Result: M_final = [T_prev | t_hiding]                          │
│                                                                     │
│ NOTE: APPEND mode places hiding kernel at the END, not beginning   │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Final Op Queue Structure: Randomness Surrounds Real Ops            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ M_final,ⱼ = [no-op | 3 random | tail_ops | apps | hiding | 2 random]│
│                                                                     │
│ Detailed layout:                                                    │
│ ┌────┬──────────┬──────────┬──────────┬──────────┬──────────┐      │
│ │No-op│3 random │Tail ops │App/Kernel│ Hiding  │2 random  │      │
│ │     │non-ops  │         │   ops    │  ops    │non-ops   │      │
│ └────┴──────────┴──────────┴──────────┴──────────┴──────────┘      │
│  ↑              ↑                                 ↑                 │
│  For            Left table in                     Right table in    │
│  shiftability   final merge                       final merge       │
│                 (degree check)                    (ecc_op_wires)    │
│                                                                     │
│ ZK Masking Strategy:                                                │
│ • 3 random non-ops at START (from tail kernel, prepended)           │
│ • 2 random non-ops at END (from hiding kernel, appended)            │
│ • 1 valid random ECC op (added during tail verification)            │
│                                                                     │
│ → Real application operations are SURROUNDED by randomness          │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Final Proof Generation (3 Protocols)                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ 1. MERGE PROTOCOL (THIS PROTOCOL)                                  │
│    Final merge (APPEND mode):                                      │
│    • L = T_prev (all previous ops including tail with 3 random)    │
│    • R = t_hiding (hiding kernel with 2 random non-ops at end)     │
│    • Proves: M = L + X^ℓ · R and deg(L) < ℓ                        │
│    • Commitments: [M_j], [G] (new); [L_j], [R_j] (from transcript) │
│                                                                     │
│ 2. TRANSLATOR PROTOCOL                                             │
│    • Proves BN254 ↔ Grumpkin translation correctness              │
│    • Uses SAME commitments [M_j] as Merge (copy-constrained)       │
│    • All 6 random ops contribute to ZK                             │
│                                                                     │
│ 3. ECCVM PROTOCOL                                                   │
│    • Proves ECC operations executed correctly                      │
│    • Only real ops + 1 valid random op (excludes 5 random non-ops) │
│                                                                     │
│ → Combined into complete CHONK proof for recursive verification    │
└─────────────────────────────────────────────────────────────────────┘
```

**Key Insights:**

1. **Incremental Merge**: Merge verification happens **at each circuit accumulation**
2. **Mode Switch**: Most circuits use PREPEND mode; **hiding kernel uses APPEND mode**
3. **Randomness Placement**: The usage of PREPEND (tail) and APPEND (hiding) modes ensures random ops **surround** real application ops
4. **Transcript Sharing**: Each merge reuses commitments $[t_j]$ (from HyperNova/Oink) and $[T_{\text{prev},j}]$ (from previous merge)
5. **Final Merge Structure**:
   - **Left table** (degree checked): All previous ops including tail kernel's 3 random non-ops at start
   - **Right table** (ecc_op_wires in MegaZK): Hiding kernel with 2 random non-ops at end
6. **Copy-Constrained Commitments**: Merge and Translator share $[M_j]$, not separate commitments
