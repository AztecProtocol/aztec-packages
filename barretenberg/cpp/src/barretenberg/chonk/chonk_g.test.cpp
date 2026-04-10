#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/flavor/chonk_g_flavor.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/srs/factories/grumpkin_srs_gen.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/oink_verifier.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/verifier_instance.hpp"
#include <gtest/gtest.h>

namespace bb {

class ChonkGTests : public ::testing::Test {
  protected:
    using Flavor = ChonkGFlavor;
    using FF = Flavor::FF;
    using Curve = Flavor::Curve;
    using Commitment = Flavor::Commitment;
    using Builder = Flavor::CircuitBuilder;
    using Prover = UltraProver_<Flavor>;
    using ProverInstance = ProverInstance_<Flavor>;
    using VerificationKey = Flavor::VerificationKey;
    using Transcript = Flavor::Transcript;
    using PCS = Flavor::PCS;

    static void SetUpTestSuite()
    {
        srs::init_bn254_file_crs_factory(bb::srs::bb_crs_path());
        auto grumpkin_srs = srs::generate_grumpkin_srs(1ULL << CONST_CHONK_G_LOG_N);
        srs::init_grumpkin_mem_crs_factory(grumpkin_srs);
    }

    static Builder create_simple_circuit(size_t num_gates = 128)
    {
        Builder builder;
        for (size_t i = 0; i < num_gates; i++) {
            FF a = FF::random_element();
            FF b = FF::random_element();
            FF c = a + b;
            FF d = a + b + c;
            uint32_t a_idx = builder.add_variable(a);
            uint32_t b_idx = builder.add_variable(b);
            uint32_t c_idx = builder.add_variable(c);
            uint32_t d_idx = builder.add_variable(d);
            builder.create_big_add_gate({ a_idx, b_idx, c_idx, d_idx, FF(1), FF(1), FF(1), FF(-1), FF(0) });
        }
        return builder;
    }

    static bool verify_chonk_g_proof(const std::shared_ptr<VerificationKey>& vk,
                                     const typename Transcript::Proof& proof)
    {
        using Shplemini = ShpleminiVerifier_<Curve, Flavor::HasZK>;
        using VerifierCommitments = typename Flavor::VerifierCommitments;
        using ClaimBatcher = ClaimBatcher_<Curve>;
        using ClaimBatch = typename ClaimBatcher::Batch;

        auto transcript = std::make_shared<Transcript>();
        transcript->load_proof(proof);

        auto vk_and_hash = std::make_shared<typename Flavor::VKAndHash>(vk);
        auto verifier_instance = std::make_shared<VerifierInstance_<Flavor>>(vk_and_hash);

        const size_t log_circuit_size = static_cast<size_t>(vk->log_circuit_size);
        const size_t log_n = Flavor::USE_PADDING ? Flavor::VIRTUAL_LOG_N : log_circuit_size;
        const size_t num_public_inputs = static_cast<size_t>(vk->num_public_inputs);

        OinkVerifier<Flavor> oink_verifier{ verifier_instance, transcript, num_public_inputs };
        oink_verifier.verify();

        std::vector<FF> padding_indicator_array(log_n, FF{ 1 });
        for (size_t idx = log_circuit_size; idx < log_n; idx++) {
            padding_indicator_array[idx] = FF{ 0 };
        }

        verifier_instance->gate_challenges =
            transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", log_n);

        VerifierCommitments commitments{ vk, verifier_instance->witness_commitments };
        commitments.gemini_masking_poly = verifier_instance->gemini_masking_commitment;

        SumcheckVerifier<Flavor> sumcheck(transcript, verifier_instance->alpha, log_n);
        std::array<Commitment, NUM_LIBRA_COMMITMENTS> libra_commitments = {};
        libra_commitments[0] =
            transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");

        auto sumcheck_output = sumcheck.verify(
            verifier_instance->relation_parameters, verifier_instance->gate_challenges, padding_indicator_array);

        libra_commitments[1] =
            transcript->template receive_from_prover<Commitment>("Libra:grand_sum_commitment");
        libra_commitments[2] =
            transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");

        // Create IPA VK early (needed for g1_identity in Shplemini)
        constexpr size_t SMALL_SUBGROUP_IPA_MAX_POLY_LENGTH = Curve::SUBGROUP_SIZE + 3;
        const size_t ipa_poly_length =
            std::max(static_cast<size_t>(1UL << log_circuit_size),
                     numeric::round_up_power_2(SMALL_SUBGROUP_IPA_MAX_POLY_LENGTH));
        const size_t ipa_num_rounds = numeric::get_msb(ipa_poly_length);
        VerifierCommitmentKey<Curve> ipa_vk(ipa_poly_length);

        ClaimBatcher claim_batcher{
            .unshifted =
                ClaimBatch{ commitments.get_unshifted(), sumcheck_output.claimed_evaluations.get_unshifted() },
            .shifted =
                ClaimBatch{ commitments.get_to_be_shifted(), sumcheck_output.claimed_evaluations.get_shifted() }
        };

        auto shplemini_output = Shplemini::compute_batch_opening_claim(
            padding_indicator_array,
            claim_batcher,
            sumcheck_output.challenge,
            Commitment::one(),
            transcript,
            Flavor::REPEATED_COMMITMENTS,
            libra_commitments,
            sumcheck_output.claimed_libra_evaluation,
            sumcheck_output.round_univariate_commitments,
            sumcheck_output.round_univariate_evaluations);

        if (!shplemini_output.consistency_checked || !sumcheck_output.verified) {
            info("ChonkG: field verification failed (consistency=", shplemini_output.consistency_checked,
                 " sumcheck=", sumcheck_output.verified, ")");
            return false;
        }

        // IPA verification
        return PCS::reduce_verify_batch_opening_claim(
            shplemini_output.batch_opening_claim, ipa_vk, transcript, ipa_num_rounds);
    }
};

TEST_F(ChonkGTests, ProverInstanceConstruction)
{
    auto builder = create_simple_circuit();
    auto prover_instance = std::make_shared<ProverInstance>(builder);
    EXPECT_GT(prover_instance->get_precomputed().metadata.dyadic_size, 0);
}

TEST_F(ChonkGTests, ProveSimpleCircuit)
{
    auto builder = create_simple_circuit();
    auto prover_instance = std::make_shared<ProverInstance>(builder);
    auto verification_key = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
    Prover prover(prover_instance, verification_key);
    auto proof = prover.construct_proof();
    info("Proof size: ", proof.size(), " FE");
    EXPECT_FALSE(proof.empty());
}

TEST_F(ChonkGTests, ProveAndVerify)
{
    auto builder = create_simple_circuit();
    auto prover_instance = std::make_shared<ProverInstance>(builder);
    auto verification_key = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
    Prover prover(prover_instance, verification_key);
    auto proof = prover.construct_proof();

    bool verified = verify_chonk_g_proof(verification_key, proof);
    EXPECT_TRUE(verified);
}

} // namespace bb
