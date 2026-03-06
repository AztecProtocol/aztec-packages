# TO BE DELETED

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: TBD
    
## Files to Audit
1. `shplonk/shplemini.hpp`
    - Main PCS verifier. `ShpleminiVerifier_::compute_batch_opening_claim()` batches polynomial commitments/evaluations into `BatchOpeningClaim`.
2. `shplonk/shplonk.hpp` 
`ShplonkVerifier_` reduces multiple univariate opening claims to one. 
3. `gemini/gemini.hpp` 
(Stores Shplemini helpers)
Multilinear to univariate reduction mechanism. 
4. `kzg/kzg.hpp`
5. `small_subgroup_ipa/small_subgroup_ipa.hpp`
Used by ECCVM (translation) and Libra (ZK). Reduces opening claims to IPA over small multiplicative subgroup.
6. `claim_batcher.hpp` 
`ClaimBatcher_` computes batching scalars for unshifted/shifted/interleaved polynomial batches.
7. `claim.hpp` 
Data structures: `OpeningClaim`, `BatchOpeningClaim`.

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


    
    
