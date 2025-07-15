// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/ultra_honk/decider_verification_key.hpp"
#include <vector>

namespace acir_format {

template <typename Flavor> bb::HonkProof create_mock_oink_proof(const size_t num_public_inputs);
template <typename Flavor> bb::HonkProof create_mock_decider_proof();
template <typename Flavor> bb::HonkProof create_mock_honk_proof(const size_t num_public_inputs);
template <typename Flavor> bb::HonkProof create_mock_pg_proof(const size_t num_public_inputs);
bb::Goblin::MergeProof create_mock_merge_proof();

template <typename Flavor>
std::shared_ptr<typename Flavor::VerificationKey> create_mock_honk_vk(const size_t dyadic_size,
                                                                      const size_t num_public_inputs,
                                                                      const size_t pub_inputs_offset);
template <typename Flavor> std::shared_ptr<bb::DeciderVerificationKey_<Flavor>> create_mock_decider_vk();

} // namespace acir_format
