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
#include "barretenberg/ultra_honk/verifier_instance.hpp"
#include <vector>

namespace acir_format {

template <typename Flavor, class PublicInputs>
bb::HonkProof create_mock_oink_proof(const size_t inner_public_inputs_size = 0);
template <typename Flavor> bb::HonkProof create_mock_decider_proof();
template <typename Flavor, class PublicInputs>
bb::HonkProof create_mock_honk_proof(const size_t inner_public_inputs_size = 0);
template <typename Flavor, class PublicInputs> bb::HonkProof create_mock_pg_proof();
bb::Goblin::MergeProof create_mock_merge_proof();
bb::HonkProof create_mock_pre_ipa_proof();
bb::HonkProof create_mock_ipa_proof();
bb::HonkProof create_mock_translator_proof();
template <typename Builder> bb::HonkProof create_mock_civc_proof(const size_t inner_public_inputs_size = 0);

template <typename Flavor, class PublicInputs>
std::shared_ptr<typename Flavor::VerificationKey> create_mock_honk_vk(const size_t dyadic_size,
                                                                      const size_t pub_inputs_offset,
                                                                      const size_t inner_public_inputs_size = 0);
template <typename Flavor> std::shared_ptr<bb::VerifierInstance_<Flavor>> create_mock_verifier_instance();

} // namespace acir_format
