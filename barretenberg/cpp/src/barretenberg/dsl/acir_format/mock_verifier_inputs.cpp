#include "mock_verifier_inputs.hpp"
#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa_utils.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/multilinear_batching_flavor.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "barretenberg/vm2/constraining/flavor.hpp"

namespace acir_format {

using namespace bb;

template <class Curve>
void populate_field_elements_for_mock_commitments(std::vector<fr>& fields, const size_t& num_commitments)
{
    auto mock_commitment = Curve::AffineElement::one();
    std::vector<fr> mock_commitment_frs = FrCodec::serialize_to_fields(mock_commitment);
    for (size_t i = 0; i < num_commitments; ++i) {
        for (const fr& val : mock_commitment_frs) {
            fields.emplace_back(val);
        }
    }
}

template <class FF>
void populate_field_elements(std::vector<fr>& fields, const size_t& num_elements, std::optional<FF> value)
{
    for (size_t i = 0; i < num_elements; ++i) {
        std::vector<fr> field_elements = value.has_value() ? FrCodec::serialize_to_fields(value.value())
                                                           : FrCodec::serialize_to_fields(FF::random_element());
        fields.insert(fields.end(), field_elements.begin(), field_elements.end());
    }
}

template <typename Flavor, class PublicInputs> HonkProof create_mock_oink_proof(const size_t acir_public_inputs_size)
{
    HonkProof proof;

    // Populate mock public inputs
    typename PublicInputs::Builder builder;
    PublicInputs::add_default(builder);

    // Populate the proof with as many public inputs as required from the ACIR constraints
    populate_field_elements<fr>(proof, acir_public_inputs_size);

    // Populate the proof with the public inputs added from barretenberg
    for (const auto& pub : builder.public_inputs()) {
        proof.emplace_back(builder.get_variable(pub));
    }

    // Populate mock witness polynomial commitments
    populate_field_elements_for_mock_commitments(proof, Flavor::NUM_WITNESS_ENTITIES);

    return proof;
}

template <typename Flavor> HonkProof create_mock_sumcheck_proof()
{
    using FF = typename Flavor::FF;
    HonkProof proof;

    // Sumcheck univariates
    const size_t TOTAL_SIZE_SUMCHECK_UNIVARIATES = Flavor::VIRTUAL_LOG_N * Flavor::BATCHED_RELATION_PARTIAL_LENGTH;
    populate_field_elements<FF>(proof, TOTAL_SIZE_SUMCHECK_UNIVARIATES);

    // Sumcheck multilinear evaluations
    populate_field_elements<FF>(proof, Flavor::NUM_ALL_ENTITIES);

    return proof;
}

HonkProof create_mock_multilinear_batch_proof(size_t num_claims)
{
    std::optional<HonkProof> proof;
    constexpr_for<2, CHONK_MAX_CLAIMS_PER_KERNEL + 1, 1>([&]<size_t NumClaims>() {
        if (num_claims == NumClaims) {
            proof = create_mock_sumcheck_proof<MultilinearBatchingFlavor_<NumClaims>>();
        }
    });
    BB_ASSERT(proof.has_value(), "Unmatched num_claims in create_mock_multilinear_batch_proof");

    return proof.value();
}

template <typename Flavor, class PublicInputs> HonkProof create_mock_sumcheck_to_accumulator_proof()
{
    HonkProof oink_proof = create_mock_oink_proof<Flavor, PublicInputs>(/*acir_public_inputs_size=*/0);
    HonkProof sumcheck_proof = create_mock_sumcheck_proof<Flavor>();

    HonkProof proof;
    proof.reserve(oink_proof.size() + sumcheck_proof.size());
    proof.insert(proof.end(), oink_proof.begin(), oink_proof.end());
    proof.insert(proof.end(), sumcheck_proof.begin(), sumcheck_proof.end());

    return proof;
}

template <typename Flavor> HonkProof create_mock_pcs_proof()
{
    using FF = Flavor::FF;
    using Curve = Flavor::Curve;
    HonkProof proof;

    // Gemini fold commitments
    const size_t NUM_GEMINI_FOLD_COMMITMENTS = Flavor::VIRTUAL_LOG_N - 1;
    populate_field_elements_for_mock_commitments<Curve>(proof, NUM_GEMINI_FOLD_COMMITMENTS);

    // Gemini fold evaluations
    const size_t NUM_GEMINI_FOLD_EVALUATIONS = Flavor::VIRTUAL_LOG_N;
    populate_field_elements<FF>(proof, NUM_GEMINI_FOLD_EVALUATIONS);

    if constexpr (Flavor::HasZK) {
        // NUM_SMALL_IPA_TRANSCRIPT_EVALS libra evals
        populate_field_elements<FF>(proof, NUM_SMALL_IPA_TRANSCRIPT_EVALS);
    }

    // Shplonk batched quotient commitment
    populate_field_elements_for_mock_commitments<Curve>(proof, /*num_commitments=*/1);
    // KZG quotient commitment
    populate_field_elements_for_mock_commitments<Curve>(proof, /*num_commitments=*/1);

    return proof;
}

template <typename Flavor> HonkProof create_mock_decider_proof()
{
    using FF = Flavor::FF;
    using Curve = Flavor::Curve;
    HonkProof proof;

    constexpr size_t const_proof_log_n = []() {
        if constexpr (std::is_same_v<Flavor, bb::avm2::AvmFlavor>) {
            return MEGA_AVM_LOG_N;
        } else {
            return Flavor::VIRTUAL_LOG_N;
        }
    }();

    if constexpr (Flavor::HasZK) {
        // Libra concatenation commitment
        populate_field_elements_for_mock_commitments<Curve>(proof, 1);

        // Libra sum
        populate_field_elements<FF>(proof, 1);
    }

    // Sumcheck univariates
    const size_t TOTAL_SIZE_SUMCHECK_UNIVARIATES = const_proof_log_n * Flavor::BATCHED_RELATION_PARTIAL_LENGTH;
    populate_field_elements<FF>(proof, TOTAL_SIZE_SUMCHECK_UNIVARIATES);

    // Sumcheck multilinear evaluations
    populate_field_elements<FF>(proof, Flavor::NUM_ALL_ENTITIES);

    if constexpr (Flavor::HasZK) {
        // Libra claimed evaluation
        populate_field_elements<FF>(proof, 1);

        // Libra grand sum commitment
        populate_field_elements_for_mock_commitments<Curve>(proof, 1);

        // Libra quotient commitment
        populate_field_elements_for_mock_commitments<Curve>(proof, 1);
    }

    // Gemini fold commitments
    const size_t NUM_GEMINI_FOLD_COMMITMENTS = const_proof_log_n - 1;
    populate_field_elements_for_mock_commitments<Curve>(proof, NUM_GEMINI_FOLD_COMMITMENTS);

    // Gemini fold evaluations
    const size_t NUM_GEMINI_FOLD_EVALUATIONS = const_proof_log_n;
    populate_field_elements<FF>(proof, NUM_GEMINI_FOLD_EVALUATIONS);

    if constexpr (Flavor::HasZK) {
        // NUM_SMALL_IPA_TRANSCRIPT_EVALS libra evals
        populate_field_elements<FF>(proof, NUM_SMALL_IPA_TRANSCRIPT_EVALS);
    }

    // Shplonk batched quotient commitment
    populate_field_elements_for_mock_commitments<Curve>(proof, /*num_commitments=*/1);
    // KZG quotient commitment
    populate_field_elements_for_mock_commitments<Curve>(proof, /*num_commitments=*/1);

    return proof;
}

template <typename Flavor, class PublicInputs> HonkProof create_mock_honk_proof(const size_t acir_public_inputs_size)
{
    // Construct a Honk proof as the concatenation of an Oink proof and a Decider proof
    HonkProof oink_proof = create_mock_oink_proof<Flavor, PublicInputs>(acir_public_inputs_size);
    HonkProof decider_proof = create_mock_decider_proof<Flavor>();
    HonkProof proof;
    proof.reserve(oink_proof.size() + decider_proof.size());
    proof.insert(proof.end(), oink_proof.begin(), oink_proof.end());
    proof.insert(proof.end(), decider_proof.begin(), decider_proof.end());

    if constexpr (PublicInputs::HasIPA) {
        HonkProof ipa_proof = create_mock_ipa_proof();
        proof.insert(proof.end(), ipa_proof.begin(), ipa_proof.end());
    }
    return proof;
}

HonkProof create_mock_avm_proof_without_pub_inputs()
{
    constexpr size_t proof_length = bb::avm2::AvmFlavor::COMPUTED_AVM_PROOF_LENGTH_IN_FIELDS;
    HonkProof oink_proof =
        create_mock_oink_proof<bb::avm2::AvmFlavor, stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>(
            /*acir_public_inputs_size=*/0);
    HonkProof decider_proof = create_mock_decider_proof<avm2::AvmFlavor>();

    HonkProof proof;
    proof.reserve(proof_length);
    proof.insert(proof.end(),
                 oink_proof.begin() +
                     bb::DefaultIO::PUBLIC_INPUTS_SIZE, // Skip the Oink public inputs as they are not needed
                 oink_proof.end());
    proof.insert(proof.end(), decider_proof.begin(), decider_proof.end());

    BB_ASSERT_EQ(proof.size(), proof_length, "AVM mock proof length must match COMPUTED_AVM_PROOF_LENGTH_IN_FIELDS");

    return proof;
}

template <typename Flavor, typename IO>
std::pair<HonkProof, std::shared_ptr<typename Flavor::VerificationKey>> construct_arbitrary_valid_honk_proof_and_vk(
    const size_t acir_public_inputs_size)
{
    using ProverInstance = ProverInstance_<Flavor>;
    using InnerProver = bb::UltraProver_<Flavor>;
    using VerificationKey = Flavor::VerificationKey;
    using Builder = typename Flavor::CircuitBuilder;

    // Construct a circuit with a single gate
    Builder builder;

    fr a = fr::random_element();
    fr b = fr::random_element();
    fr c = fr::random_element();
    fr d = a + b + c;

    uint32_t a_idx = builder.add_variable(a);
    uint32_t b_idx = builder.add_variable(b);
    uint32_t c_idx = builder.add_variable(c);
    uint32_t d_idx = builder.add_variable(d);

    builder.create_big_add_gate({ a_idx, b_idx, c_idx, d_idx, fr(1), fr(1), fr(1), fr(-1), fr(0) });

    // Add the public inputs
    for (size_t i = 0; i < acir_public_inputs_size; ++i) {
        builder.add_public_variable(fr::random_element());
    }

    IO::add_default(builder);

    // prove the circuit constructed above
    // Create the decider proving key
    auto decider_pk = std::make_shared<ProverInstance>(builder);

    // Construct the Ultra VK
    auto vk = std::make_shared<VerificationKey>(decider_pk->get_precomputed());
    InnerProver prover(decider_pk, vk);
    auto honk_proof = prover.construct_proof();
    return std::pair(honk_proof, vk);
}

Goblin::MergeProof create_mock_merge_proof()
{
    Goblin::MergeProof proof;
    proof.reserve(MERGE_PROOF_SIZE);

    uint32_t mock_shift_size = 5; // Must be smaller than 32, otherwise pow raises an error

    // Populate mock shift size
    populate_field_elements<fr>(proof, 1, /*value=*/fr{ mock_shift_size });

    // Populate mock merged table commitments and batched degree check polynomial commitment
    populate_field_elements_for_mock_commitments(proof, NUM_WIRES + 1);

    // Populate evaluations (3 * NUM_WIRES + 1: left, right, and merged tables, plus batched degree check polynomial)
    populate_field_elements(proof, (3 * NUM_WIRES) + 1);

    // Shplonk proof: commitment to the quotient
    populate_field_elements_for_mock_commitments(proof, 1);

    // KZG proof: commitment to W
    populate_field_elements_for_mock_commitments(proof, 1);

    BB_ASSERT_EQ(proof.size(), MERGE_PROOF_SIZE);

    return proof;
}

HonkProof create_mock_batch_merge_proof()
{
    HonkProof proof;

    constexpr size_t MAX_MERGE_SIZE = Goblin::BatchMergeRecursiveVerifier::MAX_MERGE_SIZE;

    // Commitments to the fixed-width list of subtables.
    populate_field_elements_for_mock_commitments(proof, MAX_MERGE_SIZE * NUM_WIRES);

    // Commitments to the ZK masking table.
    populate_field_elements_for_mock_commitments(proof, NUM_WIRES);

    // Number of real subtables. Keep it in [1, MAX_MERGE_SIZE] so recursive range checks can be constructed.
    populate_field_elements<fr>(proof, 1, /*value=*/fr{ 1 });

    // Shift sizes.
    populate_field_elements<fr>(proof, 1, /*value=*/fr{ 2 });
    populate_field_elements<fr>(proof, MAX_MERGE_SIZE - 1, /*value=*/fr{ 0 });

    // Merged table commitments and degree-check polynomial commitment.
    populate_field_elements_for_mock_commitments(proof, NUM_WIRES + 1);

    // Evaluations: C_i(kappa), optional ZK C_i(kappa), T(kappa), and G(kappa^{-1}).
    const size_t num_evaluations = (MAX_MERGE_SIZE * NUM_WIRES) + NUM_WIRES + NUM_WIRES + 1;
    populate_field_elements(proof, num_evaluations);

    // Shplonk quotient commitment and KZG opening commitment.
    populate_field_elements_for_mock_commitments(proof, 2);

    return proof;
}

/**
 * @brief Create a mock pre-ipa proof which has the correct structure but is not necessarily valid
 *
 * @details An ECCVM proof is made of a pre-ipa proof and an ipa-proof. Here we mock the pre-ipa part.
 *
 * @return HonkProof
 */
HonkProof create_mock_eccvm_proof()
{
    using FF = ECCVMFlavor::FF;
    HonkProof proof;

    // 1. NUM_WITNESS_ENTITIES + 1 commitments (includes gemini_masking_poly)
    populate_field_elements_for_mock_commitments<curve::Grumpkin>(proof, ECCVMFlavor::NUM_WITNESS_ENTITIES + 1);

    // 2. Libra concatenation commitment
    populate_field_elements_for_mock_commitments<curve::Grumpkin>(proof, /*num_commitments*/ 1);

    // 3. Libra sum
    populate_field_elements<FF>(proof, 1);

    // 4. Sumcheck univariates commitments + 5. Sumcheck univariate evaluations
    for (size_t idx = 0; idx < CONST_ECCVM_LOG_N; idx++) {
        populate_field_elements_for_mock_commitments<curve::Grumpkin>(proof, /*num_commitments=*/1);
        populate_field_elements<FF>(proof, /*num_elements=*/2);
    }

    // 6. ALL_ENTITIES sumcheck evaluations
    populate_field_elements<FF>(proof, ECCVMFlavor::NUM_ALL_ENTITIES);

    // 7. Libra evaluation
    populate_field_elements<FF>(proof, 1);

    // 8. Libra grand sum commitment
    populate_field_elements_for_mock_commitments<curve::Grumpkin>(proof, /*num_commitments=*/1);

    // 9. Libra quotient commitment
    populate_field_elements_for_mock_commitments<curve::Grumpkin>(proof, /*num_commitments=*/1);

    // 10. NUM_SMALL_IPA_TRANSCRIPT_EVALS libra evals
    populate_field_elements<FF>(proof, NUM_SMALL_IPA_TRANSCRIPT_EVALS);

    // 11. Translator concatenated masking term commitment
    populate_field_elements_for_mock_commitments<curve::Grumpkin>(proof, /*num_commitments=*/1);

    // 12. Translator op evaluation
    populate_field_elements<FF>(proof, 1);

    // 13. Translator Px evaluation
    populate_field_elements<FF>(proof, 1);

    // 14. Translator Py evaluation
    populate_field_elements<FF>(proof, 1);

    // 15. Translator z1 evaluation
    populate_field_elements<FF>(proof, 1);

    // 16. Translator z2 evaluation
    populate_field_elements<FF>(proof, 1);

    // 17. Translator concatenated masking term evaluation
    populate_field_elements<FF>(proof, 1);

    // 18. Translator grand sum commitment
    populate_field_elements_for_mock_commitments<curve::Grumpkin>(proof, /*num_commitments=*/1);

    // 19. Translator quotient commitment
    populate_field_elements_for_mock_commitments<curve::Grumpkin>(proof, /*num_commitments=*/1);

    // 20. Translator concatenation evaluation
    populate_field_elements<FF>(proof, 1);

    // 21. Translator grand sum shift evaluation
    populate_field_elements<FF>(proof, 1);

    // 22. Translator grand sum evaluation
    populate_field_elements<FF>(proof, 1);

    // 23. Translator quotient evaluation
    populate_field_elements<FF>(proof, 1);

    // 24. TripleIPA pow-tensor masking commitment
    populate_field_elements_for_mock_commitments<curve::Grumpkin>(proof, /*num_commitments=*/1);

    // 25. TripleIPA pow-tensor masking evaluation
    populate_field_elements<FF>(proof, 1);

    // 26. Shplonk
    populate_field_elements_for_mock_commitments<curve::Grumpkin>(proof, /*num_commitments=*/1);

    BB_ASSERT_EQ(proof.size(), ECCVMFlavor::PROOF_LENGTH);

    return proof;
}

HonkProof create_mock_ipa_proof()
{
    HonkProof proof;

    // Commitments to L and R for CONST_ECCVM_LOG_N round
    populate_field_elements_for_mock_commitments<curve::Grumpkin>(
        proof, /*num_commitments=*/CONST_ECCVM_LOG_N + CONST_ECCVM_LOG_N);

    // Commitment to G_0
    populate_field_elements_for_mock_commitments<curve::Grumpkin>(proof, /*num_commitments=*/1);

    // a_0 evaluation (a_0 is in the base field of BN254)
    populate_field_elements<curve::BN254::BaseField>(proof, 1);

    BB_ASSERT_EQ(proof.size(), IPA_PROOF_LENGTH);

    return proof;
}

HonkProof create_mock_triple_ipa_proof()
{
    using FF = ECCVMFlavor::FF;
    HonkProof proof;

    // TripleIPA cross sums
    populate_field_elements<FF>(proof, 3);

    // TripleIPA L and R round commitments
    populate_field_elements_for_mock_commitments<curve::Grumpkin>(proof, /*num_commitments=*/2 * CONST_ECCVM_LOG_N);

    // TripleIPA G_0 commitment
    populate_field_elements_for_mock_commitments<curve::Grumpkin>(proof, /*num_commitments=*/1);

    // TripleIPA a_0 evaluation
    populate_field_elements<FF>(proof, 1);

    BB_ASSERT_EQ(proof.size(), ECCVMFlavor::TRIPLE_IPA_PROOF_LENGTH);

    return proof;
}

HonkProof create_mock_translator_proof()
{
    using Flavor = TranslatorFlavor;
    using Curve = Flavor::Curve;
    using FF = Flavor::FF;

    HonkProof proof;

    // 1. Gemini masking poly commitment
    populate_field_elements_for_mock_commitments<Curve>(proof, /*num_commitments=*/1);

    // 2. Wire commitments: concatenated(5) + ordered(5) = 10
    populate_field_elements_for_mock_commitments<Curve>(proof, /*num_commitments=*/Flavor::NUM_COMMITMENTS_IN_PROOF);

    // 3. Z_PERM commitment
    populate_field_elements_for_mock_commitments<Curve>(proof, /*num_commitments=*/1);

    // 4. Libra concatenation commitment
    populate_field_elements_for_mock_commitments<Curve>(proof, /*num_commitments=*/1);

    // 5. Libra sum
    populate_field_elements<FF>(proof, 1);

    // 6. Sumcheck univariates
    populate_field_elements<FF>(proof, Flavor::CONST_TRANSLATOR_LOG_N * Flavor::BATCHED_RELATION_PARTIAL_LENGTH);

    // 7. Sumcheck evaluations (computable precomputed and reconstructed concat evals excluded)
    populate_field_elements<FF>(proof, Flavor::NUM_SENT_EVALUATIONS);

    // 8. Libra claimed evaluation
    populate_field_elements<FF>(proof, 1);

    // 9. Libra grand sum commitment
    populate_field_elements_for_mock_commitments<Curve>(proof, /*num_commitments=*/1);

    // 10. Libra quotient commitment
    populate_field_elements_for_mock_commitments<Curve>(proof, /*num_commitments=*/1);

    // 11-15. PCS proof (Gemini fold commitments/evaluations, libra evals, Shplonk, KZG)
    HonkProof pcs_proof = create_mock_pcs_proof<Flavor>();
    proof.insert(proof.end(), pcs_proof.begin(), pcs_proof.end());

    BB_ASSERT_EQ(proof.size(), Flavor::PROOF_LENGTH);

    return proof;
}

/**
 * @brief Create a mock batched joint proof (Translator Oink + joint sumcheck + joint PCS).
 * @details Matches the structure produced by BatchedHonkTranslatorProver::prove():
 *   - Translator Oink: gemini masking commitment, wire commitments, z_perm commitment
 *   - Joint Sumcheck: Libra masking, 17-round univariates, minicircuit evals,
 *                     MegaZK evaluations, translator evaluations, Libra evaluation
 *   - Joint PCS: Gemini folds, Libra evals, Shplonk, KZG
 */
HonkProof create_mock_batched_joint_proof()
{
    using TransFlavor = TranslatorFlavor;
    using Curve = TransFlavor::Curve;
    using FF = TransFlavor::FF;

    HonkProof proof;

    // === Translator Oink ===
    // 1. Gemini masking poly commitment
    populate_field_elements_for_mock_commitments<Curve>(proof, /*num_commitments=*/1);
    // 2. Wire commitments: concatenated(5) + ordered(5) = 10
    populate_field_elements_for_mock_commitments<Curve>(proof,
                                                        /*num_commitments=*/TransFlavor::NUM_COMMITMENTS_IN_PROOF);
    // 3. Z_PERM commitment
    populate_field_elements_for_mock_commitments<Curve>(proof, /*num_commitments=*/1);

    // === Joint Sumcheck ===
    // 4. Libra concatenation commitment
    populate_field_elements_for_mock_commitments<Curve>(proof, /*num_commitments=*/1);
    // 5. Libra sum
    populate_field_elements<FF>(proof, 1);
    // 6. Committed sumcheck rounds 0..JOINT_LOG_N-1 (commitment + 2 evals per round)
    constexpr size_t JOINT_LOG_N = TransFlavor::CONST_TRANSLATOR_LOG_N;
    for (size_t round = 0; round < JOINT_LOG_N; round++) {
        // Minicircuit evaluations appear after round LOG_MINI_CIRCUIT_SIZE-1's data
        if (round == TransFlavor::LOG_MINI_CIRCUIT_SIZE) {
            populate_field_elements<FF>(proof, TransFlavor::NUM_MINICIRCUIT_EVALUATIONS);
        }
        populate_field_elements_for_mock_commitments<Curve>(proof, /*num_commitments=*/1); // round univariate comm
        populate_field_elements<FF>(proof, 2);                                             // evals at 0 and 1
    }
    // 7. MegaZK evaluations (sent after all sumcheck rounds)
    populate_field_elements<FF>(proof, MegaZKFlavor::NUM_ALL_ENTITIES);
    // 8. Translator full circuit evaluations (sent after all rounds)
    populate_field_elements<FF>(proof, TransFlavor::NUM_FULL_CIRCUIT_EVALUATIONS);
    // 9. Libra claimed evaluation
    populate_field_elements<FF>(proof, 1);
    // 10. Libra grand sum commitment
    populate_field_elements_for_mock_commitments<Curve>(proof, /*num_commitments=*/1);
    // 11. Libra quotient commitment
    populate_field_elements_for_mock_commitments<Curve>(proof, /*num_commitments=*/1);

    // === Joint PCS (same structure as standalone translator PCS, using JOINT_LOG_N = 17) ===
    HonkProof pcs_proof = create_mock_pcs_proof<TransFlavor>();
    proof.insert(proof.end(), pcs_proof.begin(), pcs_proof.end());

    return proof;
}

template <typename Builder> HonkProof create_mock_chonk_proof(const size_t acir_public_inputs_size)
{
    // MegaZK Oink only (no decider — sumcheck+PCS are batched into the joint proof)
    HonkProof hiding_oink =
        create_mock_oink_proof<MegaZKFlavor, stdlib::recursion::honk::HidingKernelIO<Builder>>(acir_public_inputs_size);
    Goblin::MergeProof merge_proof = create_mock_merge_proof();
    HonkProof eccvm_proof{ create_mock_eccvm_proof() };
    HonkProof triple_ipa_proof{ create_mock_triple_ipa_proof() };
    // Batched joint proof: Translator Oink + joint sumcheck + joint PCS
    HonkProof joint_proof = create_mock_batched_joint_proof();

    ChonkProof chonk_proof{ std::move(hiding_oink),
                            std::move(merge_proof),
                            std::move(eccvm_proof),
                            std::move(triple_ipa_proof),
                            std::move(joint_proof) };
    return chonk_proof.to_field_elements();
}

template <typename Flavor, class PublicInputs>
std::shared_ptr<typename Flavor::VerificationKey> create_mock_honk_vk(const size_t dyadic_size,
                                                                      const size_t acir_public_inputs_size)
{
    // Set relevant VK metadata and commitments
    auto honk_verification_key = std::make_shared<typename Flavor::VerificationKey>();
    honk_verification_key->log_circuit_size = bb::numeric::get_msb(dyadic_size);
    honk_verification_key->num_public_inputs = acir_public_inputs_size + PublicInputs::PUBLIC_INPUTS_SIZE;
    honk_verification_key->pub_inputs_offset = NUM_ZERO_ROWS;

    for (auto& commitment : honk_verification_key->get_all()) {
        commitment = curve::BN254::AffineElement::one(); // arbitrary mock commitment
    }

    return honk_verification_key;
}

// Explicitly instantiate template functions
template HonkProof create_mock_oink_proof<MegaFlavor, stdlib::recursion::honk::AppIO>(const size_t);
template HonkProof create_mock_oink_proof<MegaFlavor, stdlib::recursion::honk::KernelIO>(const size_t);
template HonkProof create_mock_oink_proof<MegaFlavor, stdlib::recursion::honk::HidingKernelIO<MegaCircuitBuilder>>(
    const size_t);
template HonkProof create_mock_oink_proof<MegaZKFlavor, stdlib::recursion::honk::HidingKernelIO<UltraCircuitBuilder>>(
    const size_t);
template HonkProof create_mock_oink_proof<MegaZKFlavor, stdlib::recursion::honk::HidingKernelIO<MegaCircuitBuilder>>(
    const size_t);

template HonkProof create_mock_oink_proof<UltraFlavor, stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>(
    const size_t);
template HonkProof create_mock_oink_proof<UltraZKFlavor, stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>(
    const size_t);
template HonkProof create_mock_oink_proof<UltraFlavor, stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>>(
    const size_t);
template HonkProof create_mock_oink_proof<UltraZKFlavor, stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>>(
    const size_t);
template HonkProof create_mock_oink_proof<UltraFlavor, stdlib::recursion::honk::RollupIO>(const size_t);

template HonkProof create_mock_oink_proof<avm2::AvmFlavor, stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>(
    const size_t);

template HonkProof create_mock_pcs_proof<MegaFlavor>();
template HonkProof create_mock_pcs_proof<MegaKernelFlavor>();
template HonkProof create_mock_pcs_proof<TranslatorFlavor>();

template HonkProof create_mock_decider_proof<MegaFlavor>();
template HonkProof create_mock_decider_proof<UltraFlavor>();
template HonkProof create_mock_decider_proof<UltraZKFlavor>();
template HonkProof create_mock_decider_proof<avm2::AvmFlavor>();

template HonkProof create_mock_honk_proof<MegaFlavor, stdlib::recursion::honk::AppIO>(const size_t);
template HonkProof create_mock_honk_proof<MegaFlavor, stdlib::recursion::honk::KernelIO>(const size_t);
template HonkProof create_mock_honk_proof<MegaFlavor, stdlib::recursion::honk::HidingKernelIO<MegaCircuitBuilder>>(
    const size_t);

template HonkProof create_mock_honk_proof<UltraFlavor, stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>(
    const size_t);
template HonkProof create_mock_honk_proof<UltraZKFlavor, stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>(
    const size_t);
template HonkProof create_mock_honk_proof<UltraFlavor, stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>>(
    const size_t);
template HonkProof create_mock_honk_proof<UltraZKFlavor, stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>>(
    const size_t);
template HonkProof create_mock_honk_proof<UltraFlavor, stdlib::recursion::honk::RollupIO>(const size_t);

template std::pair<HonkProof, std::shared_ptr<UltraFlavor::VerificationKey>>
construct_arbitrary_valid_honk_proof_and_vk<UltraFlavor, stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>(
    const size_t);
template std::pair<HonkProof, std::shared_ptr<UltraZKFlavor::VerificationKey>>
construct_arbitrary_valid_honk_proof_and_vk<UltraZKFlavor, stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>(
    const size_t);
template std::pair<HonkProof, std::shared_ptr<UltraFlavor::VerificationKey>>
construct_arbitrary_valid_honk_proof_and_vk<UltraFlavor, stdlib::recursion::honk::RollupIO>(const size_t);

template HonkProof create_mock_sumcheck_to_accumulator_proof<MegaFlavor, stdlib::recursion::honk::AppIO>();
template HonkProof create_mock_sumcheck_to_accumulator_proof<MegaFlavor, stdlib::recursion::honk::KernelIO>();
template HonkProof create_mock_sumcheck_to_accumulator_proof<MegaAppFlavor,
                                                             stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>>();
template HonkProof create_mock_sumcheck_to_accumulator_proof<MegaKernelFlavor, stdlib::recursion::honk::KernelIO>();

template HonkProof create_mock_chonk_proof<UltraCircuitBuilder>(const size_t);
template HonkProof create_mock_chonk_proof<MegaCircuitBuilder>(const size_t);

template std::shared_ptr<MegaFlavor::VerificationKey> create_mock_honk_vk<MegaFlavor, stdlib::recursion::honk::AppIO>(
    const size_t, const size_t);
template std::shared_ptr<MegaFlavor::VerificationKey> create_mock_honk_vk<MegaFlavor,
                                                                          stdlib::recursion::honk::KernelIO>(
    const size_t, const size_t);
template std::shared_ptr<MegaAppFlavor::VerificationKey> create_mock_honk_vk<MegaAppFlavor,
                                                                             stdlib::recursion::honk::AppIO>(
    const size_t, const size_t);
template std::shared_ptr<MegaKernelFlavor::VerificationKey> create_mock_honk_vk<MegaKernelFlavor,
                                                                                stdlib::recursion::honk::KernelIO>(
    const size_t, const size_t);
template std::shared_ptr<MegaFlavor::VerificationKey> create_mock_honk_vk<
    MegaFlavor,
    stdlib::recursion::honk::HidingKernelIO<MegaCircuitBuilder>>(const size_t, const size_t);
template std::shared_ptr<MegaZKFlavor::VerificationKey> create_mock_honk_vk<
    MegaZKFlavor,
    stdlib::recursion::honk::HidingKernelIO<UltraCircuitBuilder>>(const size_t, const size_t);

template std::shared_ptr<UltraFlavor::VerificationKey> create_mock_honk_vk<
    UltraFlavor,
    stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>(const size_t, const size_t);
template std::shared_ptr<UltraZKFlavor::VerificationKey> create_mock_honk_vk<
    UltraZKFlavor,
    stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>(const size_t, const size_t);
template std::shared_ptr<UltraFlavor::VerificationKey> create_mock_honk_vk<
    UltraFlavor,
    stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>>(const size_t, const size_t);
template std::shared_ptr<UltraZKFlavor::VerificationKey> create_mock_honk_vk<
    UltraZKFlavor,
    stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>>(const size_t, const size_t);
template std::shared_ptr<UltraFlavor::VerificationKey> create_mock_honk_vk<UltraFlavor,
                                                                           stdlib::recursion::honk::RollupIO>(
    const size_t, const size_t);

} // namespace acir_format
