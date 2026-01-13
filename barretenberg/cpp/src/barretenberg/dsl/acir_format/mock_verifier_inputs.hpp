// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/ultra_honk/verifier_instance.hpp"
#include <vector>

namespace acir_format {

/**
 * @brief Helper to populate a field buffer with fields corresponding to some number of mock commitment values
 *
 * @param fields field buffer to append mock commitment values to
 * @param num_commitments number of mock commitments to append
 */
template <class Curve = bb::curve::BN254>
void populate_field_elements_for_mock_commitments(std::vector<bb::fr>& fields, const size_t& num_commitments);

/**
 * @brief Helper to populate a field buffer with some number of field elements
 *
 * @param fields field buffer to append field elements to
 * @param num_elements number of mock field elements to append
 * @param value optional mock value appended
 */
template <class FF = bb::curve::BN254::ScalarField>
void populate_field_elements(std::vector<bb::fr>& fields,
                             const size_t& num_elements,
                             std::optional<FF> value = std::nullopt);

/**
 * @brief Create a mock oink proof that has the correct structure but is not in general valid
 *
 * @param acir_public_inputs_size Number of public inputs coming from the ACIR constraints
 */
template <typename Flavor, class PublicInputs>
bb::HonkProof create_mock_oink_proof(const size_t acir_public_inputs_size = 0);

/**
 * @brief Create a mock sumcheck proof that has the correct structure but is not in general valid
 *
 */
template <typename Flavor> bb::HonkProof create_mock_sumcheck_proof();

/**
 * @brief Create a mock multilinear batching sumcheck proof that has the correct structure but is not in general valid
 *
 */
bb::HonkProof create_mock_multilinear_batch_proof();

/**
 * @brief Create a mock Hypernova proof that has the correct structure but is not in general valid
 *
 * @param include_fold If true, the proof contains a mock multilinear batching sumcheck proof
 */
template <typename Flavor, class PublicInputs> bb::HonkProof create_mock_hyper_nova_proof(bool include_fold = false);

/**
 * @brief Create a mock PCS proof that has the correct structure but is not in general valid
 *
 */
template <typename Flavor> bb::HonkProof create_mock_pcs_proof();

/**
 * @brief Create a mock decider proof that has the correct structure but is not in general valid
 *
 */
template <typename Flavor> bb::HonkProof create_mock_decider_proof();

/**
 * @brief Create a mock honk proof that has the correct structure but is not in general valid
 *
 * @param acir_public_inputs_size Number of public inputs coming from the ACIR constraints
 */
template <typename Flavor, class PublicInputs>
bb::HonkProof create_mock_honk_proof(const size_t acir_public_inputs_size = 0);

/**
 * @brief Create a valid honk proof and vk for a circuit with a single big add gate. Adds random public inputs to match
 * num_public_inputs provided.
 *
 * @param acir_public_inputs_size Number of public inputs coming from the ACIR constraints
 * @param make_proof_invalid If true, the proof is an invalid proof
 */
template <typename Flavor>
std::pair<bb::HonkProof, std::shared_ptr<typename Flavor::VerificationKey>> construct_arbitrary_valid_honk_proof_and_vk(
    size_t acir_public_inputs_size);

/**
 * @brief Create a mock merge proof which has the correct structure but is not necessarily valid
 *
 */
bb::Goblin::MergeProof create_mock_merge_proof();

/**
 * @brief Create a mock pre-ipa proof which has the correct structure but is not necessarily valid
 *
 * @details An ECCVM proof is made of a pre-ipa proof and an ipa-proof. Here we mock the pre-ipa part.
 */
bb::HonkProof create_mock_eccvm_proof();

/**
 * @brief Create a mock ipa proof which has the correct structure but is not necessarily valid
 *
 * @details An ECCVM proof is made of a pre-ipa proof and an ipa-proof. Here we mock the ipa part.
 *
 */
bb::HonkProof create_mock_ipa_proof();

/**
 * @brief Create a mock Translator proof which has the correct structure but is not necessarily valid
 *
 */
bb::HonkProof create_mock_translator_proof();

/**
 * @brief Create a mock Chonk proof which has the correct structure but is not necessarily valid
 *
 * @param acir_public_inputs_size Number of public inputs coming from the ACIR constraints
 */
template <typename Builder> bb::HonkProof create_mock_chonk_proof(const size_t acir_public_inputs_size = 0);

/**
 * @brief Create a mock VK that has the correct structure
 *
 * @param dyadic_size Dyadic size of the circuit for which we generate a vk
 * @param acir_public_inputs_size Number of public inputs coming from the ACIR constraints
 */
template <typename Flavor, class PublicInputs>
std::shared_ptr<typename Flavor::VerificationKey> create_mock_honk_vk(const size_t dyadic_size,
                                                                      const size_t acir_public_inputs_size = 0);

} // namespace acir_format
