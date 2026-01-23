
# Protogalaxy Recursive Verifier Transcript Bug

## Introduction

Protogalaxy recursive verifier is essentially checking (among other things) that given two commited instance vectors Comm_a and Comm_b as well as challenges,etc, we can reduce the problem of verification of the first instance and the second instance to the verification of a single new instance, where the commitments and challenges are combined. Specifically, $C_a[i] * \gamma + C_b[i] * 1-\gamma = C_c[i]$, where $\gamma$ is the challenge. 

For fast scalar multiplication of bn254 points in-circuit, we use Goblin Plonk, which "commits" to the inputs and results of MSMs and those are then proven to be correct in a more efficent environment called ECCVM. ECCVM is good at MSMs (Multi-scalar Multiplication) and is most efficient, when computing an MSM of a multiple of 4. However, if, like here, there are only 2 points to multiply, it wastes gates, increasing the proof size and time. 

To avoid this issues, we decided to use a trick, where we derive challenges $\alpha_i$ from commitments and then compute:

$$C_a^{combined} = \sum (\alpha_i * C_a[i])$$
$$C_b^{combined} = \sum (\alpha_i * C_b[i])$$
$$C_c^{combined} = \sum (\alpha_i * C_c[i])$$

Then we just check that $C_a^{combined} * \gamma + C_b^{combined} * 1-\gamma = C_c^{combined}$

## The bug

The bug was that the $C_c[i]$ commitments were not being hashed in the transcript (Fiat-Shamir object) and because of that it was possible to update their values after deriving the challenges. Since the polynomial coefficients of all commitments are known, it was possible to find such combination that would satisfy the combination equation and at the same time have the desired target sumcheck sum.

## The fix

The fix was to hash the $C_c[i]$ commitments in the transcript.

## Impact

It was possible to recursively prove fraudulent proofs.


