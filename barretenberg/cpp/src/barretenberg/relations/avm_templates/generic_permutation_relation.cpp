#include "generic_permutation_relation.hpp"
#include "barretenberg/flavor/avm_template.hpp"
#include "barretenberg/flavor/relation_definitions_fwd.hpp"
#include "barretenberg/honk/proof_system/logderivative_library.hpp"

namespace proof_system::honk::sumcheck {

/**
 * @brief Expression for generic log-derivative-based set permutation.
 * @param accumulator transformed to `evals + C(in(X)...)*scaling_factor`
 * @param in an std::array containing the fully extended Accumulator edges.
 * @param relation_params contains beta, gamma, and public_input_delta, ....
 * @param scaling_factor optional term to scale the evaluation before adding to evals.
 */
template <typename FF>
template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
void GenericPermutationRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulator,
                                                    const AllEntities& in,
                                                    const Parameters& params,
                                                    const FF& scaling_factor)
{
    logderivative_library::
        accumulate_logderivative_permutation_subrelation_contributions<FF, GenericPermutationRelationImpl<FF>>(
            accumulator, in, params, scaling_factor);
}

template class GenericPermutationRelationImpl<barretenberg::fr>;
DEFINE_SUMCHECK_RELATION_CLASS(GenericPermutationRelationImpl, flavor::AVMTemplate);

} // namespace proof_system::honk::sumcheck
