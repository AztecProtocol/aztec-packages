#pragma once
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include <vector>

namespace acir_format {

using namespace bb;

// TODO(https://github.com/AztecProtocol/barretenberg/issues/1148): logic in this file is incomplete. See issue for
// details.

ClientIVC create_mock_ivc_from_constraints(const std::vector<RecursionConstraint>& constraints);

void mock_ivc_oink_accumulation(ClientIVC& ivc, size_t num_public_inputs_app = 0);

ClientIVC::VerifierInputs create_dummy_vkey_and_proof_oink(const TraceSettings& trace_settings,
                                                           const size_t num_public_inputs);

ClientIVC::MergeProof create_dummy_merge_proof();

void populate_dummy_vk_in_constraint(MegaCircuitBuilder& builder,
                                     const std::shared_ptr<MegaFlavor::VerificationKey>& mock_verification_key,
                                     std::vector<uint32_t>& key_witness_indices);

} // namespace acir_format
