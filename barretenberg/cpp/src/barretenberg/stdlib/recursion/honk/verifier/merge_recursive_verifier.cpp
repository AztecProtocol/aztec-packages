#include "barretenberg/stdlib/recursion/honk/verifier/merge_recursive_verifier.hpp"
#include "barretenberg/commitment_schemes/zeromorph/zeromorph.hpp"
#include "barretenberg/honk/proof_system/power_polynomial.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/proof_system/library/grand_product_delta.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace proof_system::plonk::stdlib::recursion::honk {

template <typename Flavor>
MergeRecursiveVerifier_<Flavor>::MergeRecursiveVerifier_(Builder* builder)
    : builder(builder)
{}

template class MergeRecursiveVerifier_<proof_system::honk::flavor::UltraRecursive_<UltraCircuitBuilder>>;
template class MergeRecursiveVerifier_<proof_system::honk::flavor::UltraRecursive_<GoblinUltraCircuitBuilder>>;
template class MergeRecursiveVerifier_<proof_system::honk::flavor::GoblinUltraRecursive_<UltraCircuitBuilder>>;
template class MergeRecursiveVerifier_<proof_system::honk::flavor::GoblinUltraRecursive_<GoblinUltraCircuitBuilder>>;

} // namespace proof_system::plonk::stdlib::recursion::honk
