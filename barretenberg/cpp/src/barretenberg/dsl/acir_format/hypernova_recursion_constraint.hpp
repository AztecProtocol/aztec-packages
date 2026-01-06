// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include <vector>

namespace acir_format {

using namespace bb;

std::shared_ptr<Chonk> create_mock_chonk_from_constraints(const std::vector<RecursionConstraint>& constraints);

void mock_chonk_accumulation(const std::shared_ptr<Chonk>& ivc, Chonk::QUEUE_TYPE type, const bool is_kernel);

void populate_dummy_vk_in_constraint(MegaCircuitBuilder& builder,
                                     const std::shared_ptr<MegaFlavor::VerificationKey>& mock_verification_key,
                                     const std::vector<uint32_t>& key_witness_indices);

} // namespace acir_format
