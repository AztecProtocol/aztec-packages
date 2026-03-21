#pragma once

#include "barretenberg/chonk/split/translator_ec_circuit.hpp"
#include "barretenberg/chonk/split/translator_field_circuit.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/flavor/chonk_g_flavor.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/oink_verifier.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "barretenberg/ultra_honk/verifier_instance.hpp"

namespace bb {

/**
 * @brief External verifier for the split Translator protocol.
 *
 * @details Verifies both Chonk_B (BN254/KZG) and Chonk_G (Grumpkin/IPA) proofs,
 * then checks polynomial equivalence between them to ensure both circuits operated
 * on the same shared witness data.
 *
 * Verification steps:
 *   1. Verify Chonk_B proof (UltraHonk/KZG) → extract h_b, alpha_b, r_b
 *   2. Verify Chonk_G proof (ChonkGFlavor/IPA) → extract pairing points, h_g, alpha_g, r_g
 *   3. Derive alpha = H(h_b, h_g)
 *   4. Check alpha matches both circuits
 *   5. Check r_b == r_g (polynomial evaluation equivalence)
 *   6. Return pairing points for deferred KZG verification
 */
class SplitTranslatorVerifier {
  public:
    // Chonk_B types (BN254/KZG)
    using ChonkBFlavor = UltraFlavor;
    using ChonkBVK = ChonkBFlavor::VerificationKey;

    // Chonk_G types (Grumpkin/IPA)
    using ChonkGFlavor_ = ChonkGFlavor;
    using ChonkGFF = ChonkGFlavor_::FF;
    using ChonkGCurve = ChonkGFlavor_::Curve;
    using ChonkGCommitment = ChonkGFlavor_::Commitment;
    using ChonkGTranscript = ChonkGFlavor_::Transcript;
    using ChonkGVK = ChonkGFlavor_::VerificationKey;
    using ChonkGPCS = ChonkGFlavor_::PCS;

    struct Result {
        bool chonk_b_verified = false;
        bool chonk_g_verified = false;
        bool polynomial_equivalence_verified = false;
        PairingPoints<curve::BN254> pairing_points;
    };

    /**
     * @brief Verify both proofs and check polynomial equivalence.
     *
     * @param chonk_b_vk Verification key for Chonk_B
     * @param chonk_b_proof Chonk_B proof (UltraHonk/KZG)
     * @param chonk_g_vk Verification key for Chonk_G
     * @param chonk_g_proof Chonk_G proof (ChonkGFlavor/IPA)
     */
    static Result verify(const std::shared_ptr<ChonkBVK>& chonk_b_vk,
                          const HonkProof& chonk_b_proof,
                          const std::shared_ptr<ChonkGVK>& chonk_g_vk,
                          const typename ChonkGTranscript::Proof& chonk_g_proof)
    {
        Result result;

        // Step 1: Verify Chonk_B proof and extract public inputs
        auto chonk_b_public_inputs = verify_chonk_b(chonk_b_vk, chonk_b_proof, result.chonk_b_verified);

        // Step 2: Verify Chonk_G proof and extract public inputs
        auto chonk_g_public_inputs = verify_chonk_g(chonk_g_vk, chonk_g_proof, result.chonk_g_verified);

        if (!result.chonk_b_verified || !result.chonk_g_verified) {
            return result;
        }

        // Step 3: Extract polynomial equivalence data from both proofs
        auto chonk_b_data = TranslatorFieldCircuit::extract_from_public_inputs(chonk_b_public_inputs);
        auto chonk_g_data = extract_chonk_g_poly_equiv(chonk_g_public_inputs);

        // Step 4: Derive alpha = H(h_b, h_g) using native Poseidon2 over fr
        // h_b is fr, h_g is fq. Convert h_g to fr for hashing.
        bb::fr h_g_as_fr = bb::fr(uint256_t(chonk_g_data.h_g));
        bb::fr alpha_fr =
            crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash({ chonk_b_data.h_b, h_g_as_fr });
        bb::fq alpha_derived = bb::fq(uint256_t(alpha_fr));

        // Step 5: Check alpha matches both circuits
        bool alpha_matches_b = (chonk_b_data.alpha == alpha_derived);
        bool alpha_matches_g = (chonk_g_data.alpha == alpha_derived);

        // Step 6: Check r_b == r_g (polynomial evaluation equivalence)
        bool eval_matches = (chonk_b_data.r_b == chonk_g_data.r_g);

        result.polynomial_equivalence_verified = alpha_matches_b && alpha_matches_g && eval_matches;

        // Step 7: Extract pairing points from Chonk_G public inputs
        result.pairing_points = extract_pairing_points(chonk_g_public_inputs);

        return result;
    }

    /**
     * @brief Derive the polynomial equivalence alpha challenge.
     * @details Uses Poseidon2 hash of h_b and h_g (converted to fr).
     */
    static bb::fq derive_alpha(bb::fr h_b, bb::fq h_g)
    {
        bb::fr h_g_as_fr = bb::fr(uint256_t(h_g));
        bb::fr alpha_fr =
            crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash({ h_b, h_g_as_fr });
        return bb::fq(uint256_t(alpha_fr));
    }

  private:
    /**
     * @brief Verify a Chonk_B proof (UltraHonk/KZG) and return public inputs.
     */
    static std::vector<bb::fr> verify_chonk_b(const std::shared_ptr<ChonkBVK>& vk,
                                                const HonkProof& proof,
                                                bool& verified)
    {
        auto vk_and_hash = std::make_shared<ChonkBFlavor::VKAndHash>(vk);
        UltraVerifier_<ChonkBFlavor, bb::DefaultIO> verifier(vk_and_hash);
        auto output = verifier.verify_proof(proof);
        verified = output.result;
        return verifier.get_public_inputs();
    }

    /**
     * @brief Verify a Chonk_G proof (ChonkGFlavor/IPA) and return public inputs.
     * @details Custom verifier: Oink → Sumcheck → Shplemini → IPA.
     */
    static std::vector<ChonkGFF> verify_chonk_g(const std::shared_ptr<ChonkGVK>& vk,
                                                  const typename ChonkGTranscript::Proof& proof,
                                                  bool& verified)
    {
        using Shplemini = ShpleminiVerifier_<ChonkGCurve, ChonkGFlavor_::HasZK>;
        using VerifierCommitments = typename ChonkGFlavor_::VerifierCommitments;
        using ClaimBatcher = ClaimBatcher_<ChonkGCurve>;
        using ClaimBatch = typename ClaimBatcher::Batch;

        auto transcript = std::make_shared<ChonkGTranscript>();
        transcript->load_proof(proof);

        auto vk_and_hash = std::make_shared<typename ChonkGFlavor_::VKAndHash>(vk);
        auto verifier_instance = std::make_shared<VerifierInstance_<ChonkGFlavor_>>(vk_and_hash);
        OinkVerifier<ChonkGFlavor_> oink_verifier{ verifier_instance, transcript, 0 };
        oink_verifier.verify();

        // Capture public inputs (populated by OinkVerifier)
        std::vector<ChonkGFF> public_inputs = verifier_instance->public_inputs;

        const size_t log_circuit_size = static_cast<size_t>(vk->log_circuit_size);
        const size_t log_n = static_cast<size_t>(ChonkGFlavor_::VIRTUAL_LOG_N);
        std::vector<ChonkGFF> padding_indicator_array(log_n, ChonkGFF{ 1 });
        for (size_t idx = 0; idx < log_n; idx++) {
            padding_indicator_array[idx] = (idx < log_circuit_size) ? ChonkGFF{ 1 } : ChonkGFF{ 0 };
        }

        verifier_instance->gate_challenges =
            transcript->template get_dyadic_powers_of_challenge<ChonkGFF>("Sumcheck:gate_challenge", log_n);

        VerifierCommitments commitments{ vk, verifier_instance->witness_commitments };
        commitments.gemini_masking_poly = verifier_instance->gemini_masking_commitment;

        SumcheckVerifier<ChonkGFlavor_> sumcheck(transcript, verifier_instance->alpha, log_n);

        std::array<ChonkGCommitment, NUM_LIBRA_COMMITMENTS> libra_commitments = {};
        libra_commitments[0] =
            transcript->template receive_from_prover<ChonkGCommitment>("Libra:concatenation_commitment");

        SumcheckOutput<ChonkGFlavor_> sumcheck_output = sumcheck.verify(
            verifier_instance->relation_parameters, verifier_instance->gate_challenges, padding_indicator_array);

        libra_commitments[1] =
            transcript->template receive_from_prover<ChonkGCommitment>("Libra:grand_sum_commitment");
        libra_commitments[2] =
            transcript->template receive_from_prover<ChonkGCommitment>("Libra:quotient_commitment");

        constexpr size_t SMALL_SUBGROUP_IPA_MAX_POLY_LENGTH = ChonkGCurve::SUBGROUP_SIZE + 3;
        const size_t ipa_poly_length =
            std::max(static_cast<size_t>(1UL << log_circuit_size),
                     numeric::round_up_power_2(SMALL_SUBGROUP_IPA_MAX_POLY_LENGTH));
        const size_t ipa_num_rounds = numeric::get_msb(ipa_poly_length);
        VerifierCommitmentKey<ChonkGCurve> ipa_vk(ipa_poly_length);

        ClaimBatcher claim_batcher{
            .unshifted =
                ClaimBatch{ commitments.get_unshifted(), sumcheck_output.claimed_evaluations.get_unshifted() },
            .shifted =
                ClaimBatch{ commitments.get_to_be_shifted(), sumcheck_output.claimed_evaluations.get_shifted() }
        };

        auto shplemini_output = Shplemini::compute_batch_opening_claim(padding_indicator_array,
                                                                       claim_batcher,
                                                                       sumcheck_output.challenge,
                                                                       ipa_vk.get_g1_identity(),
                                                                       transcript,
                                                                       ChonkGFlavor_::REPEATED_COMMITMENTS,
                                                                       libra_commitments,
                                                                       sumcheck_output.claimed_libra_evaluation,
                                                                       sumcheck_output.round_univariate_commitments,
                                                                       sumcheck_output.round_univariate_evaluations);

        if (!shplemini_output.consistency_checked || !sumcheck_output.verified) {
            verified = false;
            return public_inputs;
        }

        verified = ChonkGPCS::reduce_verify_batch_opening_claim(
            shplemini_output.batch_opening_claim, ipa_vk, transcript, ipa_num_rounds);

        return public_inputs;
    }

    /**
     * @brief Extract polynomial equivalence data from Chonk_G public inputs.
     * @details Public input layout: P_0.x, P_0.y, P_1.x, P_1.y, h_g, alpha, r_g
     */
    struct ChonkGPolyEquiv {
        bb::fq h_g;   // = ChonkGFF
        bb::fq alpha;
        bb::fq r_g;
    };

    static ChonkGPolyEquiv extract_chonk_g_poly_equiv(const std::vector<ChonkGFF>& public_inputs)
    {
        BB_ASSERT(public_inputs.size() >= 7);
        return ChonkGPolyEquiv{
            .h_g = public_inputs[4],
            .alpha = public_inputs[5],
            .r_g = public_inputs[6],
        };
    }

    /**
     * @brief Extract pairing points from Chonk_G public inputs (first 4 values).
     */
    static PairingPoints<curve::BN254> extract_pairing_points(const std::vector<ChonkGFF>& public_inputs)
    {
        BB_ASSERT(public_inputs.size() >= 4);
        g1::affine_element P0(public_inputs[0], public_inputs[1]);
        g1::affine_element P1(public_inputs[2], public_inputs[3]);
        return PairingPoints<curve::BN254>(P0, P1);
    }
};

} // namespace bb
