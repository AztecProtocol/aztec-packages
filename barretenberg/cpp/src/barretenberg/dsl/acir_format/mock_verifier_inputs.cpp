// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "mock_verifier_inputs.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/ultra_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_recursive_flavor.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/ultra_honk/decider_keys.hpp"
#include "proof_surgeon.hpp"
#include "recursion_constraint.hpp"

namespace acir_format {

using namespace bb;

/**
 * @brief Helper to populate a field buffer with fields corresponding to some number of mock commitment values
 *
 * @param fields field buffer to append mock commitment values to
 * @param num_commitments number of mock commitments to append
 */
void populate_field_elements_for_mock_commitments(std::vector<fr>& fields, const size_t& num_commitments)
{
    auto mock_commitment = curve::BN254::AffineElement::one();
    std::vector<fr> mock_commitment_frs = field_conversion::convert_to_bn254_frs(mock_commitment);
    for (size_t i = 0; i < num_commitments; ++i) {
        for (const fr& val : mock_commitment_frs) {
            fields.emplace_back(val);
        }
    }
}

/**
 * @brief Create a mock oink proof that has the correct structure but is not in general valid
 *
 */
template <typename Flavor, class PublicInputs> HonkProof create_mock_oink_proof()
{
    HonkProof proof;

    // Populate mock public inputs
    typename Flavor::CircuitBuilder builder;
    PublicInputs::add_default(builder);

    for (const auto& pub : builder.public_inputs()) {
        proof.emplace_back(builder.get_variable(pub));
    }

    // Populate mock witness polynomial commitments
    populate_field_elements_for_mock_commitments(proof, Flavor::NUM_WITNESS_ENTITIES);

    return proof;
}

/**
 * @brief Create a mock decider proof that has the correct structure but is not in general valid
 *
 */
template <typename Flavor> HonkProof create_mock_decider_proof()
{
    using FF = typename Flavor::FF;

    HonkProof proof;

    // Sumcheck univariates
    const size_t TOTAL_SIZE_SUMCHECK_UNIVARIATES = CONST_PROOF_SIZE_LOG_N * Flavor::BATCHED_RELATION_PARTIAL_LENGTH;
    for (size_t i = 0; i < TOTAL_SIZE_SUMCHECK_UNIVARIATES; ++i) {
        proof.emplace_back(FF::random_element());
    }

    // Sumcheck multilinear evaluations
    for (size_t i = 0; i < Flavor::NUM_ALL_ENTITIES; ++i) {
        proof.emplace_back(FF::random_element());
    }

    // Gemini fold commitments
    const size_t NUM_GEMINI_FOLD_COMMITMENTS = CONST_PROOF_SIZE_LOG_N - 1;
    populate_field_elements_for_mock_commitments(proof, NUM_GEMINI_FOLD_COMMITMENTS);

    // Gemini fold evaluations
    const size_t NUM_GEMINI_FOLD_EVALUATIONS = CONST_PROOF_SIZE_LOG_N;
    for (size_t i = 0; i < NUM_GEMINI_FOLD_EVALUATIONS; ++i) {
        proof.emplace_back(FF::random_element());
    }

    // Shplonk batched quotient commitment
    populate_field_elements_for_mock_commitments(proof, /*num_commitments=*/1);
    // KZG quotient commitment
    populate_field_elements_for_mock_commitments(proof, /*num_commitments=*/1);

    return proof;
}

/**
 * @brief Create a mock honk proof that has the correct structure but is not in general valid
 *
 */
template <typename Flavor, class PublicInputs> HonkProof create_mock_honk_proof()
{
    // Construct a Honk proof as the concatenation of an Oink proof and a Decider proof
    HonkProof oink_proof = create_mock_oink_proof<Flavor, PublicInputs>();
    HonkProof decider_proof = create_mock_decider_proof<Flavor>();
    HonkProof proof;
    proof.reserve(oink_proof.size() + decider_proof.size());
    proof.insert(proof.end(), oink_proof.begin(), oink_proof.end());
    proof.insert(proof.end(), decider_proof.begin(), decider_proof.end());
    return proof;
}

/**
 * @brief Create a mock PG proof that has the correct structure but is not in general valid
 *
 */
template <typename Flavor, class PublicInputs> HonkProof create_mock_pg_proof()
{
    // The first part of a PG proof is an Oink proof
    HonkProof proof = create_mock_oink_proof<Flavor, PublicInputs>();

    // Populate mock perturbator coefficients
    for (size_t idx = 1; idx <= CONST_PG_LOG_N; idx++) {
        proof.emplace_back(0);
    }

    // Populate mock combiner quotient coefficients
    for (size_t idx = DeciderProvingKeys_<Flavor>::NUM; idx < DeciderProvingKeys_<Flavor>::BATCHED_EXTENDED_LENGTH;
         idx++) {
        proof.emplace_back(0);
    }

    return proof;
}

/**
 * @brief Create a mock merge proof which has the correct structure but is not necessarily valid
 *
 * @return Goblin::MergeProof
 */
Goblin::MergeProof create_mock_merge_proof()
{
    using Flavor = MegaFlavor;
    using FF = Flavor::FF;

    std::vector<FF> proof;
    proof.reserve(MERGE_PROOF_SIZE);

    FF mock_val(5);
    auto mock_commitment = curve::BN254::AffineElement::one();
    std::vector<FF> mock_commitment_frs = field_conversion::convert_to_bn254_frs(mock_commitment);

    // Populate mock subtable size
    proof.emplace_back(mock_val);

    // There are 8 entities in the merge protocol (4 columns x 2 components: T_j, g_j(X) = X^{l-1} t_j(X))
    // and 8 evaluations (4 columns x 2 components: g_j(kappa), t_j(1/kappa))
    const size_t NUM_TRANSCRIPT_ENTITIES = 8;
    const size_t NUM_TRANSCRIPT_EVALUATIONS = 8;

    // Transcript poly commitments
    for (size_t i = 0; i < NUM_TRANSCRIPT_ENTITIES; ++i) {
        for (const FF& val : mock_commitment_frs) {
            proof.emplace_back(val);
        }
    }
    // Transcript poly evaluations
    for (size_t i = 0; i < NUM_TRANSCRIPT_EVALUATIONS; ++i) {
        proof.emplace_back(mock_val);
    }

    // Shplonk proof: commitment to the quotient
    for (const FF& val : mock_commitment_frs) {
        proof.emplace_back(val);
    }

    // KZG proof: commitment to W
    for (const FF& val : mock_commitment_frs) {
        proof.emplace_back(val);
    }

    BB_ASSERT_EQ(proof.size(), MERGE_PROOF_SIZE);

    return proof;
}

/**
 * @brief Create a mock MegaHonk VK that has the correct structure
 *
 */
template <typename Flavor, class PublicInputs>
std::shared_ptr<typename Flavor::VerificationKey> create_mock_honk_vk(const size_t dyadic_size,
                                                                      const size_t pub_inputs_offset)
{
    // Set relevant VK metadata and commitments
    auto honk_verification_key = std::make_shared<typename Flavor::VerificationKey>();
    honk_verification_key->log_circuit_size = bb::numeric::get_msb(dyadic_size);
    honk_verification_key->num_public_inputs = PublicInputs::PUBLIC_INPUTS_SIZE;
    honk_verification_key->pub_inputs_offset = pub_inputs_offset; // must be set correctly

    for (auto& commitment : honk_verification_key->get_all()) {
        commitment = curve::BN254::AffineElement::one(); // arbitrary mock commitment
    }

    return honk_verification_key;
}

/**
 * @brief Create a mock Decider verification key for initilization of a mock verifier accumulator
 *
 */
template <typename Flavor> std::shared_ptr<DeciderVerificationKey_<Flavor>> create_mock_decider_vk()
{
    using FF = typename Flavor::FF;

    // Set relevant VK metadata and commitments
    auto decider_verification_key = std::make_shared<DeciderVerificationKey_<Flavor>>();
    std::shared_ptr<typename Flavor::VerificationKey> vk =
        create_mock_honk_vk<Flavor, stdlib::recursion::honk::DefaultIO<typename Flavor::CircuitBuilder>>(
            0, 0); // metadata does not need to be accurate
    decider_verification_key->vk = vk;
    decider_verification_key->is_accumulator = true;
    decider_verification_key->gate_challenges = std::vector<FF>(static_cast<size_t>(CONST_PG_LOG_N), 0);

    for (auto& commitment : decider_verification_key->witness_commitments.get_all()) {
        commitment = curve::BN254::AffineElement::one(); // arbitrary mock commitment
    }

    return decider_verification_key;
}

// Explicitly instantiate template functions
template HonkProof create_mock_oink_proof<MegaFlavor, stdlib::recursion::honk::AppIO>();
template HonkProof create_mock_oink_proof<MegaFlavor, stdlib::recursion::honk::KernelIO>();
template HonkProof create_mock_oink_proof<MegaFlavor, stdlib::recursion::honk::HidingKernelIO<MegaCircuitBuilder>>();

template HonkProof create_mock_oink_proof<UltraFlavor, stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>();

template HonkProof create_mock_decider_proof<MegaFlavor>();
template HonkProof create_mock_decider_proof<UltraFlavor>();

template HonkProof create_mock_honk_proof<MegaFlavor, stdlib::recursion::honk::AppIO>();
template HonkProof create_mock_honk_proof<MegaFlavor, stdlib::recursion::honk::KernelIO>();
template HonkProof create_mock_honk_proof<MegaFlavor, stdlib::recursion::honk::HidingKernelIO<MegaCircuitBuilder>>();

template HonkProof create_mock_honk_proof<UltraFlavor, stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>();

template HonkProof create_mock_pg_proof<MegaFlavor, stdlib::recursion::honk::AppIO>();
template HonkProof create_mock_pg_proof<MegaFlavor, stdlib::recursion::honk::KernelIO>();
template HonkProof create_mock_pg_proof<MegaFlavor, stdlib::recursion::honk::HidingKernelIO<MegaCircuitBuilder>>();

template std::shared_ptr<MegaFlavor::VerificationKey> create_mock_honk_vk<MegaFlavor, stdlib::recursion::honk::AppIO>(
    const size_t, const size_t);
template std::shared_ptr<MegaFlavor::VerificationKey> create_mock_honk_vk<MegaFlavor,
                                                                          stdlib::recursion::honk::KernelIO>(
    const size_t, const size_t);
template std::shared_ptr<MegaFlavor::VerificationKey> create_mock_honk_vk<
    MegaFlavor,
    stdlib::recursion::honk::HidingKernelIO<MegaCircuitBuilder>>(const size_t, const size_t);
template std::shared_ptr<DeciderVerificationKey_<MegaFlavor>> create_mock_decider_vk<MegaFlavor>();

} // namespace acir_format
