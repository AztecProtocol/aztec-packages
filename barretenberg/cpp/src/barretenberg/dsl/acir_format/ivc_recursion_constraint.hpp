#pragma once
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include <vector>

namespace acir_format {

using namespace bb;

ClientIVC create_mock_ivc_from_constraints(const std::vector<RecursionConstraint>& constraints);

ClientIVC::VerifierInputs create_dummy_vkey_and_proof_for_ivc(const PROOF_TYPE proof_type);

ClientIVC::VerifierInputs create_dummy_vkey_and_proof_oink(const TraceStructure& trace_structure,
                                                           const size_t num_public_inputs);

ClientIVC::MergeProof create_dummy_merge_proof();

void populate_dummy_vk_and_public_inputs_in_constraint(
    MegaCircuitBuilder& builder,
    const std::shared_ptr<ClientIVC::VerificationKey>& mock_verification_key,
    std::vector<uint32_t>& key_witness_indices);

} // namespace acir_format
