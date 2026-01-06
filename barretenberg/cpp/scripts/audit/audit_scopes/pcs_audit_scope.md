# External Audit Scope: PCS

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: TBD

## Files to Audit
Note: Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

1. `commitment_schemes/shplonk/shplemini.hpp`
    - Main PCS verifier. `ShpleminiVerifier_::compute_batch_opening_claim()` batches polynomial commitments/evaluations into `BatchOpeningClaim`.
2. `commitment_schemes/shplonk/shplonk.hpp`
`ShplonkVerifier_` reduces multiple univariate opening claims to one.
3. `commitment_schemes/gemini/gemini.hpp`
(Stores Shplemini helpers)
Multilinear to univariate reduction mechanism.
4. `commitment_schemes/gemini/gemini_impl.hpp`
Implementation details for Gemini.
5. `commitment_schemes/kzg/kzg.hpp`
6. `commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.hpp`
Used by ECCVM (translation) and Libra (ZK). Reduces opening claims to IPA over small multiplicative subgroup.
7. `commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.cpp`
Implementation of SmallSubgroupIPA.
8. `commitment_schemes/small_subgroup_ipa/small_subgroup_ipa_utils.hpp`
Utility functions for SmallSubgroupIPA.
9. `commitment_schemes/claim_batcher.hpp`
`ClaimBatcher_` computes batching scalars for unshifted/shifted/interleaved polynomial batches.
10. `commitment_schemes/claim.hpp`
Data structures: `OpeningClaim`, `BatchOpeningClaim`.
11. `commitment_schemes/pairing_points.hpp`
Data structure for accumulating pairing points from KZG batch opening verification.
12. `stdlib/primitives/pairing_points.hpp`
Stdlib (recursive) data structure for pairing points accumulation.

## Brief Summary of Module
This module includes all the polynomial commitment schemes used in barretenberg. The main entry point of the module is often `Shplemini` (`Shplonk + Gemini`).

On a high level, given commitments and openning claims (evaluation point and evaluation) to several multilinear polynomials,`Shplemini` uses `Gemini` to reduce the openning proof of each multilinear polynomial to openning proofs of a univariate polynomial, and batches these univariate openning claims using `Shplonk`.

To reduce the number of multiscalar multiplications, `Shplemini` computes the corresponding scalar for each of the commitment points and performs one large MSM in the end.

In some scenarios, e.g. Libra masking polynomial, we need to commit to a rather sparse __multivariate__ polynomial, which is not possible with the method above, since these polynomials are not multilinear. In these cases we prove evaluation claims using an inner-product style argument which is refered to as `SmallSubgroupIPA`.

## Test Files
1. commitment_schemes/kzg/kzg.test.cpp
2. commitment_schemes/shplonk/shplonk.test.cpp
3. commitment_schemes/shplonk/shplemini.test.cpp
4. commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.test.cpp
5. commitment_schemes_recursion/shplemini.test.cpp
6. commitment_schemes_recursion/shplonk.test.cpp
