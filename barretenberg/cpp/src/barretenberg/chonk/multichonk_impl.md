# MultiChonk Implementation Plan

## Goal

Switch Chonk IVC to use `MultiMegaFlavor` (interleaved commitments) for benchmarking.
Merge protocol compatibility is maintained via extra individual ecc_op_wire commits (not sound, OK for benching).

## Infrastructure already available

- `MultiMegaFlavor` / `MultiMegaZKFlavor`
- `MultiMegaRecursiveFlavor_<BuilderType>` / `MultiMegaZKRecursiveFlavor_<BuilderType>`
- `MultiMegaOinkProver_<Flavor>` / `MultiMegaOinkVerifier_<Flavor>`
- `MultiMegaProver_<Flavor>` / `MultiMegaVerifier_<Flavor>`

## Steps

### Step 1 — Extra individual ecc_op_wire commits for merge protocol compat ✓

**`multi_mega_oink_prover.cpp` — `execute_wire_commitments_round()`**

After committing the interleaved W₂ group, commit to each `ecc_op_wire_i` individually
using the standard commitment key and send via `commitment_labels.ecc_op_wire_{1..4}`.
Store in `prover_instance->commitments.ecc_op_wire_{1..4}`.

**`multi_mega_oink_verifier.cpp` — `execute_wire_commitments_round()`**

After receiving W₂, receive the 4 individual ecc_op_wire commitments from the transcript
and store in `verifier_instance->witness_commitments.ecc_op_wire_{1..4}`.

### Step 2 — Switch HypernovaFoldingProver to MultiMegaFlavor (no templating)

`HypernovaFoldingProver` stays a non-templated class; just change the internal flavor.

**`hypernova_prover.hpp`**

- `using Flavor = MultiMegaFlavor;`
- `using MegaOinkProver = MultiMegaOinkProver_<MultiMegaFlavor>;`
- `NUM_UNSHIFTED_ENTITIES` and `NUM_SHIFTED_ENTITIES` stay at `MegaFlavor` values — `get_unshifted()`
  and `get_to_be_shifted()` on `MultiMegaFlavor::ProverPolynomials` return the same 55+5 individual
  polynomial refs, so polynomial/evaluation batching is unchanged.
- Add `#include "multi_mega_oink_prover.hpp"`

**`hypernova_prover.cpp` — `instance_to_accumulator()`**

```cpp
// Was:
MegaOinkProver oink_prover{ instance, precomputed_vk, transcript };
// Now (MegaOinkProver = MultiMegaOinkProver_<MultiMegaFlavor>):
MegaOinkProver oink_prover{ instance, precomputed_vk, transcript };  // type alias changed
```

**`hypernova_prover.cpp` — `sumcheck_output_to_accumulator()`**

`MultiMegaFlavor::VerifierCommitments` takes only VK (no witness_commitments arg).
Change construction to single-arg:
```cpp
// Was:
VerifierCommitments verifier_commitments(honk_vk, instance->commitments);
// Now:
VerifierCommitments verifier_commitments(honk_vk);
```
The commitment batching uses whatever individual commitments are populated (ecc_op_wires from Step 1,
rest are zero). Not sound, but the prover runs and timing is valid.

### Step 3 — Update HypernovaFoldingVerifier to use MultiMegaOinkVerifier_

`HypernovaFoldingVerifier` is already templated. Use `if constexpr (IsMultiMegaFlavor<Flavor>)` where
behavior needs to differ.

**`hypernova_verifier.hpp`**

```cpp
// Use MultiMegaOinkVerifier_ for multi-mega flavors, OinkVerifier otherwise
using OinkVerifier = std::conditional_t<IsMultiMegaFlavor<Flavor>,
                                        MultiMegaOinkVerifier_<Flavor>,
                                        bb::OinkVerifier<Flavor>>;
```
Add `#include "multi_mega_oink_verifier.hpp"`.

**`hypernova_verifier.cpp` — `sumcheck_output_to_accumulator()`**

`MultiMegaFlavor::VerifierCommitments` takes only VK. Use `if constexpr`:
```cpp
VerifierCommitments verifier_commitments = [&] {
    if constexpr (IsMultiMegaFlavor<Flavor>) {
        return VerifierCommitments(instance->get_vk());
    } else {
        return VerifierCommitments(instance->get_vk(), instance->witness_commitments);
    }
}();
```

**`hypernova_verifier.cpp`** — add template instantiations:
```cpp
template class HypernovaFoldingVerifier<MultiMegaFlavor>;
template class HypernovaFoldingVerifier<MultiMegaRecursiveFlavor_<MegaCircuitBuilder>>;
```

### Step 4 — Update Chonk class

**`chonk.hpp`**

```cpp
using Flavor = MultiMegaFlavor;
using RecursiveFlavor = MultiMegaRecursiveFlavor_<bb::MegaCircuitBuilder>;
using DeciderZKProvingKey = ProverInstance_<MultiMegaZKFlavor>;
using MegaProver = MultiMegaProver_<MultiMegaFlavor>;
using MegaZKVerificationKey = MultiMegaZKFlavor::VerificationKey;

// FoldingProver stays non-templated (now internally uses MultiMegaFlavor)
using FoldingProver = HypernovaFoldingProver;
// FoldingVerifier and RecursiveFoldingVerifier use the templated class
using FoldingVerifier = HypernovaFoldingVerifier<MultiMegaFlavor>;
using RecursiveFoldingVerifier = HypernovaFoldingVerifier<RecursiveFlavor>;
// DeciderProver stays as-is (opens batched single poly, flavor-independent)
using DeciderProver = HypernovaDeciderProver;
```

**`chonk.cpp`** — hiding kernel proof:
```cpp
// Was: MegaZKProver prover(...)
// Now:
MultiMegaProver_<MultiMegaZKFlavor> prover(hiding_prover_inst, verification_key, transcript);
```

## What remains broken (acceptable for benchmarking)

- Merge protocol soundness (extra ecc_op_wire commits are unsound)
- Full commitment batching in accumulator (mostly zero individual commits for non-ecc-op polys)
- Recursive verifier (needs MultiMegaRecursiveFlavor_ instantiation in `hypernova_verifier.cpp`)
