// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include <vector>

namespace acir_format {

using namespace bb;

std::shared_ptr<ClientIVC> create_mock_ivc_from_constraints(const std::vector<RecursionConstraint>& constraints,
                                                            const TraceSettings& trace_settings);

void mock_ivc_accumulation(const std::shared_ptr<ClientIVC>& ivc, ClientIVC::QUEUE_TYPE type, const bool is_kernel);

void populate_dummy_vk_in_constraint(MegaCircuitBuilder& builder,
                                     const std::shared_ptr<MegaFlavor::VerificationKey>& mock_verification_key,
                                     std::vector<uint32_t>& key_witness_indices);

} // namespace acir_format
