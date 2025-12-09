#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/goblin_verifier.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_verification_keys_comparator.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

namespace bb::stdlib::recursion::honk {
class GoblinRecursiveVerifierTests : public testing::Test {
  public:
    using Builder = UltraCircuitBuilder;
    using ECCVMVK = Goblin::ECCVMVerificationKey;
    using TranslatorVK = Goblin::TranslatorVerificationKey;

    using OuterFlavor = UltraFlavor;
    using OuterProver = UltraProver_<OuterFlavor>;
    using OuterVerifier = UltraVerifier_<OuterFlavor>;
    using OuterProverInstance = ProverInstance_<OuterFlavor>;

    using Commitment = MergeVerifier::Commitment;
    using RecursiveCommitment = bb::GoblinRecursiveVerifier::MergeVerifier::Commitment;
    using MergeCommitments = MergeVerifier::InputCommitments;
    using RecursiveMergeCommitments = bb::GoblinRecursiveVerifier::MergeVerifier::InputCommitments;
    using Transcript = UltraStdlibTranscript;
    using FF = TranslatorFlavor::FF;
    using BF = TranslatorFlavor::BF;
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    // Compute the size of a Translator commitment (in bb::fr's)
    static constexpr size_t comm_frs = FrCodec::calc_num_fields<Commitment>(); // 4
    static constexpr size_t eval_frs = FrCodec::calc_num_fields<FF>();         // 1

    struct ProverOutput {
        GoblinProof proof;
        MergeCommitments merge_commitments;
        RecursiveMergeCommitments recursive_merge_commitments;
    };
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1298):
    // Better recursion testing - create more flexible proof tampering tests.
    // Tamper with the `op` commitment in the merge commitments (op commitments are no longer in translator proof)
    static void tamper_with_op_commitment(MergeCommitments& merge_commitments)
    {
        // The first commitment in merged table is the `op` wire commitment
        merge_commitments.t_commitments[0] = merge_commitments.t_commitments[0] * FF(2);
    };

    // Translator proof ends with [..., Libra:quotient_eval, Shplonk:Q, KZG:W]. We invalidate the proof by multiplying
    // the eval by 2 (it leads to a Libra consistency check failure).
    static void tamper_with_libra_eval(HonkProof& translator_proof)
    {
        // Proof tail size
        static constexpr size_t tail_size = 2 * comm_frs + eval_frs; // 2*4 + 1 = 9

        // Index of the target field (one fr) from the beginning
        const size_t idx = translator_proof.size() - tail_size;

        // Tamper: multiply by 2 (or tweak however you like)
        translator_proof[idx] = translator_proof[idx] + translator_proof[idx];
    };

    // ECCVM pre-IPA proof ends with evaluations including `op`. We tamper with the `op` evaluation.
    // The structure is: [..., op_eval, x_lo_y_hi_eval, x_hi_z_1_eval, y_lo_z_2_eval, IPA_proof...]
    // So op_eval is 3 fields before the IPA proof starts.
    static void tamper_with_eccvm_op_eval(HonkProof& eccvm_proof)
    {
        // The `op` evaluation is located 3 evaluations before the end of pre-IPA proof
        // (followed by x_lo_y_hi, x_hi_z_1, y_lo_z_2 evaluations)
        static constexpr size_t evals_after_op = 3; // x_lo_y_hi, x_hi_z_1, y_lo_z_2
        const size_t op_eval_idx = eccvm_proof.size() - evals_after_op;

        // Tamper with the op evaluation
        eccvm_proof[op_eval_idx] += FF(1);
    };

    /**
     * @brief Create a goblin proof and the VM verification keys needed by the goblin recursive verifier
     *
     * @return ProverOutput
     */
    static ProverOutput create_goblin_prover_output(Builder* outer_builder = nullptr, const size_t num_circuits = 5)
    {

        Goblin goblin;
        GoblinMockCircuits::construct_and_merge_mock_circuits(goblin, num_circuits);

        // Merge the ecc ops from the newly constructed circuit
        auto goblin_proof = goblin.prove(MergeSettings::APPEND);
        // Subtable values and commitments - needed for (Recursive)MergeVerifier
        MergeCommitments merge_commitments;
        auto t_current = goblin.op_queue->construct_current_ultra_ops_subtable_columns();
        auto T_prev = goblin.op_queue->construct_previous_ultra_ops_table_columns();
        CommitmentKey<curve::BN254> pcs_commitment_key(goblin.op_queue->get_ultra_ops_table_num_rows());
        for (size_t idx = 0; idx < MegaFlavor::NUM_WIRES; idx++) {
            merge_commitments.t_commitments[idx] = pcs_commitment_key.commit(t_current[idx]);
            merge_commitments.T_prev_commitments[idx] = pcs_commitment_key.commit(T_prev[idx]);
        }

        RecursiveMergeCommitments recursive_merge_commitments;
        if (outer_builder != nullptr) {
            for (size_t idx = 0; idx < MegaFlavor::NUM_WIRES; idx++) {
                recursive_merge_commitments.t_commitments[idx] =
                    RecursiveCommitment::from_witness(outer_builder, merge_commitments.t_commitments[idx]);
                recursive_merge_commitments.T_prev_commitments[idx] =
                    RecursiveCommitment::from_witness(outer_builder, merge_commitments.T_prev_commitments[idx]);
                // Removing the free witness tag, since the merge commitments in the full scheme are supposed to
                // be fiat-shamirred earlier
                recursive_merge_commitments.t_commitments[idx].unset_free_witness_tag();
                recursive_merge_commitments.T_prev_commitments[idx].unset_free_witness_tag();
            }
        }

        // Output is a goblin proof plus merge commitments
        return { goblin_proof, merge_commitments, recursive_merge_commitments };
    }
};

/**
 * @brief Ensure the Goblin proof produced by the test method can be natively verified
 *
 */
TEST_F(GoblinRecursiveVerifierTests, NativeVerification)
{
    auto [proof, merge_commitments, _] = create_goblin_prover_output();

    auto transcript = std::make_shared<NativeTranscript>();
    bb::GoblinVerifier verifier(transcript);
    auto result = verifier.verify(proof, merge_commitments, MergeSettings::APPEND);

    // Check pairing points
    bool pairing_verified = result.pairing_points.check();

    // Verify IPA opening
    auto ipa_transcript = std::make_shared<NativeTranscript>(result.ipa_proof);
    bool ipa_verified =
        ECCVMFlavor::PCS::reduce_verify(ECCVMFlavor::VerifierCommitmentKey{}, result.ipa_claim, ipa_transcript);

    EXPECT_TRUE(pairing_verified && ipa_verified);
}

/**
 * @brief Construct and check a goblin recursive verification circuit
 *
 */
TEST_F(GoblinRecursiveVerifierTests, Basic)
{
    Builder builder;

    auto [proof, merge_commitments, recursive_merge_commitments] = create_goblin_prover_output(&builder);

    auto transcript = std::make_shared<Transcript>();
    bb::GoblinRecursiveVerifier verifier{ transcript };
    GoblinStdlibProof stdlib_proof(builder, proof);
    auto output = verifier.verify(stdlib_proof, recursive_merge_commitments, MergeSettings::APPEND);

    stdlib::recursion::honk::DefaultIO<Builder> inputs;
    inputs.pairing_inputs = output.pairing_points;
    inputs.set_public();

    info("Recursive Verifier: num gates = ", builder.num_gates());

    EXPECT_EQ(builder.failed(), false) << builder.err();

    EXPECT_TRUE(CircuitChecker::check(builder));

    // Construct and verify a proof for the Goblin Recursive Verifier circuit
    {
        auto prover_instance = std::make_shared<OuterProverInstance>(builder);
        auto verification_key =
            std::make_shared<typename OuterFlavor::VerificationKey>(prover_instance->get_precomputed());
        OuterProver prover(prover_instance, verification_key);
        OuterVerifier verifier(verification_key);
        auto proof = prover.construct_proof();
        bool verified = verifier.template verify_proof<bb::DefaultIO>(proof).result;

        ASSERT_TRUE(verified);
    }
}

// Check that the GoblinRecursiveVerifier circuit does not depend on the inputs.
TEST_F(GoblinRecursiveVerifierTests, IndependentVKHash)
{
    // Retrieves the trace blocks (each consisting of a specific gate) from the recursive verifier circuit
    auto get_blocks = [](size_t inner_size)
        -> std::tuple<typename Builder::ExecutionTrace, std::shared_ptr<OuterFlavor::VerificationKey>> {
        Builder builder;

        auto [proof, merge_commitments, recursive_merge_commitments] =
            create_goblin_prover_output(&builder, inner_size);

        auto transcript = std::make_shared<Transcript>();
        bb::GoblinRecursiveVerifier verifier{ transcript };
        GoblinStdlibProof stdlib_proof(builder, proof);
        auto output = verifier.verify(stdlib_proof, recursive_merge_commitments, MergeSettings::APPEND);

        stdlib::recursion::honk::DefaultIO<Builder> inputs;
        inputs.pairing_inputs = output.pairing_points;
        inputs.set_public();

        info("Recursive Verifier: num gates = ", builder.num_gates());

        // Construct and verify a proof for the Goblin Recursive Verifier circuit
        auto prover_instance = std::make_shared<OuterProverInstance>(builder);
        auto outer_verification_key =
            std::make_shared<typename OuterFlavor::VerificationKey>(prover_instance->get_precomputed());
        OuterProver prover(prover_instance, outer_verification_key);
        OuterVerifier outer_verifier(outer_verification_key);
        return { builder.blocks, outer_verification_key };
    };

    auto [blocks_5, verification_key_5] = get_blocks(5);
    auto [blocks_6, verification_key_6] = get_blocks(6);

    compare_ultra_blocks_and_verification_keys<OuterFlavor>({ blocks_5, blocks_6 },
                                                            { verification_key_5, verification_key_6 });
}

/**
 * @brief Ensure failure of the goblin recursive verification circuit for a bad ECCVM proof
 *
 */
TEST_F(GoblinRecursiveVerifierTests, ECCVMFailure)
{
    BB_DISABLE_ASSERTS(); // Avoid on_curve assertion failure in cycle_group etc
    Builder builder;

    auto [proof, merge_commitments, recursive_merge_commitments] = create_goblin_prover_output(&builder);

    // Tamper with the ECCVM proof
    for (auto& val : proof.eccvm_proof) {
        if (val > 0) { // tamper by finding the first non-zero value and incrementing it by 1
            val += 1;
            break;
        }
    }

    auto transcript = std::make_shared<Transcript>();
    bb::GoblinRecursiveVerifier verifier{ transcript };
    GoblinStdlibProof stdlib_proof(builder, proof);
    auto goblin_rec_verifier_output = verifier.verify(stdlib_proof, recursive_merge_commitments);
    EXPECT_FALSE(CircuitChecker::check(builder));

    srs::init_file_crs_factory(bb::srs::bb_crs_path());
    auto crs_factory = srs::get_grumpkin_crs_factory();
    VerifierCommitmentKey<curve::Grumpkin> grumpkin_verifier_commitment_key(1 << CONST_ECCVM_LOG_N, crs_factory);
    OpeningClaim<curve::Grumpkin> native_claim = goblin_rec_verifier_output.ipa_claim.get_native_opening_claim();
    auto native_ipa_transcript = std::make_shared<NativeTranscript>(goblin_rec_verifier_output.ipa_proof.get_value());

    bool native_result =
        IPA<curve::Grumpkin>::reduce_verify(grumpkin_verifier_commitment_key, native_claim, native_ipa_transcript);
    EXPECT_FALSE(native_result);
}

/**
 * @brief Ensure failure of the goblin recursive verification circuit for a bad Translator proof
 *
 */
TEST_F(GoblinRecursiveVerifierTests, TranslatorFailure)
{
    auto [proof, merge_commitments, _] = create_goblin_prover_output();

    // Tamper with the op commitment in merge commitments (used by Translator verifier)
    {
        MergeCommitments tampered_merge_commitments = merge_commitments;
        tamper_with_op_commitment(tampered_merge_commitments);
        Builder builder;

        RecursiveMergeCommitments recursive_merge_commitments;
        for (size_t idx = 0; idx < MegaFlavor::NUM_WIRES; idx++) {
            recursive_merge_commitments.t_commitments[idx] =
                RecursiveCommitment::from_witness(&builder, tampered_merge_commitments.t_commitments[idx]);
            recursive_merge_commitments.T_prev_commitments[idx] =
                RecursiveCommitment::from_witness(&builder, tampered_merge_commitments.T_prev_commitments[idx]);
            recursive_merge_commitments.t_commitments[idx].fix_witness();
            recursive_merge_commitments.T_prev_commitments[idx].fix_witness();
        }

        auto transcript = std::make_shared<Transcript>();
        bb::GoblinRecursiveVerifier verifier{ transcript };
        GoblinStdlibProof stdlib_proof(builder, proof);
        auto goblin_rec_verifier_output =
            verifier.verify(stdlib_proof, recursive_merge_commitments, MergeSettings::APPEND);

        // Circuit is correct but pairing check should fail
        EXPECT_TRUE(CircuitChecker::check(builder));

        // Check that the pairing fails natively
        bb::PairingPoints<curve::BN254> native_pairing_points(goblin_rec_verifier_output.pairing_points.P0.get_value(),
                                                              goblin_rec_verifier_output.pairing_points.P1.get_value());
        bool pairing_result = native_pairing_points.check();
        EXPECT_FALSE(pairing_result);
    }
    // Tamper with the Translator proof non - preamble values
    {
        auto tampered_proof = proof;
        tamper_with_libra_eval(tampered_proof.translator_proof);

        Builder builder;

        RecursiveMergeCommitments recursive_merge_commitments;
        for (size_t idx = 0; idx < MegaFlavor::NUM_WIRES; idx++) {
            recursive_merge_commitments.t_commitments[idx] =
                RecursiveCommitment::from_witness(&builder, merge_commitments.t_commitments[idx]);
            recursive_merge_commitments.T_prev_commitments[idx] =
                RecursiveCommitment::from_witness(&builder, merge_commitments.T_prev_commitments[idx]);
            recursive_merge_commitments.t_commitments[idx].fix_witness();
            recursive_merge_commitments.T_prev_commitments[idx].fix_witness();
        }

        auto transcript = std::make_shared<Transcript>();
        bb::GoblinRecursiveVerifier verifier{ transcript };
        GoblinStdlibProof stdlib_proof(builder, tampered_proof);
        [[maybe_unused]] auto goblin_rec_verifier_output =
            verifier.verify(stdlib_proof, recursive_merge_commitments, MergeSettings::APPEND);
        EXPECT_FALSE(CircuitChecker::check(builder));
    }
}

/**
 * @brief Ensure failure of the goblin recursive verification circuit for bad translation evaluations
 *
 */
TEST_F(GoblinRecursiveVerifierTests, TranslationEvaluationsFailure)
{
    Builder builder;

    auto [proof, merge_commitments, recursive_merge_commitments] = create_goblin_prover_output(&builder);

    // Tamper with the `op` evaluation in the ECCVM proof using the helper function
    tamper_with_eccvm_op_eval(proof.eccvm_proof);

    auto transcript = std::make_shared<Transcript>();
    bb::GoblinRecursiveVerifier verifier{ transcript };
    GoblinStdlibProof stdlib_proof(builder, proof);
    [[maybe_unused]] auto goblin_rec_verifier_output =
        verifier.verify(stdlib_proof, recursive_merge_commitments, MergeSettings::APPEND);

    EXPECT_FALSE(CircuitChecker::check(builder));
}

/**
 * @brief Ensure failure of the goblin recursive verification circuit for bad translation evaluations
 *
 */
TEST_F(GoblinRecursiveVerifierTests, TranslatorMergeConsistencyFailure)
{

    {

        Builder builder;

        auto [proof, merge_commitments, recursive_merge_commitments] = create_goblin_prover_output(&builder);

        // Check natively that the proof is correct.
        auto native_transcript = std::make_shared<NativeTranscript>();
        bb::GoblinVerifier native_verifier(native_transcript);
        auto native_result = native_verifier.verify(proof, merge_commitments, MergeSettings::APPEND);
        bool pairing_verified = native_result.pairing_points.check();
        auto ipa_transcript = std::make_shared<NativeTranscript>(native_result.ipa_proof);
        bool ipa_verified = ECCVMFlavor::PCS::reduce_verify(
            ECCVMFlavor::VerifierCommitmentKey{}, native_result.ipa_claim, ipa_transcript);
        EXPECT_TRUE(pairing_verified && ipa_verified);

        // Tamper with the op commitment in merge commitments (used by Translator verifier)
        MergeCommitments tampered_merge_commitments = merge_commitments;
        tamper_with_op_commitment(tampered_merge_commitments);

        // Construct and check the Goblin Recursive Verifier circuit

        RecursiveMergeCommitments tampered_recursive_merge_commitments;
        for (size_t idx = 0; idx < MegaFlavor::NUM_WIRES; idx++) {
            tampered_recursive_merge_commitments.t_commitments[idx] =
                RecursiveCommitment::from_witness(&builder, tampered_merge_commitments.t_commitments[idx]);
            tampered_recursive_merge_commitments.T_prev_commitments[idx] =
                RecursiveCommitment::from_witness(&builder, tampered_merge_commitments.T_prev_commitments[idx]);
            tampered_recursive_merge_commitments.t_commitments[idx].fix_witness();
            tampered_recursive_merge_commitments.T_prev_commitments[idx].fix_witness();
        }

        auto transcript = std::make_shared<Transcript>();
        bb::GoblinRecursiveVerifier verifier{ transcript };
        GoblinStdlibProof stdlib_proof(builder, proof);
        auto goblin_rec_verifier_output =
            verifier.verify(stdlib_proof, tampered_recursive_merge_commitments, MergeSettings::APPEND);

        // Circuit is correct but pairing check should fail
        EXPECT_TRUE(CircuitChecker::check(builder));

        // Check that the pairing fails natively
        bb::PairingPoints<curve::BN254> native_pairing_points(goblin_rec_verifier_output.pairing_points.P0.get_value(),
                                                              goblin_rec_verifier_output.pairing_points.P1.get_value());
        bool pairing_result = native_pairing_points.check();
        EXPECT_FALSE(pairing_result);
    }
}
} // namespace bb::stdlib::recursion::honk
