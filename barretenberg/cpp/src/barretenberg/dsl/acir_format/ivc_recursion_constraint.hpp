#pragma once
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include <vector>

namespace acir_format {

using namespace bb;

// TODO(https://github.com/AztecProtocol/barretenberg/issues/1148): logic in this file is incomplete. See issue for
// details.

std::shared_ptr<ClientIVC> create_mock_ivc_from_constraints(const std::vector<RecursionConstraint>& constraints,
                                                            const TraceSettings& trace_settings);

void mock_ivc_accumulation(const std::shared_ptr<ClientIVC>& ivc, ClientIVC::QUEUE_TYPE type, const bool is_kernel);

std::vector<ClientIVC::FF> create_mock_oink_proof(const size_t dyadic_size,
                                                  const size_t num_public_inputs,
                                                  const size_t pub_inputs_offset);

std::vector<ClientIVC::FF> create_mock_pg_proof(const size_t dyadic_size,
                                                const size_t num_public_inputs,
                                                const size_t pub_inputs_offset);

std::shared_ptr<ClientIVC::MegaVerificationKey> create_mock_honk_vk(const size_t dyadic_size,
                                                                    const size_t num_public_inputs,
                                                                    const size_t pub_inputs_offset);

std::shared_ptr<ClientIVC::DeciderVerificationKey> create_mock_decider_vk();

ClientIVC::VerifierInputs create_mock_verification_queue_entry(const ClientIVC::QUEUE_TYPE type,
                                                               const TraceSettings& trace_settings,
                                                               const bool is_kernel);

ClientIVC::MergeProof create_dummy_merge_proof();

void populate_dummy_vk_in_constraint(MegaCircuitBuilder& builder,
                                     const std::shared_ptr<MegaFlavor::VerificationKey>& mock_verification_key,
                                     std::vector<uint32_t>& key_witness_indices);

} // namespace acir_format
