#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"

#include "barretenberg/commitment_schemes/ipa/ipa.hpp"

namespace bb::stdlib::recursion::honk {

void RollupIO::add_default(Builder& builder)
{
    RollupIO inputs;
    inputs.pairing_inputs = PairingInputs::construct_default();
    auto [stdlib_opening_claim, ipa_proof] = IPA<grumpkin<Builder>>::create_random_valid_ipa_claim_and_proof(builder);
    inputs.ipa_claim = stdlib_opening_claim;
    inputs.set_public();

    builder.ipa_proof = ipa_proof;
}

} // namespace bb::stdlib::recursion::honk
