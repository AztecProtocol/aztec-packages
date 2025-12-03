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

The **Merge Protocol** is a critical component of the CHONK proving system used in Aztec. It ensures the correct construction and concatenation of the ECC (Elliptic Curve Cryptography) operation queue polynomials throughout folding or recursive verification.

### Purpose

In the Goblin architecture, elliptic curve operations from multiple circuits are accumulated into a shared operation queue. The Merge Protocol proves that:
1. **Concatenation is correct**
2. **Subtables do not overlap**

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

### Commitment Propagation

The Merge Protocol does NOT independently commit to $L_j$ and $R_j$. Instead, these commitments are **obtained from previous steps via the transcript or public inputs**:

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

#### Step 1: Merged Table Construction
```cpp
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

#### Step 4: Get Challenges for Batched Degree Check
Receive challenges $\alpha_1, \ldots, \alpha_4$ and compute the batched polynomial:
$$G(X) = X^{\ell-1} \cdot \left(\sum_{i=1}^{4} \alpha_i \cdot L_i(X^{-1})\right)$$

This is computed via `compute_degree_check_polynomial()`:
```cpp
Polynomial reversed_batched_left_tables(left_table[0].size());
for (size_t idx = 0; idx < NUM_WIRES; idx++) {
    reversed_batched_left_tables.add_scaled(left_table[idx], degree_check_challenges[idx]);
}
return reversed_batched_left_tables.reverse(); // Multiply by X^(k-1)
```

#### Step 5: Commit to Batched Degree Check Polynomial
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

Mirrors the Prover's steps. Critical checks are performed as follows.

#### Check Concatenation Identity
```cpp
bool concatenation_verified = check_concatenation_identities(evals, pow_kappa);
```

Verifies for each $j$:
$$l_j + \kappa^\ell \cdot r_j = m_j$$

#### Check Degree Identity
```cpp
bool degree_check_verified = check_degree_identity(evals, pow_kappa_minus_one, degree_check_challenges);
```

Verifies:
$$\sum_{i=1}^{4} \alpha_i \cdot l_i = g \cdot \kappa^{\ell-1}$$

#### Verify Shplonk Opening
Use KZG to verify the batched opening claim for ALL commitments:
- $[L_1], \ldots, [L_4]$ (from input commitments)
- $[R_1], \ldots, [R_4]$ (from input commitments)
- $[M_1], \ldots, [M_4]$ (from proof)
- $[G]$ (from proof)


## Degree Check Mechanism

Without degree checks, $M_j(X) = L_j(X) + X^\ell \cdot R_j(X)$ doesn't guarantee non-overlapping subtables, allowing malicious apps to influence kernel-delegated ops during folding.

**Method:** Use reversed polynomial identity (based on Thakur's degree check protocol [[6](#ref-thakur)], Section 6.2). For $\deg(L_j) < \ell$:
$$L_j^{\ast}(X) = X^{\ell-1} \cdot L_j(X^{-1}) \implies L_j^{\ast}(\kappa^{-1}) = \kappa^{-(\ell-1)} \cdot L_j(\kappa)$$

**Batching:** Check all 4 columns simultaneously:
$$G(X) = X^{\ell-1} \cdot \sum_{i=1}^{4} \alpha_i \cdot L_i(X^{-1})$$

**Verification:** Check $g = \sum_{i=1}^{4} \alpha_i \cdot l_i \cdot \kappa^{-(\ell-1)}$. If any $\deg(L_i) \geq \ell$, this fails with overwhelming probability.

**Implementation** (`merge_prover.cpp`):
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

**Implementation** (`merge_verifier.cpp`):
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

The polynomial identity holds for all $X$ if and only if it holds at random $\kappa$ (Schwartz-Zippel lemma).

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

1. **3 random non-ops** (tail kernel, `Chonk::hide_op_queue_content_in_tail()`) → Prepended to table start
2. **2 random non-ops** (hiding kernel, `Chonk::hide_op_queue_content_in_hiding()`) → Appended to table end
3. **1 valid random ECC op** (translator, `Chonk::hide_op_queue_accumulation_result()`) → For accumulation hiding

**Key distinctions:**
- **Random non-ops (5 total)**: Ultra-only operations with random field elements (not pushed to `eccvm_ops_table`)
- **Valid random op (1 total)**: Real ECC multiply-accumulate operation (pushed to both `ultra_ops_table` and `eccvm_ops_table`)

**Randomness budget:**
- Each UltraOp = 2 rows × 4 wires = 2 random coefficients per polynomial
- 3 tail non-ops → 6 coefficients per polynomial (beginning)
- 2 hiding non-ops → 4 coefficients per polynomial (end)
- **Total: 10 random coefficients** per $M_j$ polynomial

##### Degree-of-Freedom Analysis

**Copy-Constrained Commitments:** Merge and Translator use the **same commitment** $[M_j]$ (not separate commitments). Shifted evaluations $M_{j, \text{shifted}}(u)$ re-use $[M_j]$. Here $u^\prime$ is the Translator sumcheck evaluation challenge.

**Total Randomness Available:**
- 4 $M_j$ wires (op queue columns), each with 10 random coefficients (6 from $L_j$ tail kernel, 4 from $R_j$ hiding kernel)
- **Total: 40 random coefficients**

Let $r = (r_1, \ldots, r_{40}) \in \mathbb{F}^{40}$ denote these coefficients.

The verifier observes the following.

1. Per wire $j \in \{1, 2, 3, 4\}$ observables:
    - Commitments (copy-constrained between Merge and Translator): $[L_j], [R_j]$
        - Note that the commitment $[M_j]$ can be determined from $\ell$, $L_j(\tau)$ and $R_j(\tau)$.
    - Merge: $L_j(\kappa)$
    - Merge: $R_j(\kappa)$
        - Note: $M_j(\kappa) = L_j(\kappa) + \kappa^\ell \cdot R_j(\kappa)$ (not an independent constraint)
    - MegaZK: $R_j(u)$ (as `ecc_op_wires` )
    - Translator: $M_j(u^\prime)$
    - Translator: $M_{j, \text{shifted}}(u^\prime)$

Each wire contributes at most 7 observable values, and hence totalling at most 28.

2. Shared observables:
    - Degree check polynomial $G(X) = X^{\ell - 1} \cdot \sum_{j=1}^4 \alpha_j L_j(X^{-1})$:
        - Commitment: $[G]$
        - Evaluation: $G(\kappa^{-1})$
        - Consistency check: $\sum_i \alpha_i L_i(\kappa) = G(\kappa^{-1}) \cdot \kappa^{\ell-1}$ (not new constraint, asserts linear dependence between $L_i(\kappa)$ and $G(\kappa^{-1})$ )

    - Shplonk batching (Batches all 13 opening claims ($4 \times 3$ for $L, R, M$ plus $G$)):
        - Quotient commitment: $[Q]$
        - Quotient opening: $Q(z)$

These contribute at most $4$ more observables.

These polynomials $L_j, R_j, M_j, G, Q$, for $j \in \{1, 2, 3, 4\}$, have the form

$F(X)= F^{\mathrm{fixed}}(X)+ F^{\mathrm{rand}}(X) = F^{\mathrm{fixed}}(X) + \sum_{i=1}^{40} r_i  B_i^{F}(X)$.


Here, $B_i^{F}(X)$ is the coefficient polynomial of $r_i$ in $F$, which determines the contribution of $r_i$ in $F$ given by $r_i B_i^{F}(X)$.
- For the polynomials $F \in \{L_j, R_j\}$, if the randomness $r_i$  appears in polynomial $F$ at some row $t$ of the op-queue, then $B_i^{F}(X)$ is the polynomial that evaluates to $1$ at $t$, and $0$ at all other rows where $F$ is defined. In case if $r_i$ does not appear in $F$, then $B_i^{F}(X) = 0$.
- For the polynomials $F \in \{M_j, G, Q\}$, $B_i^{F}$ are obtained by applying to the coefficient polynomials of its constituent polynomials (those that define $F$, e.g., $L_j, R_j$ for $M_j$, or $L_j$ for $G$, etc.) the same linear combinations used to define $F$ itself.
For example, if $r_{8}$ appears in $R_1$ at row $5$, then in $M_1(X) = L_1(X) + X^{\ell}R_1(X)$, we will have $B_{8}^{M_1}(X) = X^{\ell} \cdot B_{8}^{R_1}(X)$, where $B_{8}^{R_1}(X)$ is the polynomial that evaluates to $1$ at $X=5$ and $0$ elsewhere.


Since not every random non-op affects every wire, for a given $F \in \{L_j, R_j, M_j, G, Q\}$, most $B_i^{F}=0$.


Each observable value $v_k$ is obtained from one of the polynomials
$F \in \{L_j, R_j, M_j, G, Q\}$ by applying a linear transformation
(e.g., evaluation at $\kappa$, evaluation at $u'$, a shift of
the variable followed by evaluation, etc.).
Thus, each observable value can be written as

$v_k(r,X) =  T_k(F_k(X))$,

where $T_k$ denotes the linear transformation associated with that observable value.

Substituting

$F(X)=F^{\mathrm{fixed}}(X)+\sum_{i=1}^{40} r_i B_i^{F}(X)$

in the equation for $v_k(r, X)$ gives

$v_k(r,X) = c_k(X) + \sum_{i=1}^{40} r_i T_k(B_i^{F_k}(X))$, where $c_k(X)$ is the fixed part.

Denoting

$A_{k,i}(X) = T_k(B_i^{F_k}(X))$,

we can write

$v_k(r, X) = \sum_{i=1}^{40} A_{k,i}(X) r_i + c_k(X)$.


Collecting these, say $N=32$, observable values into a vector $v(r, X)\in\mathbb{F}^N$, we can write $v(r, X) = A(X) r + c(X)$ for $A(X) \in \mathbb{F}^{N \times 40}$ and $c(X) \in \mathbb{F}^N$. Here, $X$ denotes the tuple of challenges $(\kappa, u, u', z)$ at which the polynomials $L_j, R_j, M_j, G, Q$ are queried.

Thus, the number of linear equations in $r$ induced by this transcript of observable values can be bounded as follows.

- 28 observables across all wires ($[L_j], [R_j], L_j(\kappa), R_j(\kappa), R_j(u), M_j(u'), M_{j,\text{shift}}(u')$ for $j \in \{1, 2, 3, 4\}$)

- 4 shared observables ( $[G], G(\kappa^{-1}), [Q], Q(z)$ )

We therefore have at most $32$ linear equations in $40$ unknowns when considering $v = A r + c$. Assuming that the rows of $A(X)$ are linearly independent, at least $8$ independent coefficients remain uniformly distributed from the verifier’s point of view.  This suffices to hide the contribution of the true ECC op-queue.

We next show that rank of $A(X) = 32$ for random $X$. This implies that the rows of $A(X)$ are linearly independent.

###### $\mathrm{rank}(A(X)) = 32$ for random challenges $X$:
To show that $\mathrm{rank}(A(X)) = 32$, we will show that there does not exist a non-zero $\beta \in \mathbb{F}^{40}$ such that $A(X)\beta = 0$ for a  random $X$.

Assume, for contradiction, that there exists a non-zero vector
$\beta=(\beta_1,\dots,\beta_{40})$ such that $A(X)\beta = 0$ identically as a function of the challenges $X$.

This implies that for each observable index $k$, $\sum_{i=1}^{40} A_{k,i}(X)\,\beta_i = 0$.

Substituting $A_{k,i}(X)$ as defined earlier, we get $0 = \sum_{i=1}^{40} \beta_i T_k(B_i^{F_k}(X)) = T_k \left( \sum_{i=1}^{40} \beta_i B_i^{F_k}(X) \right)$.

For each $F$, let $H_F(X) := \sum_{i=1}^{40} \beta_i\, B_i^{F}(X)$.

Then, $A(X)\beta = 0$ implies for all $k$, $T_k\big(H_{F_k}(X)\big) = 0$.

We now argue that there exists at least one $F$ such that $H_{F}$ is non-zero.

- To see why this is true, observe that since $\beta \neq 0$, there exists at least one index $i$, such that $\beta_i \neq 0$.
- Consider the corresponding randomness $r_i$ at index $i$. As per the placement of the random non-ops in the op-queue, let  $F_{r_i} \in \{L_j, R_j\}$ be the polynomial where $r_i$ appears in row $\rho_i$ of $F_{r_i}$ (here $\rho_i$ denotes the row index where $r_i$ is placed).
- In general, note that the placement of the random non-ops ensures that for each $r_i$ for $i \in \{1, \ldots, 40\}$, there exists polynomial $F_{r_i} \in \{L_j, R_j\}$ and a corresponding row $\rho_i$ such that

  (1) the coefficient polynomial $B_i^{F_{r_i}}$ is non-zero. Specifically, $B_i^{F_{r_i}}(\rho_i) \neq 0$,

  (2) no other $r_k$ ($k \neq i$) affects $\rho_i$ of $F_{r_i}$, i.e., $B_k^{F_{r_i}}(\rho_i) = 0$.

- Evaluating $H_{F_{r_i}}(X)$ at $\rho_i$, we get

    $H_{F_{r_i}}(\rho_i) = \sum_{j=1}^{40} \beta_j  B_j^{F_{r_i}}(\rho_i) = \beta_i B_i^{F_{r_i}}(\rho_i) + \sum_{j\neq i} \beta_j B_j^{F_{r_i}}(\rho_i) = \beta_i B_i^{F_{r_i}}(\rho_i) \neq 0$.

- Thus, given $\beta \neq 0$, there exists at least one $F$ ($F_{r_i}$ in this case) such that $H_{F}$ is non-zero.

In particular, corresponding to $F_{r_i}$, there exists an observable index $k_{r_i}$ with $F_{k_{r_i}} = F_{r_i}$ and a non-zero linear transformation $T_{k_{r_i}}$. Thus, $T_{k_{r_i}}\big(H_{F_{r_i}}(X)\big)$ is non-zero polynomial. This contradicts the assumption that for all $k$, $T_k\big(H_{F_k}(X)\big) = 0$.


This contradiction arose due to our assumption that $A(X)\beta = 0$ for a non-zero $\beta$. Thus, there does not exist a non-zero $\beta$ such that $A(X)\beta = 0$. Hence, $A(X)$ has full row rank.
This implies that there exists a $32 \times 32$ submatrix $A'(X)$ of $A(X)$ whose determinant is non-zero.
Thus, there exists an $X'$ such that determinant of $A'(X')$ is non-zero.
Thus, $A(X')$ has rank $32$.
Since determinant of $A'(X)$ is a non-zero polynomial in the challenge $X$, it is non-zero with high probability for a random challenge. Hence, for a random $X$, rank of $A(X) = 32$ with high probability.

##### The simulator

The simulator proceeds as follows.

- Choose a valid dummy op-queue arbitrarily. This determines the fixed part $c_{\mathrm{dummy}}$ without the random non-ops.
- Sample challenges $\kappa, u, u', z$ using the same distribution as in the real protocol.
- Sample $r_{\mathrm{sim}} \in \mathbb{F}^{40}$ uniformly at random.
- Compute the corresponding simulated openings $v_{\mathrm{sim}} = A r_{\mathrm{sim}} + c_{\mathrm{dummy}}$.
- Build the simulated polynomials as follows.

    - Build simulated polynomials $L_j^{\mathrm{sim}}, R_j^{\mathrm{sim}}$ whose coefficients match $r_{\mathrm{sim}}$ in positions corresponding to random non-ops and the dummy op-queue elsewhere.
    - Build the polynomial $M_j^{\mathrm{sim}}(X) = L_j^{\mathrm{sim}}(X) + X^{\ell}R_j^{\mathrm{sim}}(X)$.
    - Build the degree check polynomial as $G^{\mathrm{sim}}(X) = X^{\ell-1} \cdot \sum_{i=1}^{4} \alpha_i L_i^{\mathrm{sim}}(X^{-1})$.
    - Build the Shplonk quotient polynomial $Q^{\mathrm{sim}}$ as per the honest protocol using the simulated openings.
    - In this way,
        $L_j^{\mathrm{sim}}(\kappa),
        R_j^{\mathrm{sim}}(\kappa),
        R_j^{\mathrm{sim}}(u),
        M_j^{\mathrm{sim}}(u'),
        M_{j,\mathrm{shift}}^{\mathrm{sim}}(u'),
        G^{\mathrm{sim}}(\kappa^{-1}),
        Q^{\mathrm{sim}}(z)$
        are consistent with the corresponding entries in $v_{\mathrm{sim}}$.
- Run the commitment protocol honestly on the simulated polynomials to compute the commitments $[L_j^{\mathrm{sim}}], [R_j^{\mathrm{sim}}], [M_j^{\mathrm{sim}}], [G^{\mathrm{sim}}]$ and $[Q^{\mathrm{sim}}]$. Construct the opening proofs at the points $\kappa,\kappa^{-1},u,u',z$ to match $v_{\mathrm{sim}}$.

###### Indistinguishability
In the real world, the prover samples a vector $r_{\mathrm{real}} \in \mathbb{F}^{40}$ uniformly at random, corresponding to the random non-ops.
The observable opened values satisfy $v_{\mathrm{real}} = A(\kappa, u,u',z)\, r_{\mathrm{real}} + c_{\mathrm{real}}$,  where $A(\kappa,u,u',z)$ depends only on the protocol structure and challenges, and $c_{\mathrm{real}}$ is the fixed part determined by the real op-queue.
In the simulated world we have $v_{\mathrm{sim}} = A(\kappa,u,u',z)\, r_{\mathrm{sim}} + c_{\mathrm{dummy}}$, with $r_{\mathrm{sim}}$ uniform in $\mathbb{F}^{40}$ and $c_{\mathrm{dummy}}$ the fixed part for the dummy op-queue.

$A(\kappa,u,u',z)$ is the same in both worlds and does not depend on the op-queue. Moreover, rows of $A(\kappa,u,u',z)$ are linearly independent, as discussed earlier.
$r_{\mathrm{real}}$ and $r_{\mathrm{sim}}$ are both sampled uniformly at random from $\mathbb{F}^{40}$.
$c_{\mathrm{real}}$ and $c_{\mathrm{dummy}}$ are fixed vectors.
Therefore, $v_{\mathrm{real}} = A r_{\mathrm{real}} + c_{\mathrm{real}}$ and $v_{\mathrm{sim}} = A r_{\mathrm{sim}} + c_{\mathrm{dummy}}$ have the same distribution.
Further, in both worlds, commitments and opening proofs are generated by running the protocols honestly. Hence, the distributions of the observable values in both the real and simulated world are indistinguishable.




**Conclusion:** 3 + 2 random non-ops are sufficient for hiding.

**Implementation references:**
- `Chonk::hide_op_queue_content_in_tail()`, `Chonk::hide_op_queue_content_in_hiding()`, `Chonk::hide_op_queue_accumulation_result()`
- `ECCOpQueue::random_op_ultra_only()`

## References

1. **Shplonk**: [Paper](https://eprint.iacr.org/2020/081)
2. **KZG Commitments**: [Paper](https://www.iacr.org/archive/asiacrypt2010/6477178/6477178.pdf)
3. **Stackproofs**: [Paper](https://eprint.iacr.org/2024/1281)
4. <a name="ref-thakur"></a>**Thakur - Batching Non-Membership Proofs with Bilinear Accumulators**: [Paper](https://eprint.iacr.org/2019/1147.pdf), Section 6.2 (Degree Check Protocol)
5. **A note on the soundness of an optimized gemini variant**: [Paper](https://eprint.iacr.org/2025/1793.pdf)

## Merge Flow Through CHONK

### Overview

The merge protocol's soundness relies on **consistency** between commitments used across folding steps. Commitments flow through the system via **public inputs**, ensuring that the prover cannot manipulate op queue state between circuits.

### Key Steps

**Circuit $2i$ (App $i$):**
- Oink/HyperNova commits to `ecc_op_wires`
- Produces commitments $[t_{i,1}], \ldots, [t_{i,4}]$
- Added to transcript as witness commitments

**Circuit $2i+1$ (Kernel $K_i$):**

Each kernel processes a **verification queue** containing circuits to verify. The queue size determines the kernel type:
- **Init kernel** ($i=0$, queue size 1): Verifies only app $A_0$ (OINK proof)
- **Intermediate kernels** ($i > 0$, queue size 2): Verifies kernel $K_{i-1}$ and app $A_i$
- **Tail kernel** (queue size 1): Verifies one circuit (HN_TAIL)
- **Hiding kernel** (queue size 1): Verifies tail kernel (HN_FINAL)

**For each entry in the verification queue (loop iterates `queue.size()` times):**

1. **Initialize $[T_{\text{prev},j}]$:**
   - **First iteration of init kernel ($i=0$):** $[T_{\text{prev},j}] = [\infty]$ (empty table, see `empty_ecc_op_tables()`)
   - **Other iterations:** Use $[T_{\text{prev},j}]$ from previous iteration or previous kernel's public inputs

2. **Merge Verifier receives:**
   - $[t_{j}]$ from current circuit's witness commitments
   - $[T_{\text{prev},j}]$ from previous state

3. **Verify merge proof** (PREPEND mode: $M_j = t_j + X^\ell \cdot T_{\text{prev},j}$)

4. **Update state:** $[T_{\text{prev},j}] \leftarrow [M_j]$ (used in next iteration)

**After loop completes:**
- Sets `kernel_i.public_inputs.ecc_op_tables` $= [M_{1}], \ldots, [M_{4}]$ (final merged commitments)

**Example: Intermediate kernel $K_1$ (queue size 2):**
- **Iteration 1:** Verifies $K_0$
  - Produces $[M^{(1)}_{j}]$
  - Updates $[T_{\text{prev},j}] \leftarrow [M^{(1)}_{j}]$
- **Iteration 2:** Verifies $A_1$ using updated $[T_{\text{prev},j}]$
  - Produces final $[M_{j}]$
- **Output:** `kernel_1.public_inputs.ecc_op_tables` $= [M_{1}], \ldots, [M_{4}]$

**Mathematical description of intermediate kernel merge result:**

For an intermediate kernel $K_i$ verifying previous kernel $K_{i-1}$ and current app $A_i$:

**Iteration 1** (verify $K_{i-1}$):

$$M^{(1)}_j = t_{K_{i-1},j} + X^{\ell_1} \cdot T_{\text{prev},j}$$

where $\ell_1 = |t_{K_{i-1},j}|$ and $T_{\text{prev},j}$ comes from $K_{i-2}$'s public inputs.

**Iteration 2** (verify $A_i$):

$$M_j = t_{A_i,j} + X^{\ell_2} \cdot M^{(1)}_j$$

where $\ell_2 = |t_{A_i,j}|$.

**Expanding the final result:**

$$M_j = t_{A_i,j} + X^{\ell_2} \cdot t_{K_{i-1},j} + X^{\ell_1 + \ell_2} \cdot T_{\text{prev},j}$$

This shows the hierarchical structure: the current app's ops, followed by the previous kernel's ops, followed by all earlier accumulated ops. Each merge in PREPEND mode adds new operations at the beginning (low-degree terms).

**Tail Kernel (HN_FINAL, PREPEND mode):**
- Prepends 3 random non-ops + 1 no-op for ZK masking of left table
- **Merge Verifier receives:**
  - $[t_{\text{tail},j}]$ (including random ops) from witness commitments
  - $[T_{\text{prev},j}]$ from previous kernel's public inputs
- Verifies merge proof (PREPEND mode)
- Outputs $[M_{\text{tail},j}]$
- Sets public inputs for hiding kernel

**Hiding Kernel (MEGA, APPEND mode):**
- Appends 2 random non-ops at end for ZK masking of right table
- **Merge Verifier receives:**
  - $[t_{\text{hiding},j}]$ (including random ops) from witness commitments
  - $[T_{\text{prev},j}] = [M_{\text{tail},j}]$ from tail kernel's public inputs
- Verifies **final merge proof** (APPEND mode: $M_j = T_{\text{prev},j} + X^\ell \cdot t_{\text{hiding},j}$)
- Outputs final $[M_{\text{final},j}]$
- Sets final public inputs (used in Goblin verification)

**Flow:** Each $[M_{i,j}]$ becomes $[T_{\text{prev},j}]$ in the next merge verification step. Mode switches from PREPEND (default) to APPEND for hiding kernel only.

#### Final Op Queue Structure

The complete merged table has the following structure:

$$M_{\text{final},j} = [\text{no-op} \mid 3 \text{ random} \mid \text{tail-ops} \mid \text{apps} \mid \text{hiding} \mid 2 \text{ random}]$$

**ZK:**
- 3 random non-ops at **START** (from tail kernel, prepended)
- 2 random non-ops at **END** (from hiding kernel, appended)
- 1 valid random ECC op (added during tail verification)

**Remark:** Translator padding and masking strategies dictated this very specific way of placing randomness.

#### Mathematical Formula for Final Merged Table

For a complete execution with apps $A_0, A_1, \ldots, A_n$ and kernels $K_0, K_1, \ldots, K_n$, followed by tail kernel $K_{\text{tail}}$ and hiding kernel $K_{\text{hiding}}$:

**After init kernel $K_0$:**

$$M^{(0)}_j = t_{A_0,j}$$

**After each intermediate kernel $K_i$ (for $i = 1, \ldots, n$):**

Each $K_i$ performs two merges in sequence:

$$M^{(i,1)}_j = t_{K_{i-1},j} + X^{\ell_{K_{i-1}}} \cdot M^{(i-1)}_j$$

$$M^{(i)}_j = t_{A_i,j} + X^{\ell_{A_i}} \cdot M^{(i,1)}_j$$

**After tail kernel (PREPEND mode):**

$$M^{\text{tail}}_j = t_{\text{tail},j} + X^{\ell_{\text{tail}}} \cdot M^{(n)}_j$$

where $t_{\text{tail},j} = [\text{no-op} \mid 3 \text{ random} \mid \text{tail-ops}]$

**Final result after hiding kernel (APPEND mode):**

$$M^{\text{final}}_j = M^{\text{tail}}_j + X^{|M^{\text{tail}}_j|} \cdot t_{\text{hiding},j}$$

where $t_{\text{hiding},j} = [\text{hiding-ops} \mid 2 \text{ random}]$

**Fully expanded form** (showing all components):

$$\begin{align}
M^{\text{final}}_j = \,& t_{\text{tail},j} \\
                     & + X^{\ell_{\text{tail}}} \cdot t_{A_n,j} \\
                     & + X^{\ell_{\text{tail}} + \ell_{A_n}} \cdot t_{K_{n-1},j} \\
                     & + X^{\ell_{\text{tail}} + \ell_{A_n} + \ell_{K_{n-1}}} \cdot t_{A_{n-1},j} \\
                     & + \cdots \\
                     & + X^{\sum \text{(all earlier)}} \cdot t_{K_0,j} \\
                     & + X^{\sum \text{(all earlier)}} \cdot t_{A_0,j} \\
                     & + X^{|M^{\text{tail}}_j|} \cdot t_{\text{hiding},j}
\end{align}$$

This shows the **polynomial structure**: tail ops at lowest degrees, then apps/kernels in reverse chronological order (newest first due to PREPEND), and hiding ops at highest degrees (due to APPEND).

#### Final Goblin Proof Generation

The complete Goblin proof consists of **three protocols**:

1. **MERGE PROTOCOL** (this protocol)
   - Final merge in APPEND mode
   - $L = T_{\text{prev}}$ (all previous ops including tail with 3 random)
   - $R = t_{\text{hiding}}$ (hiding kernel with 2 random non-ops at end)
   - Proves: $M = L + X^\ell \cdot R$ and $\deg(L) < \ell$

2. **TRANSLATOR PROTOCOL**
   - Proves BN254 ↔ Grumpkin translation correctness
   - Uses **same commitments** $[M_j]$ as Merge (copy-constrained)
   - All 6 random ops contribute to ZK
   - **Enforces degree bound**: $\deg(M_j) <$ `MINI_CIRCUIT_SIZE`

3. **ECCVM PROTOCOL**
   - Proves ECC operations executed correctly
   - Only real ops + 1 valid random op (excludes 5 random non-ops)

**Source of commitments:**
- **`t_commitments`**: Extracted from witness commitments (ecc_op_wires) of the circuit being verified
- **`T_prev_commitments`**: Retrieved from public inputs of the previous kernel circuit

#### Degree Checks: Merge vs Translator

Merge protocol Degree Checks do **NOT** bound the cumulative size of all accumulated operations, which is criticial for preventing the Chonk prover from accumulating more ops than Translator VM can handle at a given fixed size.

**Translator Protocol Degree Bound**:
- **Critical constraint**: $\deg(M_{\text{final},j}) <$ `MINI_CIRCUIT_SIZE` for Translator soundness
- Enforced by `TranslatorZeroConstraintsRelationImpl` in `translator_extra_relations_impl.hpp` and the fact that $M_{\text{final},j}$ is opened at a **random** point, which implies that it is zero outside of the Translator circuit bounds (see [A note on the soundness of an optimized gemini variant](https://eprint.iacr.org/2025/1793.pdf)).


### Consistency Enforcement Mechanisms

#### 1. Public Input Binding

**KernelIO Structure** (`special_public_inputs.hpp`):
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

`Chonk::perform_recursive_verification_and_databus_consistency_checks()`: `merge_commitments.t_commitments = witness_commitments.get_ecc_op_wires().get_copy()` extracts columns 8-11 (`ecc_op_wire_1..4`). These commitments are already in transcript from Oink/HyperNova.

#### 3. Transcript Sharing

`MergeVerifier_::verify_proof()`: $[t_j]$ already added by HyperNova, $[T_{\text{prev},j}]$ from previous merge. Shared transcript prevents forgery and binds all challenges to commitments via Fiat-Shamir.

#### 4. First Circuit Special Case

`Chonk::perform_recursive_verification_and_databus_consistency_checks()`: For OINK (first app), `T_prev_commitments = empty_ecc_op_tables(circuit)` (point at infinity, see `empty_ecc_op_tables()` in `special_public_inputs.hpp`). Fixes starting point, prevents initial state manipulation.

#### 5. Merge Mode

`MergeVerifier_::verify_proof()`: PREPEND (default): $L_j = t_j$, $R_j = T_{\text{prev},j}$; APPEND (hiding kernel): $L_j = T_{\text{prev},j}$, $R_j = t_j$

### Verification Flow at Each Step

**Step-by-step for each iteration of the loop in kernel $K_i$:**

The kernel processes its verification queue in a loop (`while (!stdlib_verification_queue.empty())`). For each circuit in the queue:

1. **Extract commitments** (`Chonk::perform_recursive_verification_and_databus_consistency_checks()`):
   - `t_commitments` ← witness commitments (ecc_op_wires) from current circuit's proof
   - `T_prev_commitments` ← From previous loop iteration OR previous kernel's public inputs (first iteration) OR `empty_ecc_op_tables()` (init kernel)

2. **Pass to merge verifier** (`Goblin::recursively_verify_merge()`):
   ```cpp
   auto [merge_pairing_points, merged_table_commitments] =
       goblin.recursively_verify_merge(circuit, merge_commitments, transcript);
   ```

3. **Merge verification** (`MergeVerifier_::verify_proof()`)

4. **Update state for next loop iteration** (`Chonk::complete_kernel_circuit_logic()`):
   ```cpp
   T_prev_commitments = merged_table_commitments;
   ```

5. **Loop continues** with next circuit in queue (if any)

**After loop completes:**

6. **Propagate via public inputs** (`KernelIO::set_public()`):
   ```cpp
   kernel_output.ecc_op_tables = T_prev_commitments;  // Final merged commitments
   kernel_output.set_public(); // Adds to public inputs
   ```

7. **Next kernel** reads these commitments from public inputs (step 1 of its first iteration)

### Security Properties

1. Once commitments are in public inputs, they cannot be changed
2. **Consistency**: Same commitments used by Merge and Translator (copy-constrained)
3. **Tamper-Evidence**: Any modification breaks Fiat-Shamir transcript

### Final Goblin Verification

`Chonk::verify()` extracts final commitments from hiding kernel public inputs and verifies the complete Goblin proof:

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
- `Goblin::verify()` runs final merge verification in APPEND mode
- Translator and ECCVM use a special consistency check.
