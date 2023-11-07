// #include "databus_lookup_relation.hpp"
// #include "barretenberg/flavor/relation_definitions_fwd.hpp"
// #include "barretenberg/honk/proof_system/lookup_library.hpp"

// namespace proof_system {

// /**
//  * @brief
//  * @details
//  *
//  * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
//  * @param in an std::array containing the fully extended Accumulator edges.
//  * @param parameters contains beta, gamma, and public_input_delta, ....
//  * @param scaling_factor optional term to scale the evaluation before adding to evals.
//  */
// template <typename FF>
// template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
// void DatabusLookupRelationImpl<FF>::accumulate(ContainerOverSubrelations& accumulator,
//                                                const AllEntities& in,
//                                                const Parameters& params,
//                                                [[maybe_unused]] const FF& scaling_factor)
// {
//     honk::lookup_library::accumulate_logderivative_lookup_subrelation_contributions<FF,
//     DatabusLookupRelationImpl<FF>>(
//         accumulator, in, params, scaling_factor);
// }

// template class DatabusLookupRelationImpl<barretenberg::fr>;
// DEFINE_SUMCHECK_RELATION_CLASS(DatabusLookupRelationImpl, honk::flavor::GoblinUltra);

// } // namespace proof_system
