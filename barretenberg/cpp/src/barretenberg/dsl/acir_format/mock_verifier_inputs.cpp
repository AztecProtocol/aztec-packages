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
template <class Curve = curve::BN254>
void populate_field_elements_for_mock_commitments(std::vector<fr>& fields, const size_t& num_commitments)
{
    auto mock_commitment = Curve::AffineElement::one();
    std::vector<fr> mock_commitment_frs = field_conversion::convert_to_bn254_frs(mock_commitment);
    for (size_t i = 0; i < num_commitments; ++i) {
        for (const fr& val : mock_commitment_frs) {
            fields.emplace_back(val);
        }
    }
}

/**
 * @brief Helper to populate a field buffer with some number of field elements
 *
 * @param fields field buffer to append field elements to
 * @param num_elements number of mock field elements to append
 * @param value optional mock value appended
 */
template <class FF = curve::BN254::ScalarField>
void populate_field_elements(std::vector<fr>& fields,
                             const size_t& num_elements,
                             std::optional<uint32_t> value = std::nullopt)
{
    if (value.has_value()) {
        for (size_t i = 0; i < num_elements; ++i) {
            fields.emplace_back(fr{ value.value() });
        }
    } else {
        for (size_t i = 0; i < num_elements; ++i) {
            for (auto& val : field_conversion::convert_to_bn254_frs(FF::random_element())) {
                fields.emplace_back(val);
            }
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
    HonkProof proof;

    if (Flavor::HasZK) {
        // Libra concatenation commitment
        populate_field_elements_for_mock_commitments(proof, 1);

        // Libra sum
        populate_field_elements(proof, 1);
    }

    // Sumcheck univariates
    const size_t TOTAL_SIZE_SUMCHECK_UNIVARIATES = CONST_PROOF_SIZE_LOG_N * Flavor::BATCHED_RELATION_PARTIAL_LENGTH;
    populate_field_elements(proof, TOTAL_SIZE_SUMCHECK_UNIVARIATES);

    // Sumcheck multilinear evaluations
    populate_field_elements(proof, Flavor::NUM_ALL_ENTITIES);

    if (Flavor::HasZK) {
        // Libra claimed evaluation
        populate_field_elements(proof, 1);

        // Libra grand sum commitment
        populate_field_elements_for_mock_commitments(proof, 1);

        // Libra quotient commitment
        populate_field_elements_for_mock_commitments(proof, 1);

        // Gemini masking commitment
        populate_field_elements_for_mock_commitments(proof, 1);

        // Gemini masking evaluation
        populate_field_elements(proof, 1);
    }

    // Gemini fold commitments
    const size_t NUM_GEMINI_FOLD_COMMITMENTS = CONST_PROOF_SIZE_LOG_N - 1;
    populate_field_elements_for_mock_commitments(proof, NUM_GEMINI_FOLD_COMMITMENTS);

    // Gemini fold evaluations
    const size_t NUM_GEMINI_FOLD_EVALUATIONS = CONST_PROOF_SIZE_LOG_N;
    populate_field_elements(proof, NUM_GEMINI_FOLD_EVALUATIONS);

    if (Flavor::HasZK) {
        // NUM_SMALL_IPA_EVALUATIONS libra evals
        populate_field_elements(proof, NUM_SMALL_IPA_EVALUATIONS);
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

    if (HasIPAAccumulator<Flavor>) {
        HonkProof ipa_proof = create_mock_ipa_proof();
        proof.insert(proof.end(), ipa_proof.begin(), ipa_proof.end());
    }
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
    populate_field_elements(proof, CONST_PG_LOG_N, /*value=*/0);

    // Populate mock combiner quotient coefficients
    size_t NUM_COEFF_COMBINER_QUOTIENT =
        DeciderProvingKeys_<Flavor>::BATCHED_EXTENDED_LENGTH - DeciderProvingKeys_<Flavor>::NUM;
    populate_field_elements(proof, NUM_COEFF_COMBINER_QUOTIENT, /*value=*/0);

    return proof;
}

/**
 * @brief Create a mock merge proof which has the correct structure but is not necessarily valid
 *
 * @return Goblin::MergeProof
 */
Goblin::MergeProof create_mock_merge_proof()
{
    Goblin::MergeProof proof;
    proof.reserve(MERGE_PROOF_SIZE);

    uint32_t mock_shift_size = 5;

    // Populate mock shift size
    populate_field_elements(proof, 1, /*value=*/mock_shift_size);

    // There are 8 entities in the merge protocol (4 columns x 2 components: T_j, g_j(X) = X^{l-1} t_j(X))
    // and 8 evaluations (4 columns x 2 components: g_j(kappa), t_j(1/kappa))
    const size_t NUM_TRANSCRIPT_ENTITIES = 8;
    const size_t NUM_TRANSCRIPT_EVALUATIONS = 8;

    // Transcript poly commitments
    populate_field_elements_for_mock_commitments(proof, NUM_TRANSCRIPT_ENTITIES);

    // Transcript poly evaluations
    populate_field_elements(proof, NUM_TRANSCRIPT_EVALUATIONS);

    // Shplonk proof: commitment to the quotient
    populate_field_elements_for_mock_commitments(proof, 1);

    // KZG proof: commitment to W
    populate_field_elements_for_mock_commitments(proof, 1);

    BB_ASSERT_EQ(proof.size(), MERGE_PROOF_SIZE);

    return proof;
}

/**
 * @brief Create a mock pre-ipa proof which has the correct structure but is not necessarily valid
 *
 * @return HonkProof
 */
HonkProof create_mock_pre_ipa_proof()
{
    using FF = ECCVMFlavor::FF;
    HonkProof proof;

    // 1. NUM_WITNESS_ENTITIES commitments
    populate_field_elements_for_mock_commitments<curve::Grumpkin>(proof, ECCVMFlavor::NUM_WITNESS_ENTITIES);

    // 2. Libra concatenation commitment
    populate_field_elements_for_mock_commitments<curve::Grumpkin>(proof, /*num_commitments*/ 1);

    // 3. Libra sum
    populate_field_elements<FF>(proof, 1);

    // 4. Sumcheck univariates commitments
    populate_field_elements_for_mock_commitments<curve::Grumpkin>(proof, /*num_commitments=*/CONST_ECCVM_LOG_N);

    // 5. Sumcheck univariate evaluations
    populate_field_elements<FF>(proof, CONST_ECCVM_LOG_N + CONST_ECCVM_LOG_N);

    // 6. ALL_ENTITIES sumcheck evaluations
    populate_field_elements<FF>(proof, ECCVMFlavor::NUM_ALL_ENTITIES);

    // 7. Libra evaluation
    populate_field_elements<FF>(proof, 1);

    // 8. Libra grand sum commitment
    populate_field_elements_for_mock_commitments<curve::Grumpkin>(proof, /*num_commitments=*/1);

    // 9. Libra quotient commitment
    populate_field_elements_for_mock_commitments<curve::Grumpkin>(proof, /*num_commitments=*/1);

    // 10. Gemini masking commitment
    populate_field_elements_for_mock_commitments<curve::Grumpkin>(proof, /*num_commitments=*/1);

    // 11. Gemini masking evaluations
    populate_field_elements<FF>(proof, 1);

    // 12. Gemini fold commitments
    populate_field_elements_for_mock_commitments<curve::Grumpkin>(proof,
                                                                  /*num_commitments=*/CONST_ECCVM_LOG_N - 1);

    // 13. Gemini evaluations
    populate_field_elements<FF>(proof, CONST_ECCVM_LOG_N);

    // 14. NUM_SMALL_IPA_EVALUATIONS libra evals
    populate_field_elements<FF>(proof, NUM_SMALL_IPA_EVALUATIONS);

    // 15. Shplonk
    populate_field_elements_for_mock_commitments<curve::Grumpkin>(proof, /*num_commitments=*/1);

    // 16. Translator concatenated masking term commitment
    populate_field_elements_for_mock_commitments<curve::Grumpkin>(proof, /*num_commitments=*/1);

    // 17. Translator op evaluation
    populate_field_elements<FF>(proof, 1);

    // 18. Translator Px evaluation
    populate_field_elements<FF>(proof, 1);

    // 19. Translator Py evaluation
    populate_field_elements<FF>(proof, 1);

    // 20. Translator z1 evaluation
    populate_field_elements<FF>(proof, 1);

    // 21. Translator z2 evaluation
    populate_field_elements<FF>(proof, 1);

    // 22. Translator concatenated masking term evaluation
    populate_field_elements<FF>(proof, 1);

    // 23. Translator grand sum commitment
    populate_field_elements_for_mock_commitments<curve::Grumpkin>(proof, /*num_commitments=*/1);

    // 24. Translator quotient commitment
    populate_field_elements_for_mock_commitments<curve::Grumpkin>(proof, /*num_commitments=*/1);

    // 25. Translator concatenation evaluation
    populate_field_elements<FF>(proof, 1);

    // 26. Translator grand sum shift evaluation
    populate_field_elements<FF>(proof, 1);

    // 27. Translator grand sum evaluation
    populate_field_elements<FF>(proof, 1);

    // 28. Translator quotient evaluation
    populate_field_elements<FF>(proof, 1);

    // 29. Shplonk
    populate_field_elements_for_mock_commitments<curve::Grumpkin>(proof, /*num_commitments=*/1);

    BB_ASSERT_EQ(proof.size(), ECCVMFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS - IPA_PROOF_LENGTH);

    return proof;
}

/**
 * @brief Create a mock ipa proof which has the correct structure but is not necessarily valid
 *
 * @return HonkProof
 */
HonkProof create_mock_ipa_proof()
{
    HonkProof proof;

    // Commitments to L and R for CONST_ECCVM_LOG_N round
    populate_field_elements_for_mock_commitments<curve::Grumpkin>(
        proof, /*num_commitments=*/CONST_ECCVM_LOG_N + CONST_ECCVM_LOG_N);

    // Commitment to G_0
    populate_field_elements_for_mock_commitments<curve::Grumpkin>(proof, /*num_commitments=*/1);

    // a_0 evaluation (a_0 is in the base field of BN254)
    proof.emplace_back(fr::random_element());
    proof.emplace_back(fr::random_element());

    BB_ASSERT_EQ(proof.size(), IPA_PROOF_LENGTH);

    return proof;
}

/**
 * @brief Create a mock translator proof which has the correct structure but is not necessarily valid
 *
 * @return HonkProof
 */
HonkProof create_mock_translator_proof()
{
    using FF = TranslatorFlavor::FF;
    using BF = TranslatorFlavor::BF;
    using Curve = TranslatorFlavor::Curve;

    HonkProof proof;

    // 1. Accumulated result
    populate_field_elements<BF>(proof, 1);

    // 1. NUM_WITNESS_ENTITIES commitments
    populate_field_elements_for_mock_commitments<Curve>(proof,
                                                        /*num_commitments=*/TranslatorFlavor::NUM_WITNESS_ENTITIES - 4);

    // 2. Libra concatenation commitment
    populate_field_elements_for_mock_commitments<Curve>(proof, /*num_commitments=*/1);

    // 3. Libra sum
    populate_field_elements<FF>(proof, 1);

    // 4. sumcheck univariates
    populate_field_elements<FF>(
        proof, TranslatorFlavor::CONST_TRANSLATOR_LOG_N * TranslatorFlavor::BATCHED_RELATION_PARTIAL_LENGTH);

    // 5. NUM_ALL_ENTITIES sumcheck evaluations
    populate_field_elements<FF>(proof, TranslatorFlavor::NUM_ALL_ENTITIES);

    // 6. Libra claimed evaluation
    populate_field_elements<FF>(proof, 1);

    // 7. Libra grand sum commitment
    populate_field_elements_for_mock_commitments<Curve>(proof, /*num_commitments=*/1);

    // 8. Libra quotient commitment
    populate_field_elements_for_mock_commitments<Curve>(proof, /*num_commitments=*/1);

    // 9. Gemini masking commitment
    populate_field_elements_for_mock_commitments<Curve>(proof, /*num_commitments=*/1);

    // 10. Gemini masking evaluation
    populate_field_elements<FF>(proof, 1);

    // 11. CONST_TRANSLATOR_LOG_N - 1 Gemini fold commitments
    populate_field_elements_for_mock_commitments<Curve>(proof,
                                                        /*num_commitments=*/TranslatorFlavor::CONST_TRANSLATOR_LOG_N -
                                                            1);

    // 12. CONST_TRANSLATOR_LOG_N Gemini evaluations
    populate_field_elements<FF>(proof, TranslatorFlavor::CONST_TRANSLATOR_LOG_N);

    // 13. Gemini P pos evaluation
    populate_field_elements<FF>(proof, 1);

    // 14. Gemini P neg evaluation
    populate_field_elements<FF>(proof, 1);

    // 15. NUM_SMALL_IPA_EVALUATIONS libra evals
    populate_field_elements<FF>(proof, NUM_SMALL_IPA_EVALUATIONS);

    // 16. Shplonk
    populate_field_elements_for_mock_commitments<Curve>(proof, /*num_commitments=*/1);

    // 17. KZG
    populate_field_elements_for_mock_commitments<Curve>(proof, /*num_commitments=*/1);

    BB_ASSERT_EQ(proof.size(), TranslatorFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS);

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
template HonkProof create_mock_oink_proof<UltraZKFlavor, stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>();
template HonkProof create_mock_oink_proof<UltraRollupFlavor, stdlib::recursion::honk::RollupIO>();

template HonkProof create_mock_decider_proof<MegaFlavor>();
template HonkProof create_mock_decider_proof<UltraFlavor>();
template HonkProof create_mock_decider_proof<UltraZKFlavor>();
template HonkProof create_mock_decider_proof<UltraRollupFlavor>();

template HonkProof create_mock_honk_proof<MegaFlavor, stdlib::recursion::honk::AppIO>();
template HonkProof create_mock_honk_proof<MegaFlavor, stdlib::recursion::honk::KernelIO>();
template HonkProof create_mock_honk_proof<MegaFlavor, stdlib::recursion::honk::HidingKernelIO<MegaCircuitBuilder>>();

template HonkProof create_mock_honk_proof<UltraFlavor, stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>();
template HonkProof create_mock_honk_proof<UltraZKFlavor, stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>();
template HonkProof create_mock_honk_proof<UltraRollupFlavor, stdlib::recursion::honk::RollupIO>();

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
