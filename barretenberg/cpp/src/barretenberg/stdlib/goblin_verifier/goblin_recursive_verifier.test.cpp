#include "barretenberg/stdlib/goblin_verifier/goblin_recursive_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_verification_keys_comparator.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

namespace bb::stdlib::recursion::honk {
class GoblinRecursiveVerifierTests : public testing::Test {
  public:
    using Builder = GoblinRecursiveVerifier::Builder;
    using ECCVMVK = Goblin::ECCVMVerificationKey;
    using TranslatorVK = Goblin::TranslatorVerificationKey;

    using OuterFlavor = UltraFlavor;
    using OuterProver = UltraProver_<OuterFlavor>;
    using OuterVerifier = UltraVerifier_<OuterFlavor>;
    using OuterDeciderProvingKey = DeciderProvingKey_<OuterFlavor>;

    using Commitment = MergeVerifier::Commitment;
    using RecursiveCommitment = GoblinRecursiveVerifier::MergeVerifier::Commitment;
    using MergeCommitments = MergeVerifier::WitnessCommitments;
    using RecursiveMergeCommitments = GoblinRecursiveVerifier::MergeVerifier::WitnessCommitments;

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    struct ProverOutput {
        GoblinProof proof;
        Goblin::VerificationKey verifier_input;
        MergeCommitments merge_commitments;
        RecursiveMergeCommitments recursive_merge_commitments;
    };

    /**
     * @brief Create a goblin proof and the VM verification keys needed by the goblin recursive verifier
     *
     * @return ProverOutput
     */
    static ProverOutput create_goblin_prover_output(Builder* outer_builder = nullptr, const size_t NUM_CIRCUITS = 3)
    {

        Goblin goblin;
        // Construct and accumulate multiple circuits
        for (size_t idx = 0; idx < NUM_CIRCUITS - 1; ++idx) {
            MegaCircuitBuilder builder{ goblin.op_queue };
            GoblinMockCircuits::construct_simple_circuit(builder);
            goblin.prove_merge();
        }

        Goblin goblin_final;
        goblin_final.op_queue = goblin.op_queue;
        MegaCircuitBuilder builder{ goblin_final.op_queue };
        builder.queue_ecc_no_op();
        GoblinMockCircuits::construct_simple_circuit(builder);

        // Merge the ecc ops from the newly constructed circuit
        goblin_final.op_queue->merge();

        // Subtable values and commitments - needed for (Recursive)MergeVerifier
        MergeCommitments merge_commitments;
        auto t_current = goblin_final.op_queue->construct_current_ultra_ops_subtable_columns();
        CommitmentKey<curve::BN254> pcs_commitment_key(goblin_final.op_queue->get_ultra_ops_table_num_rows());
        for (size_t idx = 0; idx < MegaFlavor::NUM_WIRES; idx++) {
            merge_commitments.t_commitments[idx] = pcs_commitment_key.commit(t_current[idx]);
        }

        RecursiveMergeCommitments recursive_merge_commitments;
        if (outer_builder != nullptr) {
            for (size_t idx = 0; idx < MegaFlavor::NUM_WIRES; idx++) {
                recursive_merge_commitments.t_commitments[idx] =
                    RecursiveCommitment::from_witness(outer_builder, merge_commitments.t_commitments[idx]);
            }
        }

        // Output is a goblin proof plus ECCVM/Translator verification keys
        return { goblin_final.prove(),
                 { std::make_shared<ECCVMVK>(), std::make_shared<TranslatorVK>() },
                 merge_commitments,
                 recursive_merge_commitments };
    }
};

/**
 * @brief Ensure the Goblin proof produced by the test method can be natively verified
 *
 */
TEST_F(GoblinRecursiveVerifierTests, NativeVerification)
{
    auto [proof, verifier_input, merge_commitments, _] = create_goblin_prover_output();

    std::shared_ptr<Goblin::Transcript> verifier_transcript = std::make_shared<Goblin::Transcript>();

    EXPECT_TRUE(Goblin::verify(proof, merge_commitments, merge_commitments.T_commitments, verifier_transcript));
}

/**
 * @brief Construct and check a goblin recursive verification circuit
 *
 */
TEST_F(GoblinRecursiveVerifierTests, Basic)
{
    Builder builder;

    auto [proof, verifier_input, merge_commitments, recursive_merge_commitments] =
        create_goblin_prover_output(&builder);

    GoblinRecursiveVerifier verifier{ &builder, verifier_input };
    GoblinRecursiveVerifierOutput output =
        verifier.verify(proof, recursive_merge_commitments, recursive_merge_commitments.T_commitments);
    output.points_accumulator.set_public();

    info("Recursive Verifier: num gates = ", builder.num_gates);

    EXPECT_EQ(builder.failed(), false) << builder.err();

    EXPECT_TRUE(CircuitChecker::check(builder));

    // Construct and verify a proof for the Goblin Recursive Verifier circuit
    {
        auto proving_key = std::make_shared<OuterDeciderProvingKey>(builder);
        auto verification_key = std::make_shared<typename OuterFlavor::VerificationKey>(proving_key->get_precomputed());
        OuterProver prover(proving_key, verification_key);
        OuterVerifier verifier(verification_key);
        auto proof = prover.construct_proof();
        bool verified = verifier.verify_proof(proof);

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

        auto [proof, verifier_input, merge_commitments, recursive_merge_commitments] =
            create_goblin_prover_output(&builder, inner_size);

        GoblinRecursiveVerifier verifier{ &builder, verifier_input };
        GoblinRecursiveVerifierOutput output =
            verifier.verify(proof, recursive_merge_commitments, recursive_merge_commitments.T_commitments);
        output.points_accumulator.set_public();

        info("Recursive Verifier: num gates = ", builder.num_gates);

        // Construct and verify a proof for the Goblin Recursive Verifier circuit
        auto proving_key = std::make_shared<OuterDeciderProvingKey>(builder);
        auto outer_verification_key =
            std::make_shared<typename OuterFlavor::VerificationKey>(proving_key->get_precomputed());
        OuterProver prover(proving_key, outer_verification_key);
        OuterVerifier outer_verifier(outer_verification_key);
        return { builder.blocks, outer_verification_key };
    };

    auto [blocks_2, verification_key_2] = get_blocks(2);
    auto [blocks_4, verification_key_4] = get_blocks(4);

    compare_ultra_blocks_and_verification_keys<OuterFlavor>({ blocks_2, blocks_4 },
                                                            { verification_key_2, verification_key_4 });
}

/**
 * @brief Ensure failure of the goblin recursive verification circuit for a bad ECCVM proof
 *
 */
TEST_F(GoblinRecursiveVerifierTests, ECCVMFailure)
{
    Builder builder;

    auto [proof, verifier_input, merge_commitments, recursive_merge_commitments] =
        create_goblin_prover_output(&builder);

    // Tamper with the ECCVM proof
    for (auto& val : proof.eccvm_proof.pre_ipa_proof) {
        if (val > 0) { // tamper by finding the first non-zero value and incrementing it by 1
            val += 1;
            break;
        }
    }

    GoblinRecursiveVerifier verifier{ &builder, verifier_input };
    GoblinRecursiveVerifierOutput goblin_rec_verifier_output =
        verifier.verify(proof, recursive_merge_commitments, recursive_merge_commitments.T_commitments);

    srs::init_file_crs_factory(bb::srs::bb_crs_path());
    auto crs_factory = srs::get_grumpkin_crs_factory();
    VerifierCommitmentKey<curve::Grumpkin> grumpkin_verifier_commitment_key(1 << CONST_ECCVM_LOG_N, crs_factory);
    OpeningClaim<curve::Grumpkin> native_claim = goblin_rec_verifier_output.opening_claim.get_native_opening_claim();
    auto native_ipa_transcript = std::make_shared<NativeTranscript>();
    auto native_ipa_proof = goblin_rec_verifier_output.ipa_proof.get_value();
    native_ipa_transcript->load_proof(native_ipa_proof);

    EXPECT_THROW_OR_ABORT(
        IPA<curve::Grumpkin>::reduce_verify(grumpkin_verifier_commitment_key, native_claim, native_ipa_transcript),
        ".*IPA verification fails.*");
}

/**
 * @brief Ensure failure of the goblin recursive verification circuit for a bad Translator proof
 *
 */
TEST_F(GoblinRecursiveVerifierTests, TranslatorFailure)
{
    auto [proof, verifier_input, merge_commitments, _] = create_goblin_prover_output();

    // Tamper with the Translator proof preamble
    {
        GoblinProof tampered_proof = proof;
        for (auto& val : tampered_proof.translator_proof) {
            if (val > 0) { // tamper by finding the first non-zero value and incrementing it by 1
                val += 1;
                break;
            }
        }

        Builder builder;

        RecursiveMergeCommitments recursive_merge_commitments;
        for (size_t idx = 0; idx < MegaFlavor::NUM_WIRES; idx++) {
            recursive_merge_commitments.t_commitments[idx] =
                RecursiveCommitment::from_witness(&builder, merge_commitments.t_commitments[idx]);
        }

        GoblinRecursiveVerifier verifier{ &builder, verifier_input };
        [[maybe_unused]] auto goblin_rec_verifier_output =
            verifier.verify(tampered_proof, recursive_merge_commitments, recursive_merge_commitments.T_commitments);
        EXPECT_FALSE(CircuitChecker::check(builder));
    }
    // Tamper with the Translator proof non-preamble values
    {
        auto tampered_proof = proof;
        int seek = 10;
        for (auto& val : tampered_proof.translator_proof) {
            if (val > 0) { // tamper by finding the tenth non-zero value and incrementing it by 1
                if (--seek == 0) {
                    val += 1;
                    break;
                }
            }
        }

        Builder builder;

        RecursiveMergeCommitments recursive_merge_commitments;
        for (size_t idx = 0; idx < MegaFlavor::NUM_WIRES; idx++) {
            recursive_merge_commitments.t_commitments[idx] =
                RecursiveCommitment::from_witness(&builder, merge_commitments.t_commitments[idx]);
        }

        GoblinRecursiveVerifier verifier{ &builder, verifier_input };
        [[maybe_unused]] auto goblin_rec_verifier_output =
            verifier.verify(tampered_proof, recursive_merge_commitments, recursive_merge_commitments.T_commitments);
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

    auto [proof, verifier_input, merge_commitments, recursive_merge_commitments] =
        create_goblin_prover_output(&builder);

    // Tamper with the evaluation of `op` witness. The index is computed manually.
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1298):
    // Better recursion testing - create more flexible proof tampering tests.
    const size_t op_limb_index = 593;
    proof.eccvm_proof.pre_ipa_proof[op_limb_index] += 1;

    GoblinRecursiveVerifier verifier{ &builder, verifier_input };
    [[maybe_unused]] auto goblin_rec_verifier_output =
        verifier.verify(proof, recursive_merge_commitments, recursive_merge_commitments.T_commitments);

    EXPECT_FALSE(CircuitChecker::check(builder));
}

/**
 * @brief Ensure failure of the goblin recursive verification circuit for bad translation evaluations
 *
 */
TEST_F(GoblinRecursiveVerifierTests, TranslatorMergeConsistencyFailure)
{

    {
        using Commitment = TranslatorFlavor::Commitment;
        using FF = TranslatorFlavor::FF;
        using BF = TranslatorFlavor::BF;

        Builder builder;

        auto [proof, verifier_input, merge_commitments, recursive_merge_commitments] =
            create_goblin_prover_output(&builder);

        std::shared_ptr<Goblin::Transcript> verifier_transcript = std::make_shared<Goblin::Transcript>();

        // Check natively that the proof is correct.
        EXPECT_TRUE(Goblin::verify(proof, merge_commitments, merge_commitments.T_commitments, verifier_transcript));

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1298):
        // Better recursion testing - create more flexible proof tampering tests.
        // Modify the `op` commitment which a part of the Merge protocol.
        auto tamper_with_op_commitment = [](HonkProof& translator_proof) {
            // Compute the size of a Translator commitment (in bb::fr's)
            static constexpr size_t num_frs_comm = bb::field_conversion::calc_num_bn254_frs<Commitment>();
            // The `op` wire commitment is currently the second element of the proof, following the
            // `accumulated_result` which is a BN254 BaseField element.
            static constexpr size_t offset = bb::field_conversion::calc_num_bn254_frs<BF>();
            // Extract `op` fields and convert them to a Commitment object
            auto element_frs = std::span{ translator_proof }.subspan(offset, num_frs_comm);
            auto op_commitment = NativeTranscriptParams::template convert_from_bn254_frs<Commitment>(element_frs);
            // Modify the commitment
            op_commitment = op_commitment * FF(2);
            // Serialize the tampered commitment into the proof (overwriting the valid one).
            auto op_commitment_reserialized = bb::NativeTranscriptParams::convert_to_bn254_frs(op_commitment);
            std::copy(op_commitment_reserialized.begin(),
                      op_commitment_reserialized.end(),
                      translator_proof.begin() + static_cast<std::ptrdiff_t>(offset));
        };

        tamper_with_op_commitment(proof.translator_proof);
        // Construct and check the Goblin Recursive Verifier circuit

        GoblinRecursiveVerifier verifier{ &builder, verifier_input };
        [[maybe_unused]] auto goblin_rec_verifier_output =
            verifier.verify(proof, recursive_merge_commitments, recursive_merge_commitments.T_commitments);

        EXPECT_FALSE(CircuitChecker::check(builder));
    }

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/787)
}
} // namespace bb::stdlib::recursion::honk
