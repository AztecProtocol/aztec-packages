#pragma once
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/relations/relation_parameters.hpp"

namespace proof_system::honk {
template <class Flavor> class VerifierInstance_ {
  public:
    using FF = typename Flavor::FF;
    using VerificationKey = typename Flavor::VerificationKey;
    using FoldingParameters = typename Flavor::FoldingParameters;

    std::shared_ptr<VerificationKey> verification_key;
    std::vector<FF> public_inputs;
    size_t pub_inputs_offset;
    size_t public_input_size;
    size_t instance_size;
    RelationParameters<FF> relation_parameters;
    FF alpha;
    FoldingParameters folding_parameters;
};
} // namespace proof_system::honk