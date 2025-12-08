# Chonk: Client-side Highly Optimized ploNK

![chonk](https://hackmd.io/_uploads/BkpsblXEgg.jpg)

Aztec's goal is to enable private verifiable execution of smart contracts. This motivates a proving system design where:

- **Low memory proving**: Proofs can be generated on a phone or browser
- **Efficient recursion**: Proofs can incorporate many layers of recursion, as contract execution naturally involves function calls to other functions

Efficient recursion supports low memory proving - statements can be decomposed via recursion into smaller statements that require less prover memory.

## Design Principles

CHONK builds on PlonK [[2](#ref-plonk)], sharing its foundation:
- Elliptic curves and pairings
- Circuit constraints via selector polynomials and copy constraints

Its deviations from PlonK are motivated by the goals above:

1. **Proving sequences of circuits**: Contract execution translates to multiple circuits (different contract functions), with Aztec's *Kernel circuits* handling bookkeeping between them. See the [Aztec documentation](https://docs.aztec.network) and the Stackproofs paper [[3](#ref-stackproofs)].

2. **Sumcheck instead of univariate quotienting**: Eliminates FFTs, reducing prover time and memory at the expense of proof length. This approach follows HyperPlonk [[4](#ref-hyperplonk)].

3. **Folding schemes**: Enable cheaper recursion than standard recursive proofs. We use sumcheck-based folding similar to HyperNova [[5](#ref-hypernova)], adapted to folding non-uniform PlonK circuits.

4. **Goblin Plonk**: Though folding reduces recursion cost, in-circuit non-native EC scalar multiplications remain expensive. Goblin Plonk [[6](#ref-goblin-hackmd)] [[7](#ref-goblin-paper)] defers these operations to a queue, then proves them on the Grumpkin curve where they're native. This curve-switch approach was initiated by BCTV [[8](#ref-bctv)]; a modern comparison is CycleFold [[9](#ref-cyclefold)]. *Note: The linked documents use older terminology and omit some details (e.g., ZK handling) that have since evolved in the implementation.*

5. **Mega flavor**: Chonk circuits use [MegaFlavor](../flavor/mega_flavor.hpp), which combines UltraHonk's custom gates with Goblin's ECC op queue. [MegaZKFlavor](../flavor/mega_zk_flavor.hpp) is the ZK variant, used for the final [hiding kernel](#circuit-structure) proof.

*For a video presentation, see [[10](#ref-video)].*

### References

1. <a name="ref-shplemini"></a>**A note on the soundness of an optimized gemini variant** (Ariel Gabizon, Nishat Koti): [Paper](https://eprint.iacr.org/2025/1793.pdf#6)
2. <a name="ref-plonk"></a>**PlonK: Permutations over Lagrange-bases for Oecumenical Noninteractive arguments of Knowledge** (Ariel Gabizon, Zachary J. Williamson, Oana Ciobotaru): [Paper](https://eprint.iacr.org/2019/953)
3. <a name="ref-stackproofs"></a>**Stackproofs: Private proofs of stack and contract execution using Protogalaxy** (Liam Eagen, Ariel Gabizon): [Paper](https://eprint.iacr.org/2024/1281)
4. <a name="ref-hyperplonk"></a>**HyperPlonk: Plonk with Linear-Time Prover and High-Degree Custom Gates** (Binyi Chen, Benedikt Bünz, Dan Boneh, Zhenfei Zhang): [Paper](https://eprint.iacr.org/2022/1355)
5. <a name="ref-hypernova"></a>**HyperNova: Recursive arguments for customizable constraint systems** (Abhiram Kothapalli, Srinath Setty): [Paper](https://eprint.iacr.org/2023/573)
6. <a name="ref-goblin-hackmd"></a>**Goblin Plonk** (Aztec): [HackMD](https://hackmd.io/@aztec-network/BkGNaHUJn/%2FGfNR5SE5ShyXXmLxNCsg3g)
7. <a name="ref-goblin-paper"></a>**One-Shot Native Proofs of Non-Native Operations in Incrementally Verifiable Computations** (Tohru Kohrita, Patrick Towa, Zachary J. Williamson): [Paper](https://eprint.iacr.org/2024/1651)
8. <a name="ref-bctv"></a>**Scalable Zero Knowledge via Cycles of Elliptic Curves** (Eli Ben-Sasson, Alessandro Chiesa, Eran Tromer, Madars Virza): [Paper](https://eprint.iacr.org/2014/595.pdf)
9. <a name="ref-cyclefold"></a>**CycleFold: Folding-scheme-based recursive arguments over a cycle of elliptic curves** (Abhiram Kothapalli, Srinath Setty): [Paper](https://eprint.iacr.org/2023/1192)
10. <a name="ref-video"></a>**ZK10: How to build a modern SNARK - Zac Williamson**: [YouTube](https://www.youtube.com/watch?v=j6wlamEPKlE)

---

## Overview

Chonk implements Repeated Computation with Global state (RCG) as defined in the Stackproofs paper [[3](#ref-stackproofs)]. It combines HyperNova folding with Goblin to produce a single succinct proof.

### RCG vs IVC

Unlike Incrementally Verifiable Computation (IVC), RCG has the following properties:

- **Deferred proving**: Witness generation for all circuits completes before proving starts
- **Global consistency**: Supports global consistency checks across the whole computation (not just local state transitions)
- **Space efficient**: Maintains prover space efficiency comparable to IVC despite proving global properties

This makes RCG well-suited for private smart contract execution where global constraints (like nullifier uniqueness or public state consistency) must be verified across all circuits.

### Circuit Structure

Circuits are accumulated in alternating pairs:

```
App₀ → Kernel₀ → App₁ → Kernel₁ → ... → Appₙ → Reset → Tail → Hiding
```

- **App circuits**: User-defined private functions
- **Kernel circuits**: Contain recursive verification logic for previous app and kernel
- **Reset kernel**: Squashes transient note hash-nullifier pairs and validates read requests; can occur at any point in the sequence, not just at the end
- **Tail kernel**: Sorts and transforms data to final rollup format; also adds masking for op queue
- **Hiding kernel**: Verifies final folding and decider proofs; masks op queue end and is proven using MegaZK for full ZK

### Proof Structure

A Chonk proof (`Chonk::Proof`) consists of:

1. **Mega proof**: ZK proof of the Hiding kernel which recursively verifies:
   - The final HyperNova folding proof
   - The decider proof

2. **Goblin proof**: Contains sub-proofs for efficient EC operations:
   - **Merge proof**: Proves correct merging of op queue tables
   - **ECCVM proof**: Proves correctness of EC operations (see [ECCVM README](../eccvm/README.md))
   - **IPA proof**: Inner product argument for ECCVM
   - **Translator proof**: Converts between BN254 and Grumpkin curves

---

## Background: From Naive Recursion to Chonk

*This section explains the motivation behind Chonk's design. Skip if you're familiar with the problem.*

**Assumption**: All circuits have fixed size $N = 2^{21}$ from the verifier's perspective.

### Naive Recursive UltraHonk Verification

In a standard recursive verification setup, each circuit must verify the previous circuit's proof. A Honk verifier performs:

1. **Sumcheck verification**: 21 rounds, each receiving univariate polynomials and computing challenges. Relatively cheap in-circuit.

2. **PCS (Polynomial Commitment Scheme) verification via Shplemini** [[1](#ref-shplemini)]: This is where the cost explodes. The verifier must:
   - Batch all polynomial commitments into opening claims
   - Run Shplemini to reduce multivariate claims to univariate
   - Perform KZG verification

The commitment batching *can* be slightly optimized to use short scalars (Fiat-Shamir challenges are ~127 bits) but **recursive verifier circuit size exceeds 512K gates** - too large for practical use.

### Adding Goblin: EC Operation Delegation

Goblin improves the naive approach by delegating non-native EC operations to a separate ECCVM circuit. Instead of performing scalar muls directly in-circuit (expensive), we:

1. Record EC operations in an **op queue**
2. Prove correct execution via ECCVM (native Grumpkin operations)
3. Use Translator to bridge BN254 ↔ Grumpkin

**Cost reduction**: EC operations become "free" in the main circuit - just op queue entries. However, each recursive verification still adds significant work to the op queue:

- **55 + 5 short scalar muls** for commitment batching (using ~127-bit challenges) - `NUM_UNSHIFTED_ENTITIES` + `NUM_SHIFTED_ENTITIES` for MegaFlavor
- **21 full scalar muls** for Shplemini's Gemini fold commitments ($\log N$), which amounts to **42** short scalar muls in ECCVM
- **Merge protocol ops**: Each circuit's op queue subtable must be merged into the global table, requiring additional EC operations

In ECCVM terms, full scalar muls cost ~2× the rows of short scalar muls. So each recursive verification effectively adds **~100+ ECCVM ops**.

Note: The Merge protocol's ECCVM cost is present in both the naive Goblin approach and in Chonk - it's inherent to maintaining the op queue across circuits.

For a chain of $k$ circuits, ECCVM must handle $O(k \cdot ($ `NUM_UNSHIFTED_ENTITIES` + `NUM_SHIFTED_ENTITIES`  $+ 2\log N))$ short scalar operations.

### HyperNova Folding: Deferring PCS Verification

The key insight of HyperNova folding is: **we don't need to complete PCS verification at each step**. Instead:

1. **Run Sumcheck** → produces claimed evaluations at a random point $r$
2. **Batch the claims** → combine all evaluation claims into a single "accumulator"
3. **Defer opening proof** → only verify the final accumulated claim at the end

After Sumcheck, the verifier has `NUM_ALL_ENTITIES` evaluation claims (commitment + claimed value at point $r$). These are batched using random challenges $\rho_i, \sigma_j$ into just **two claims**:
- Non-shifted: $([p_{\text{unshifted}}], v_{\text{unshifted}}, r)$
- Shifted: $([p_{\text{shifted}}], v_{\text{shifted}}, r)$

#### The Challenge: Different Evaluation Points

Each circuit's Sumcheck produces claims at a **different random point** $r_i$. We need to reduce individual openings at given points to the opening of a random linear combination at a new random challenge.

The solution is `MultilinearBatchingSumcheck`: a small Sumcheck (only 6 witness columns) that reduces two claims at different points $(r_{\text{acc}}, r_{\text{inst}})$ to a single claim at a **common point** $r_{\text{new}}$. See [HyperNova Folding Details](#hypernova-folding-details) for the full protocol.

#### EC Operations per Fold

In `MultilinearBatchingVerifier::compute_new_claim`:
- `NUM_UNSHIFTED_ENTITIES + 1` short scalar muls (55 + 1 for MegaFlavor) - batching instance commitments + accumulator
- `NUM_SHIFTED_ENTITIES + 1` short scalar muls (5 + 1 for MegaFlavor) - same for shifted
- A few point additions for evaluation updates

**Total: 62 short scalar multiplications per circuit**, versus 55 short + 21 full in naive/Goblin approaches. Crucially:
- **All operations are short scalar** (challenges are ~127 bits, not 254 bits)
- The **Shplemini MSM is deferred** to the final decider proof - eliminating the $\log N$ full scalar muls per circuit

### Summary: Cost Comparison

| Approach | EC Ops per Circuit | Final MSM Size | Notes |
|----------|-------------------|----------------|-------|
| Naive Recursive | 55 + 21 full scalar muls | 78 | Circuit > 512K gates |
| Goblin (no folding) | 60 short + 21 full (op queue) | >102 short | ~100 ECCVM rows/circuit |
| **Chonk (HyperNova + Goblin)** | 62 short scalar muls (op queue) | N/A (deferred) | Shplemini deferred to decider |

Combining `UltraHonk` features such as custom gates with databus mechanism enabling inter-circuit communication with Hypernova sumcheck-based folding boosted by Goblin elliptic curve operation deferral protocol we get a client-friendly RCG that can be run on a mobile phone.

### Memory Efficiency

A key benefit of Chonk's folding approach is that prover memory is bounded by the largest individual circuit, not the total computation size.

**Memory bound**: Peak memory occurs during the first Sumcheck round and is bounded by $1.5 \times \max_i |\text{ProverPolynomials}_i|$, where the max is over all input circuits. Crucially, this bound is independent of the number of circuits being folded.

*Example*: 55 dense polynomials of size $2^{18}$ consume $1.5 \times 55 \times 2^{18} \times 32\text{ bytes} \approx 660\text{ MB}$ (shifted polynomials share memory with unshifted), which serves as a rough upper bound for a Mega circuit's RAM footprint during Chonk.

---

## Components

### HyperNova Folding

Chonk uses HyperNova [[5](#ref-hypernova)] for folding circuits into accumulators. Each circuit goes through Sumcheck to produce evaluation claims, which are batched into an accumulator. The `MultilinearBatchingSumcheck` protocol combines accumulators at different evaluation points into a single accumulator at a common point.

See [HyperNova Folding Details](#hypernova-folding-details) for the full protocol specification.

### Goblin (ECCVM + Translator)

Goblin handles non-native EC operations by deferring them to an op queue, then proving correct execution via:
- **ECCVM**: Proves EC operations on the Grumpkin curve (see [ECCVM README](../eccvm/README.md))
- **Translator**: Bridges BN254 ↔ Grumpkin field elements

### Merge Protocol

Each circuit produces a subtable of ECC operations that must be merged into the global op queue. The Merge protocol proves this was done correctly. See [MERGE_PROTOCOL.md](../goblin/MERGE_PROTOCOL.md) for full details including the degree check and ZK analysis.

**What it proves:** For each of 4 wire columns $j$:

$$M_j(X) = L_j(X) + X^k \cdot R_j(X)$$

where $M_j$ = merged table, $L_j$ = new subtable, $R_j$ = existing table, $k$ = shift.

Commitments to $L_j$ and $R_j$ are reused from the HyperNova transcript, avoiding redundant work.

### Databus

The databus enables data passing between circuits through commitment equality checks.

#### Why Not Traditional Public Inputs?

Traditional public inputs (PI) require the verifier to hash the complete PI data to generate challenges. This hashing must happen in-circuit for recursive verification, and in-circuit hashing is expensive. For large data transfers between circuits (e.g., state reads/writes, function call stacks), this quickly becomes prohibitive.

The databus solves this by using **commitments** instead of raw data. Rather than passing raw public data to the verifier, we commit to the data and perform consistency checks directly on those commitments. The cost to verify a commitment equality is $O(1)$, independent of the data size.

#### Columns

| Column | Purpose |
|--------|---------|
| `calldata` | Input from previous kernel's return data ($C_i$) |
| `secondary_calldata` | Input from previous app's return data ($C'_i$) |
| `return_data` | Output to be consumed by next circuit ($R_i$) |

App circuits only produce `return_data` (no calldata). Kernel circuits receive both:
- `calldata` from the previous kernel's return data
- `secondary_calldata` from the corresponding app's return data

#### Lookup Relations

Values are read from databus columns using a log-derivative lookup argument. This allows dynamic indexing—circuit logic can access `databus[witness_index]` where the index itself is a witness value.

For a bus column $b$ with read counts $a$, read selector $q_{busread}$, and wires $(w_1, w_2)$ representing (value, index), the lookup identity is:

$$\sum_{i=0}^{n-1}\frac{a_i}{b_i + i\beta + \gamma} - \frac{q_{busread,i}}{w_{1,i} + w_{2,i}\beta + \gamma} = 0$$

In practice, we precompute an inverse polynomial $I$ where:

$$I_i = \frac{1}{(b_i + i\beta + \gamma)(w_{1,i} + w_{2,i}\beta + \gamma)}$$

This allows expressing the lookup as two subrelations:

1. **Inverse correctness** (only checked where $a_i \neq 0$ or $q_{busread,i} = 1$):

$$I_i \cdot (b_i + i\beta + \gamma)(w_{1,i} + w_{2,i}\beta + \gamma) - \varepsilon_i = 0$$

2. **Lookup relation**:

$$\sum_{i=0}^{n-1} a_i \cdot I_i \cdot (w_{1,i} + w_{2,i}\beta + \gamma) - q_{busread,i} \cdot I_i \cdot (b_i + i\beta + \gamma) = 0$$

The `is_active` flag $\varepsilon$ indicates when the inverse $I$ needs to be computed. It is given by the expression `q_busread OR read_tags = q_busread + read_tags - q_busread * read_tags `. Third subrelation `read_tags * read_tags = read_tags` ensures `read_tags` entries are boolean, which is required for the OR formula to work correctly.

**Multiple columns**: Each bus column (calldata, secondary_calldata, return_data) has separate subrelations, distinguished by column-specific selectors $q_j$.

#### Population

The databus columns are populated from ACIR constraints generated by the Noir compiler. When a Noir program uses `call_data` or `return_data` intrinsics, the compiler generates `BlockConstraint` operations that:
1. Initialize the databus columns with witness values via `set_values()`
2. Create read gates connecting main circuit wires to databus columns
3. Assert equality between computed values and databus entries

#### Data Flow

```
App₀ ──return_data [R'₀]──┐
                          ↓
                    Kernel₀ ←─calldata─── (empty for first kernel)
                      │
                return_data [R₀]
                      ↓
App₁ ──return_data [R'₁]──┐
                          ↓
                    Kernel₁ ←─calldata [C₁]─── Kernel₀.return_data
                            ←─secondary_calldata [C'₁]─── App₁.return_data
                      │
                return_data [R₁]
                      ↓
                    ...
```

#### Inter-Circuit Consistency Protocol

**Notation**: $\pi_i$ denotes the proof of folding the $i$-th kernel, $\pi'_i$ denotes the proof of folding the $i$-th app, and $\text{PI}$ denotes public inputs.

The key insight: circuit $K_{i+1}$ verifies the data transfer between $K_{i-1}$ and $K_i$. It has access to $[R_{i-1}]$ through public inputs and $[C_i]$ through the proof $\pi_i$.

**Kernel $K_0$** (first kernel):
- Initializes $C'_0 = R'_0$ (from App₀)
- Produces return data $R_0$
- Extracts $\pi'_0.[R'_0]$, adds to $\pi_0.\text{PI}$
- $\pi_0$ contains: $[R_0]$, $[C'_0]$

**Kernel $K_1$**:
- Sets $C_1 = R_0$ and $C'_1 = R'_1$ (private inputs)
- Produces $R_1$ as a function of $C_1$, $C'_1$, and accumulated side effects (note hashes, nullifiers, logs, etc.)
- **Checks**: $\pi_0.[C'_0] = \pi_0.\text{PI} . [R^{\prime}_0]$
- Extracts $\pi_0.[R_0]$ and $\pi^{\prime}_1 . [R^{\prime}_1]$, adds to $\pi_1.\text{PI}$
- $\pi_1$ contains: $[C_1]$, $[C'_1]$, $[R_1]$

**Kernel $K_i$** (general case, $i \geq 2$):
- Sets $C_i = R_{i-1}$ and $C'_i = R'_i$ (private inputs)
- Produces $R_i$ as a function of $C_i$, $C'_i$, and accumulated side effects
- **Checks**:
  - $\pi_{i-1}.[C_{i-1}] = \pi_{i-1}.\text{PI}.[R_{i-2}]$ (kernel chain)
  - $\pi_{i-1}.[C'_{i-1}] = \pi_{i-1}.\text{PI}.[R'_{i-1}]$ (app input)
- Extracts $\pi_{i-1}.[R_{i-1}]$ and $\pi'_i.[R'_i]$, adds to $\pi_i.\text{PI}$
- $\pi_i$ contains: $[C_i]$, $[C'_i]$, $[R_i]$

**Tail Kernel $K_{n-1}$**:
- Produces `PrivateToRollupKernelCircuitPublicInputs` containing final accumulated data
- **Checks**: Consistency checks for previous kernel

**Hiding Kernel $K_n$**:
- Receives tail kernel's public inputs via databus (`call_data`)
- Verifies the tail kernel proof (type `HN_FINAL`)
- Passes through `PrivateToRollupKernelCircuitPublicInputs` as its public output

This protocol ensures that data passed between circuits is consistent without requiring the verifier to see or hash the actual data—only commitment equality checks on $O(1)$-sized commitments.

**Chonk Proof Verification**:

There are two verification paths:

1. **Native verification** (`Chonk::verify` / `bb verify --scheme chonk`):
   - Used by **Aztec nodes** in the P2P layer to **reject invalid transactions** before they enter the mempool

2. **Recursive verification** (in-circuit):
   - `PrivateTxBaseRollup`: For private-only txs - verifies Chonk proof + processes tx (updates trees, validates fees, etc.)
   - `PublicChonkVerifier`: For public txs - verifies Chonk proof in parallel with AVM verification

Both verify: the hiding kernel's MegaZK proof + Goblin proof (merge, ECCVM, translator).
Output: `PrivateToRollupKernelCircuitPublicInputs` consumed by the rollup.

---

## Zero-Knowledge

A Chonk proof must reveal nothing about the private execution. ZK is achieved through multiple layers:

### Proof-Level ZK

1. **Hiding kernel proof** (verified server-side): Uses MegaZKFlavor with:
   - ZK Sumcheck (Libra masking polynomials)
   - ZK Shplemini (gemini masking polynomial)

2. **ECCVM proof**: Also ZK via ZK Sumcheck and ZK Shplemini

3. **Translator proof**: ZK via the same mechanisms

### Op Queue Hiding

The op queue contains EC operations from all circuits and must be hidden:

1. **`hide_op_queue_accumulation_result`**: Hides the final accumulator point
2. **`hide_op_queue_content_in_tail`**: Protects tail kernel op queue data
3. **`hide_op_queue_content_in_hiding`**: Final ZK protection in Hiding kernel

### Hiding Kernel

The hiding kernel:
- Recursively verifies the final folding and decider proofs
- Masks sensitive `op_queue` data
- Is then proven using MegaZK to produce the final Chonk proof

---

## Usage

### Initialization

```cpp
Chonk ivc(num_circuits);  // num_circuits must be even
```

### Circuit Accumulation

For each circuit (alternating app/kernel):

```cpp
// Build your circuit
MegaCircuitBuilder circuit;
// ... add constraints ...

// Get or compute verification key
auto vk = precomputed_vk;  // or compute from circuit

// Accumulate
ivc.accumulate(circuit, vk);
```

During accumulation:
1. Circuit is folded into the prover accumulator using HyperNova
2. A folding proof is generated and added to the verification queue
3. Goblin processes any EC operations via the op queue

### Kernel Circuit Completion

Kernels must call `complete_kernel_circuit_logic` after adding user logic:

```cpp
MegaCircuitBuilder kernel;
// ... add kernel constraints ...

// Add recursive verification and databus checks
ivc.complete_kernel_circuit_logic(kernel);

ivc.accumulate(kernel, kernel_vk);
```

This adds:
- Recursive verification of previous app and kernel proofs
- Databus consistency checks between circuits
- Merge proof verification
## HyperNova Folding Details

### Core Classes

| Class | Description |
|-------|-------------|
| `HypernovaFoldingProver` | Prover-side folding operations |
| `HypernovaFoldingVerifier<Flavor>` | Verifier-side folding (native or recursive) |

### Sumcheck to Claim

Each circuit is converted to **claims** via Sumcheck:

1. Prover commits to all polynomials (witnesses + precomputed selectors)
2. Sumcheck protocol produces a random challenge point `r = (r₀, r₁, ..., rₙ₋₁)`
3. Prover evaluates all `NUM_ALL_ENTITIES` entities at `r`
4. Result is `NUM_ALL_ENTITIES` evaluation claims

For MegaFlavor: `NUM_ALL_ENTITIES = 60` evaluations (55 unshifted + 5 shifted).

### Batching Claims into Accumulator

The individual evaluation claims are batched using random linear combinations:

**1. Generate batching challenges:**
- Unshifted: $\rho_0, \rho_1, \ldots, \rho_{N_u-1}$ where $N_u$ = `NUM_UNSHIFTED_ENTITIES`
- Shifted: $\sigma_0, \sigma_1, \ldots, \sigma_{N_s-1}$ where $N_s$ = `NUM_SHIFTED_ENTITIES`

**2. Batch polynomials:**

$$p_{\text{unshifted}} = \sum_{i=0}^{N_u-1} \rho_i \cdot p_i$$

$$p_{\text{shifted}} = \sum_{j=0}^{N_s-1} \sigma_j \cdot p_j$$

**3. Batch evaluations:**

$$v_{\text{unshifted}} = \sum_{i=0}^{N_u-1} \rho_i \cdot p_i(r)$$

$$v_{\text{shifted}} = \sum_{j=0}^{N_s-1} \sigma_j \cdot p_{j,\text{shifted}}(r)$$

**4. Batch commitments:**

$$[p_{\text{unshifted}}] = \sum_{i=0}^{N_u-1} \rho_i \cdot [p_i]$$

$$[p_{\text{shifted}}] = \sum_{j=0}^{N_s-1} \sigma_j \cdot [p_j]$$

The resulting accumulator contains $(r, v_{\text{unshifted}}, v_{\text{shifted}}, [p_{\text{unshifted}}], [p_{\text{shifted}}])$.

### Accumulator Structure

**Prover Accumulator** (`MultilinearBatchingProverClaim`):
```cpp
struct MultilinearBatchingProverClaim {
    std::vector<FF> challenge;           // Evaluation point (r₀, r₁, ...)
    FF non_shifted_evaluation;           // p(r)
    FF shifted_evaluation;               // p_shifted(r)
    Polynomial non_shifted_polynomial;   // Full polynomial p
    Polynomial shifted_polynomial;       // Full shifted polynomial
    Commitment non_shifted_commitment;   // [p]
    Commitment shifted_commitment;       // [p_shifted]
    size_t dyadic_size;
};
```

**Verifier Accumulator** (`MultilinearBatchingVerifierClaim`):
```cpp
struct MultilinearBatchingVerifierClaim {
    std::vector<FF> challenge;           // Evaluation point
    FF non_shifted_evaluation;           // Claimed evaluation p(r)
    FF shifted_evaluation;               // Claimed shifted evaluation
    Commitment non_shifted_commitment;   // [p]
    Commitment shifted_commitment;       // [p_shifted]
};
```

### Folding Operations

**1. Instance to Accumulator** - Convert a circuit instance into an initial accumulator:

```cpp
HypernovaFoldingProver prover(transcript);
auto accumulator = prover.instance_to_accumulator(instance, honk_vk);
```

**2. Fold** - Combine an accumulator with a new instance:

```cpp
auto [folding_proof, folded_accumulator] = prover.fold(accumulator, incoming_instance);
```

The fold operation:

1. **Convert instance to accumulator**: Run Sumcheck on the incoming instance to produce an incoming accumulator claim

2. **Batch the two accumulators**: Use `MultilinearBatchingProver` to fold:
   - Constructs a circuit with 4 witness columns and 2 "evaluation" columns:
     - `w_non_shifted_accumulator`, `w_non_shifted_instance` - batched polynomials
     - `w_shifted_accumulator`, `w_shifted_instance` - batched shifted polynomials
     - `w_evaluations_accumulator` = $\text{eq}(X, r_{\text{acc}})$
     - `w_evaluations_instance` = $\text{eq}(X, r_{\text{inst}})$

   - Runs Sumcheck on the batching relation which checks (sums are over the Boolean hypercube $\{0,1\}^n$):

   $$\sum_{\mathbf{i} \in \{0,1\}^n} p_{\text{acc}}(\mathbf{i}) \cdot \text{eq}(\mathbf{i}, r_{\text{acc}}) = v_{\text{acc}}$$

   $$\sum_{\mathbf{i} \in \{0,1\}^n} p_{\text{inst}}(\mathbf{i}) \cdot \text{eq}(\mathbf{i}, r_{\text{inst}}) = v_{\text{inst}}$$

   This verifies that the claimed evaluations match the polynomials at the respective challenge points.

3. **Compute folded claim**: Generate batching challenge $\gamma$ and compute:

$$p_{\text{new}} = p_{\text{inst}} + \gamma \cdot p_{\text{acc}}$$

$$[p_{\text{new}}] = [p_{\text{inst}}] + \gamma \cdot [p_{\text{acc}}]$$

$$v_{\text{new}} = v_{\text{inst}} + \gamma \cdot v_{\text{acc}}$$

   (Same formulas apply to shifted polynomials)

4. **Output**: Folding proof (Sumcheck univariates + evaluations) and new accumulator

### Verification

The verifier mirrors the prover operations:

```cpp
HypernovaFoldingVerifier<Flavor> verifier(transcript);

// Convert instance to verifier accumulator
auto [success, verifier_accumulator] = verifier.instance_to_accumulator(instance, proof);

// Verify folding proof
auto [sumcheck1_valid, sumcheck2_valid, folded_accumulator] =
    verifier.verify_folding_proof(incoming_instance, folding_proof);
```

### Final Decider

After all folding, the `HypernovaDeciderProver` produces a final proof:

```cpp
HypernovaDeciderProver decider_prover(transcript);
HonkProof decider_proof = decider_prover.construct_proof(commitment_key, accumulator);
```

The decider consists of:

1. **Shplemini**: Multivariate-to-univariate reduction using Gemini folding
2. **KZG opening proof**: Proves the final univariate evaluation claim

The decider proof is verified recursively in the hiding kernel.

### Transcript Sharing

Transcripts are shared at two levels to ensure Fiat-Shamir challenge binding:

1. **Accumulation transcript**: A transcript is shared across each (kernel, app) pair:
   - Reset when accumulating a kernel $K_i$
   - Shared between folding $K_i$ and folding $A_{i+1}$
   - The decider proof (produced after the tail kernel) also uses this transcript

   On the verifier side, the recursive verifier in kernel $K_{i+1}$ creates a matching transcript to verify the proofs of $K_i$ and $A_{i+1}$.

2. **Final proof transcript**: Shared between the Hiding kernel proof, Merge proof, ECCVM proof, and Translator proof. The native/recursive verifier uses a matching shared transcript.

**Security**: Transcript sharing ensures that Fiat-Shamir challenges in later proofs depend on all prior proof elements, preventing a malicious prover from generating sub-proofs independently.

---

## Reference

### Type Aliases

| Alias | Description |
|-------|-------------|
| `Flavor` | `MegaFlavor` - the underlying Honk flavor |
| `ClientCircuit` | `MegaCircuitBuilder` - circuit builder type |
| `ProverAccumulator` | HyperNova prover accumulator |
| `VerifierAccumulator` | HyperNova verifier accumulator |
| `RecursiveFlavor` | `MegaRecursiveFlavor_<MegaCircuitBuilder>` |
| `PairingPoints` | Accumulated pairing check points |

### QUEUE_TYPE

These types are used in two contexts with different meanings:
- In `accumulate`: Indicates which circuit type is being accumulated (e.g., `HN_TAIL` means we are accumulating the tail circuit)
- In `complete_kernel_circuit_logic`: Indicates which kernel's logic is being completed (e.g., `HN_TAIL` means we are completing the tail kernel's logic, not verifying it)

| Type | Description |
|------|-------------|
| `OINK` | Witness commitments only (no sumcheck) - used for first circuit |
| `HN` | HyperNova folding proof - standard accumulation |
| `HN_FINAL` | Final HN verification in hiding kernel |
| `HN_TAIL` | Tail kernel proof with special ZK handling |
| `MEGA` | Full Mega/Honk proof |

### Proof Size

```cpp
// Without public inputs
size_t len = Chonk::Proof::PROOF_LENGTH_WITHOUT_PUB_INPUTS();

// With HidingKernelIO public inputs
size_t len = Chonk::Proof::PROOF_LENGTH();
```

### Serialization

```cpp
// Proof to/from field elements
std::vector<FF> fields = proof.to_field_elements();
Chonk::Proof proof = Chonk::Proof::from_field_elements(fields);

// Proof to/from msgpack
msgpack::sbuffer buf = proof.to_msgpack_buffer();
Chonk::Proof proof = Chonk::Proof::from_msgpack_buffer(buf);

// Proof to/from file
proof.to_file_msgpack("proof.bin");
Chonk::Proof proof = Chonk::Proof::from_file_msgpack("proof.bin");

// VK serialization
std::vector<bb::fr> fields = vk.to_field_elements();
vk.from_field_elements(fields);
```

### Debugging

In debug builds (`NDEBUG` not defined):
- Native verifier accumulator is maintained alongside prover accumulator
- `update_native_verifier_accumulator` tracks verification state
- `debug_incoming_circuit` validates circuits before accumulation
