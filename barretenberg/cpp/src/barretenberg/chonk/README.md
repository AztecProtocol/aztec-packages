# Chonk: Client Honk

Chonk ("Client Honk") implements Repeated Computation with Global state (RCG) as defined in the [Stackproofs paper](https://eprint.iacr.org/2024/1281) by Eagen, Gabizon, Sefranek, Towa, and Williamson. It is used by the Aztec client for private function execution, combining HyperNova folding with Goblin to produce a single succinct proof.

## RCG vs IVC

Unlike Incrementally Verifiable Computation (IVC), RCG:

- **Deferred proving**: The entire computation completes before proving starts
- **Global consistency**: Supports global consistency checks across the whole computation (not just local state transitions)
- **Space efficient**: Maintains prover space efficiency comparable to IVC despite proving global properties

This makes RCG well-suited for private smart contract execution where global constraints (like databus consistency) must be verified across all circuits.

## Overview

Chonk enables proving the correct execution of a chain of circuits (apps and kernels) with a single final proof. Key features:

- **Folding-based accumulation**: Circuits are folded using HyperNova
- **Efficient EC operations**: Goblin handles non-native elliptic curve arithmetic
- **Zero-knowledge**: The final proof reveals nothing about intermediate computations
- **Constant verification cost**: Verification time is independent of the number of accumulated circuits

## Architecture

### Circuit Structure

Circuits are accumulated in alternating pairs:

```
App₀ → Kernel₀ → App₁ → Kernel₁ → ... → Appₙ → Reset → Tail → Hiding
```

- **App circuits**: User-defined private functions
- **Kernel circuits**: Contain recursive verification logic for previous app and kernel
- **Reset kernel**: First of three trailing kernels
- **Tail kernel**: Adds ZK protections for op queue beginning
- **Hiding kernel**: Final kernel with full ZK protections, proven using MegaZK

### Proof Components

A Chonk proof (`Chonk::Proof`) consists of:

1. **Mega proof**: ZK proof of the hiding circuit which recursively verified:
   - The final HyperNova folding proof
   - The decider proof

2. **Goblin proof**: Contains three sub-proofs for efficient EC operations:
   - **Merge proof**: Batches EC operation commitments
   - **ECCVM proof**: Proves correctness of EC operations
   - **IPA proof**: Inner product argument for ECCVM
   - **Translator proof**: Converts between BN254 and Grumpkin curves

### Verification Keys

The `Chonk::VerificationKey` bundles three component keys:

- `mega`: Verification key for the hiding kernel (MegaZK flavor)
- `eccvm`: Verification key for ECCVM
- `translator`: Verification key for the Translator

## Key Data Structures

### QUEUE_TYPE

Specifies the type of proof in the verification queue:

| Type | Description |
|------|-------------|
| `OINK` | Witness commitments only (no sumcheck) - used for first circuit |
| `HN` | HyperNova folding proof - standard accumulation |
| `HN_FINAL` | Final HN verification in hiding kernel |
| `HN_TAIL` | Tail kernel proof with special ZK handling |
| `MEGA` | Full Mega/Honk proof |

### Verification Queues

Two parallel queues track proofs to be verified:

- **VerificationQueue** (`std::deque<VerifierInputs>`): Native proofs and VKs
- **StdlibVerificationQueue** (`std::deque<StdlibVerifierInputs>`): In-circuit (stdlib) versions

Each entry contains:
- The proof data
- Verification key (and hash for stdlib)
- Queue type
- Flag indicating if from a kernel

## Accumulation Flow

### 1. Initialization

```cpp
Chonk ivc(num_circuits);  // num_circuits must be even
```

### 2. Circuit Accumulation

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

### 3. Kernel Circuit Completion

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

### 4. Stdlib Queue Instantiation

Before kernel logic, convert native queue to stdlib:

```cpp
ivc.instantiate_stdlib_verification_queue(kernel);
```

This creates circuit witnesses for:
- Proofs in the verification queue
- Verification keys and their hashes

## Databus and Commitments

### DataBusDepot

Manages linking of databus commitments between circuits:
- Tracks table commitments (calldata, returndata, etc.)
- Ensures consistency across the IVC chain

### Table Commitments

Each circuit produces commitments to its wire polynomials. These must be linked correctly for databus operations to work across circuits.

## Zero-Knowledge Handling

### Op Queue Hiding

Three methods ensure the op queue (EC operations) doesn't leak information:

1. **`hide_op_queue_accumulation_result`**: Hides the final accumulator point
2. **`hide_op_queue_content_in_tail`**: Protects tail kernel op queue data
3. **`hide_op_queue_content_in_hiding`**: Final ZK protection in hiding circuit

### Hiding Kernel

The hiding kernel:
- Recursively verifies the final folding and decider proofs
- Applies ZK protections to all sensitive data
- Is then proven using MegaZK to produce the final Chonk proof

## Integration with Goblin

Chonk uses Goblin for efficient non-native EC operations:

```cpp
// Access the Goblin instance
Goblin& goblin = ivc.get_goblin();
```

The op queue accumulates EC operations from all circuits, which are then proven by ECCVM and Translator.

### Merge Protocol

Each circuit produces a subtable of ECC operations that must be merged into the global op queue. The **Merge protocol** proves this merge was done correctly.

**What it proves:** For each of 4 wire columns $j$:

$$M_j(X) = L_j(X) + X^k \cdot R_j(X)$$

where:
- $M_j$ = merged table (result)
- $L_j$ = left table (prepended data)
- $R_j$ = right table (existing data)
- $k$ = shift size (degree of $L_j$)

It also proves the degree bound $\deg(L_j) < k$.

**Proof components:**

1. **Commitments**: $[M_j]$ for merged tables, $[G]$ for degree check polynomial where $G(X) = X^{k-1} \sum_i \alpha_i L_i(X)$

2. **Evaluations at $\kappa$**: $l_j = L_j(\kappa)$, $r_j = R_j(\kappa)$, $m_j = M_j(\kappa)$

3. **Evaluation at $\kappa^{-1}$**: $g = G(\kappa^{-1})$ (for degree check)

4. **Shplonk batched quotient**: Batches all opening claims

5. **KZG opening proof**: Final univariate opening

The verifier checks:
- $m_j = l_j + \kappa^k \cdot r_j$ (merge relation)
- $g = \kappa^{-(k-1)} \sum_i \alpha_i l_i$ (degree bound)

Note: Commitments to $L_j$ (current subtable) and $R_j$ (previous table) are reused from the HyperNova transcript, avoiding redundant work.

## Debugging

In debug builds (`NDEBUG` not defined):
- Native verifier accumulator is maintained alongside prover accumulator
- `update_native_verifier_accumulator` tracks verification state
- `debug_incoming_circuit` validates circuits before accumulation

## Type Aliases

Key types used throughout:

| Alias | Description |
|-------|-------------|
| `Flavor` | `MegaFlavor` - the underlying Honk flavor |
| `ClientCircuit` | `MegaCircuitBuilder` - circuit builder type |
| `ProverAccumulator` | HyperNova prover accumulator |
| `VerifierAccumulator` | HyperNova verifier accumulator |
| `RecursiveFlavor` | `MegaRecursiveFlavor_<MegaCircuitBuilder>` |
| `PairingPoints` | Accumulated pairing check points |

## HyperNova Folding

Chonk uses [HyperNova](https://eprint.iacr.org/2023/573) (Kothapalli, Setty, Tzialla) for folding circuits into accumulators. HyperNova extends Nova's folding scheme to support high-degree custom gates.

### Core Classes

| Class | Description |
|-------|-------------|
| `HypernovaFoldingProver` | Prover-side folding operations |
| `HypernovaFoldingVerifier<Flavor>` | Verifier-side folding (native or recursive) |

### Sumcheck to Claim

Each circuit is converted to **claims** via Sumcheck. Sumcheck reduces proving a multivariate polynomial identity to proving evaluations at a random point:

1. Prover commits to all polynomials (witnesses + precomputed selectors)
2. Sumcheck protocol produces a random challenge point `r = (r₀, r₁, ..., rₙ₋₁)`
3. Prover evaluates all `NUM_ALL_ENTITIES` entities at `r`:
   - Unshifted evaluations: `pᵢ(r)`
   - Shifted evaluations: `pⱼ_shifted(r)` for shiftable polynomials
4. Result is `NUM_ALL_ENTITIES` evaluation claims, where shifted polynomials share commitments with their unshifted counterparts

For MegaFlavor: `NUM_ALL_ENTITIES = 60` evaluations (55 unshifted + 5 shifted).

### Batching Claims into Accumulator

The individual evaluation claims are batched into a single accumulator using random linear combinations:

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

The accumulator stores a claim (commitment + evaluation at a point) that represents all previously folded circuits:

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

The verifier accumulator contains only commitments (no full polynomials), making it suitable for in-circuit verification.

### Folding Operations

**1. Instance to Accumulator** - Convert a circuit instance into an initial accumulator:

```cpp
HypernovaFoldingProver prover(transcript);
auto accumulator = prover.instance_to_accumulator(instance, honk_vk);
```

This runs Sumcheck on the circuit to produce:
- Batched polynomial commitment
- Evaluation point and claimed values
- Gate challenges for custom gate folding

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

   - Runs Sumcheck on the batching relation which checks:

   $$\sum_X p_{\text{acc}}(X) \cdot \text{eq}(X, r_{\text{acc}}) = v_{\text{acc}}$$

   $$\sum_X p_{\text{inst}}(X) \cdot \text{eq}(X, r_{\text{inst}}) = v_{\text{inst}}$$

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

After all folding, the `HypernovaDeciderProver` produces a final proof that the accumulated claim is valid:

```cpp
HypernovaDeciderProver decider_prover(transcript);
HonkProof decider_proof = decider_prover.construct_proof(commitment_key, accumulator);
```

The decider proves that the batched polynomials in the accumulator actually evaluate to the claimed values at the challenge point. It consists of:

1. **Shplemini**: Multivariate-to-univariate reduction
   - Reduces opening claims at multivariate point $r = (r_0, \ldots, r_{n-1})$ to a univariate claim
   - Uses Gemini folding to iteratively reduce dimension
   - Produces batched quotient commitments

2. **KZG opening proof**: Proves the final univariate evaluation claim
   - Opens the reduced polynomial at the Shplemini challenge point

The decider proof is verified recursively in the hiding kernel, which then gets proven with MegaZK to produce the final Chonk proof.

## Related Components

- **HyperNova**: Folding scheme for incremental verification
- **Goblin**: Non-native EC arithmetic (ECCVM + Translator)
- **MegaFlavor/MegaZKFlavor**: The underlying Honk proof system
- **DataBusDepot**: Databus commitment management

## Proof Size

The proof length can be computed statically:

```cpp
// Without public inputs
size_t len = Chonk::Proof::PROOF_LENGTH_WITHOUT_PUB_INPUTS();

// With HidingKernelIO public inputs
size_t len = Chonk::Proof::PROOF_LENGTH();
```

Components:
- Mega proof (MegaZK flavor)
- Merge proof
- ECCVM proof
- IPA proof
- Translator proof

## Serialization

### Proof Serialization

```cpp
// To field elements
std::vector<FF> fields = proof.to_field_elements();

// From field elements
Chonk::Proof proof = Chonk::Proof::from_field_elements(fields);

// To/from msgpack
msgpack::sbuffer buf = proof.to_msgpack_buffer();
Chonk::Proof proof = Chonk::Proof::from_msgpack_buffer(buf);

// To/from file
proof.to_file_msgpack("proof.bin");
Chonk::Proof proof = Chonk::Proof::from_file_msgpack("proof.bin");
```

### VK Serialization

```cpp
// To field elements
std::vector<bb::fr> fields = vk.to_field_elements();

// From field elements
vk.from_field_elements(fields);
```
