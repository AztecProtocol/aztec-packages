# Two-layer (Goblin) AVM recursive verifier

The AVM has a trace with a large number of columns. This means that verifying a proof of the AVM requires an MSM of large size. Such an MSM, when computed in-circuit, is extremely costly. To amortize the cost of recursively verifying the AVM we construct a 2 step verification mechanism.

## The inner circuit

Write $\mathsf{V}_{avm}$ for the verifier of the AVM. Then, we construct a circuit that verifies a proof $\pi^{inner}_{avm}$ of the AVM. We call this circuit $\mathsf{C}^{inner}$:

![Inner Circuit Diagram](./images/c_inner.svg)

The circuit takes two witnesses: $\iota^{inner}$ and $\pi^{inner}_{avm}$, one public input: $\mathsf{h}$, and verifies that:
1. $\pi^{inner}_{avm}$ is a valid proof of the AVM for the public inputs $\iota^{inner}_{avm}$
2. $\mathsf{h}$ is the challenge obtained by hashing the transcript $\mathsf{tr}_{\mathsf{V}_{avm}}$ of the AVM verifier $\mathsf{V}_{avm}$. We write this as $\mathsf{h} = \mathsf{Hash}(\mathsf{tr}_{\mathsf{V}_{avm}(\iota^{inner}, \pi^{inner})})$

Note that $\mathsf{V}_{avm}$ is hard-coded in $\mathsf{C}^{inner}$. The AVM VK is fixed (`constraining/avm_fixed_vk.hpp`) and baked into $\mathsf{C}^{inner}$ as constants.

A proof $\pi_{\mathsf{C}^{inner}}$ for public input $\mathsf{h}$ attests to the knowledge of a witness $(\iota^{inner}, \pi_{avm}^{inner})$  such that $\pi^{inner}_{avm}$ is a valid proof of the AVM for the public inputs $\iota^{inner}_{avm}$, and $\mathsf{h} = \mathsf{Hash}(\mathsf{tr}_{\mathsf{V}_{avm}(\iota^{inner}, \pi^{inner})})$

## The outer circuit

Write $\mathsf{V}_{\mathsf{C}^{inner}}$ for the verifier of $\mathsf{C}^{inner}$. We now construct a circuit that verifies a proof $\pi_{\mathsf{C}^{inner}}$ of $\mathsf{C}^{inner}$ and that ensures the proof of validity of $\mathsf{C}^{inner}$ is tied to a specific AVM proof. We call this circuit $\mathsf{C}^{outer}$:

![Outer Circuit Diagram](./images/c_outer.svg)

The circuit takes two witnesses: a hash $\mathsf{h}$ and a proof $\pi_{\mathsf{C}^{inner}}$. It takes as inputs $\iota^{outer}$ and $\pi_{avm}^{outer}$, and verifies that:
1. $\pi_{\mathsf{C}^{inner}}$ is a valid proof of $\mathsf{C}^{inner}$ for public input $\mathsf{h}$
2. $\mathsf{h}$ is the challenge obtained by hashing the transcript of an AVM verifier that verified the proof $\pi_{avm}^{outer}$ for the public inputs $\iota^{outer}$

Note that $\mathsf{V}_{\mathsf{C}^{inner}}$ is hard-coded in $\mathsf{C}^{outer}$. Hence, the vk of $\mathsf{C}^{inner}$ is hard-coded in $\mathsf{C}^{outer}$: the code fixes it with `fix_witness()` (`mega_vk_and_hash->vk->fix_witness()`).

A proof $\pi_{\mathsf{C}^{outer}}$ for public input $(\iota^{outer}$, $\pi_{avm}^{outer})$ attests to the knowledge of witness $(\mathsf{h}, \pi_{\mathsf{C}^{inner}})$ such that:
1. $\mathsf{h} = \mathsf{Hash}(\mathsf{tr}_{\mathsf{V}_{avm}(\iota^{outer}, \pi^{outer})})$
2. $\pi_{\mathsf{C}^{inner}}$ is a valid proof of $\mathsf{C}^{inner}$ for public input $\mathsf{h}$

Point 2 above attests to the knowledge of a witness $(\iota^{inner}, \pi_{avm}^{inner})$ such that:
* $\mathsf{h} = \mathsf{Hash}(\mathsf{tr}_{\mathsf{V}_{avm}(\iota^{inner}, \pi^{inner})})$
* $(\iota^{inner}, \pi_{avm}^{inner})$ is a valid proof of the AVM

So:
$$
\mathsf{Hash}(\mathsf{tr}_{\mathsf{V}_{avm}(\iota^{inner}, \pi^{inner})}) = \mathsf{h} = \mathsf{Hash}(\mathsf{tr}_{\mathsf{V}_{avm}(\iota^{outer}, \pi^{outer})})
$$ that by the property of $\mathsf{Hash}$ implies $(\iota^{outer}, \pi_{avm}^{outer}) = (\iota^{inner}, \pi_{avm}^{inner})$, and therefore $\pi^{outer}_{avm}$ is a valid proof of the AVM for the public inputs $\iota^{outer}_{avm}$.

## Why is this useful?

$\mathsf{C}^{outer}$ is not proven on its own. Its constraints are added directly to the public base rollup circuit, which takes the AVM proof and public inputs as witnesses (`vm2/dsl/avm2_recursion_constraint.cpp`). So the rollup circuit contains the verifier for $\mathsf{C}^{inner}$, not the one of the AVM. Hence, if the cost of verifying $\mathsf{C}^{inner}$ in-circuit plus the cost of generating a proof for $\mathsf{C}^{inner}$ is smaller than the cost of verifying the AVM proof directly in the rollup circuit, then the 2-step recursive verification is more efficient than a single recursive verification.

We arithmetize $\mathsf{C}^{inner}$ using `MegaBuilder`. In this way the large MSM required by $\mathsf{V}_{avm}$ is performed using `Goblin`, which means it doesn't have a direct impact on $\mathsf{C}^{inner}$, but rather its impact is split over different components, making it more manageable.

## What the code does

`TwoLayerAvmRecursiveVerifier` (`two_layer_avm_recursive_verifier.hpp`) implements this scheme; its class comment is the authoritative description.

- The proof of $\mathsf{C}^{inner}$ is a pair $\{\pi_M, \pi_G\}$. $\pi_M$ is a MegaHonk proof. $\pi_G$ is a GoblinAvm proof: an ECCVM proof, a TripleIPA proof, and a Translator proof.
- $\pi_M$ establishes the AVM verification up to the deferred EC operations. $\pi_G$ establishes those operations.
- $\mathsf{C}^{outer}$ contains a Mega recursive verifier and a GoblinAvm recursive verifier. It fixes the VK of $\mathsf{C}^{inner}$ as circuit constants.
- The output is a pairing-point accumulator and a deferred TripleIPA opening (`TwoLayerAvmRecursiveVerifierOutput`). Both must be accumulated and checked later.
