#include "generic_lookup_relation.hpp"
#include "barretenberg/flavor/relation_definitions_fwd.hpp"
#include "barretenberg/flavor/toy_avm.hpp"
#include "barretenberg/honk/proof_system/logderivative_library.hpp"
#include "relation_definer.hpp"

namespace proof_system::honk::sumcheck {

/**
 * @brief Expression for generic log-derivative-based set permutation.
 * @param accumulator transformed to `evals + C(in(X)...)*scaling_factor`
 * @param in an std::array containing the fully extended Accumulator edges.
 * @param relation_params contains beta, gamma, and public_input_delta, ....
 * @param scaling_factor optional term to scale the evaluation before adding to evals.
 */
template <typename Settings, typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void GenericLookupRelationImpl<Settings, FF>::accumulate(ContainerOverSubrelations& accumulator,
                                                         const AllEntities& in,
                                                         const Parameters& params,
                                                         const FF& scaling_factor)
{
    logderivative_library::accumulate_logderivative_permutation_subrelation_contributions<
        FF,
        GenericPermutationRelationImpl<Settings, FF>>(accumulator, in, params, scaling_factor);
}

// DEFINE_LOOKUP_IMPLEMENTATIONS_FOR_ALL_SETTINGS(GenericLookupRelationImpl, flavor::ToyAVM);
} // namespace proof_system::honk::sumcheck
