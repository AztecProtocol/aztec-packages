#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/goblin_avm/goblin_avm.hpp"
#include "barretenberg/goblin_avm/goblin_avm_verifier.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_verification_keys_comparator.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

namespace bb::stdlib::recursion::honk {
class GoblinAvmRecursiveVerifierTests : public testing::Test {
  public:
    using InnerBuilder = MegaCircuitBuilder;
    using ECCVMVK = GoblinAvm::ECCVMVerificationKey;
    using TranslatorVK = GoblinAvm::TranslatorVerificationKey;

    using OuterFlavor = UltraFlavor;
    using OuterBuilder = OuterFlavor::CircuitBuilder;
    using OuterProver = UltraProver_<OuterFlavor>;
    using OuterVerifier = UltraRollupVerifier;
    using OuterProverInstance = ProverInstance_<OuterFlavor>;

    using Commitment = UltraFlavor::Commitment;
    using RecursiveCommitment = bb::GoblinAvmRecursiveVerifier::Commitment;

    using TableCommitments = std::array<Commitment, UltraCircuitBuilder::NUM_WIRES>;
    using RecursiveTableCommitments = bb::GoblinAvmRecursiveVerifier::TableCommitments;

    using Transcript = UltraStdlibTranscript;
    using FF = TranslatorFlavor::FF;
    using BF = TranslatorFlavor::BF;
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    // Compute the size of a Translator commitment (in bb::fr's)
    static constexpr size_t comm_frs = FrCodec::calc_num_fields<Commitment>(); // 4
    static constexpr size_t eval_frs = FrCodec::calc_num_fields<FF>();         // 1

    struct ProverOutput {
        GoblinAvmProof proof;
        TableCommitments table_commitments;
        RecursiveTableCommitments recursive_table_commitments;
    };
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1298):
    // Better recursion testing - create more flexible proof tampering tests.
    // Tamper with the `op` commitment in the table commitments (op commitments are no longer in translator proof)
    static void tamper_with_op_commitment(TableCommitments& table_commitments)
    {
        // The first commitment in table is the `op` wire commitment
        table_commitments[0] = table_commitments[0] * FF(2);
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
    static ProverOutput create_goblin_avm_prover_output(OuterBuilder* outer_builder)
    {
        auto op_queue = std::make_shared<ECCOpQueue>();
        InnerBuilder inner_builder(op_queue);
        GoblinAvm goblin(inner_builder);
        MockCircuits::construct_arithmetic_circuit(inner_builder);

        auto goblin_proof = goblin.prove();

        // Subtable values and commitments
        TableCommitments table_commitments;
        auto ultra_ops_table_columns = goblin.op_queue->construct_ultra_ops_table_columns();
        CommitmentKey<curve::BN254> pcs_commitment_key(goblin.op_queue->get_ultra_ops_table_num_rows());
        for (size_t idx = 0; idx < MegaFlavor::NUM_WIRES; idx++) {
            table_commitments[idx] = pcs_commitment_key.commit(ultra_ops_table_columns[idx]);
        }

        RecursiveTableCommitments recursive_table_commitments;
        for (size_t idx = 0; idx < MegaFlavor::NUM_WIRES; idx++) {
            recursive_table_commitments[idx] = RecursiveCommitment::from_witness(outer_builder, table_commitments[idx]);
            // Removing the free witness tag, since the table commitments in the full scheme are supposed to
            // be fiat-shamirred earlier
            recursive_table_commitments[idx].unset_free_witness_tag();
        }

        // Output is a goblin proof plus table commitments
        return { goblin_proof, table_commitments, recursive_table_commitments };
    }
};

/**
 * @brief Construct and check a goblin recursive verification circuit
 *
 */
TEST_F(GoblinAvmRecursiveVerifierTests, Basic)
{
    OuterBuilder builder;

    auto [proof, table_commitments, recursive_table_commitments] = create_goblin_avm_prover_output(&builder);

    auto transcript = std::make_shared<Transcript>();
    GoblinAvmStdlibProof stdlib_proof(builder, proof);
    bb::GoblinAvmRecursiveVerifier verifier{ transcript, stdlib_proof, recursive_table_commitments };
    auto output = verifier.reduce_to_pairing_check_and_ipa_opening();

    stdlib::recursion::honk::RollupIO inputs;
    inputs.pairing_inputs = output.translator_pairing_points;
    inputs.ipa_claim = output.ipa_claim;
    inputs.set_public();

    builder.ipa_proof = output.ipa_proof.get_value();

    info("Recursive Verifier: num gates = ", builder.num_gates());

    EXPECT_EQ(builder.failed(), false) << builder.err();

    EXPECT_TRUE(CircuitChecker::check(builder));

    // Construct and verify a proof for the Goblin Recursive Verifier circuit
    {
        auto prover_instance = std::make_shared<OuterProverInstance>(builder);
        auto verification_key =
            std::make_shared<typename OuterFlavor::VerificationKey>(prover_instance->get_precomputed());
        auto vk_and_hash = std::make_shared<typename OuterFlavor::VKAndHash>(verification_key);
        OuterProver prover(prover_instance, verification_key);
        OuterVerifier verifier(vk_and_hash);
        auto proof = prover.construct_proof();
        bool verified = verifier.verify_proof(proof).result;

        ASSERT_TRUE(verified);
    }
}

/**
 * @brief Ensure failure of the goblin recursive verification circuit for a bad ECCVM proof
 *
 */
TEST_F(GoblinAvmRecursiveVerifierTests, ECCVMFailure)
{
    BB_DISABLE_ASSERTS(); // Avoid on_curve assertion failure in cycle_group etc
    OuterBuilder builder;

    auto [proof, table_commitments, recursive_table_commitments] = create_goblin_avm_prover_output(&builder);

    // Tamper with the ECCVM proof
    for (auto& val : proof.eccvm_proof) {
        if (val > 0) { // tamper by finding the first non-zero value and incrementing it by 1
            val += 1;
            break;
        }
    }

    auto transcript = std::make_shared<Transcript>();
    GoblinAvmStdlibProof stdlib_proof(builder, proof);
    bb::GoblinAvmRecursiveVerifier verifier{ transcript, stdlib_proof, recursive_table_commitments };
    auto goblin_rec_verifier_output = verifier.reduce_to_pairing_check_and_ipa_opening();
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
TEST_F(GoblinAvmRecursiveVerifierTests, TranslatorFailure)
{
    // Tamper with the op commitment in table commitments (used by Translator verifier)
    {
        OuterBuilder builder;

        auto [proof, table_commitments, _] = create_goblin_avm_prover_output(&builder);
        TableCommitments tampered_table_commitments = table_commitments;
        tamper_with_op_commitment(tampered_table_commitments);

        RecursiveTableCommitments recursive_table_commitments;
        for (size_t idx = 0; idx < MegaFlavor::NUM_WIRES; idx++) {
            recursive_table_commitments[idx] =
                RecursiveCommitment::from_witness(&builder, tampered_table_commitments[idx]);
            recursive_table_commitments[idx].fix_witness();
        }

        auto transcript = std::make_shared<Transcript>();
        GoblinAvmStdlibProof stdlib_proof(builder, proof);
        bb::GoblinAvmRecursiveVerifier verifier{ transcript, stdlib_proof, recursive_table_commitments };
        auto goblin_rec_verifier_output = verifier.reduce_to_pairing_check_and_ipa_opening();

        // Circuit is correct but pairing check should fail
        EXPECT_TRUE(CircuitChecker::check(builder));

        // Check that the pairing fails natively
        bb::PairingPoints<curve::BN254> native_pairing_points(
            goblin_rec_verifier_output.translator_pairing_points.P0().get_value(),
            goblin_rec_verifier_output.translator_pairing_points.P1().get_value());
        bool pairing_result = native_pairing_points.check();
        EXPECT_FALSE(pairing_result);
    }
    // Tamper with the Translator proof non - preamble values
    {
        OuterBuilder builder;

        auto [proof, table_commitments, recursive_table_commitments] = create_goblin_avm_prover_output(&builder);
        auto tampered_proof = proof;
        tamper_with_libra_eval(tampered_proof.translator_proof);

        auto transcript = std::make_shared<Transcript>();
        GoblinAvmStdlibProof stdlib_proof(builder, tampered_proof);
        bb::GoblinAvmRecursiveVerifier verifier{ transcript, stdlib_proof, recursive_table_commitments };
        [[maybe_unused]] auto goblin_rec_verifier_output = verifier.reduce_to_pairing_check_and_ipa_opening();
        EXPECT_FALSE(CircuitChecker::check(builder));
    }
}

/**
 * @brief Ensure failure of the goblin recursive verification circuit for bad translation evaluations
 *
 */
TEST_F(GoblinAvmRecursiveVerifierTests, TranslationEvaluationsFailure)
{
    OuterBuilder builder;

    auto [proof, table_commitments, recursive_table_commitments] = create_goblin_avm_prover_output(&builder);
    // Tamper with the `op` evaluation in the ECCVM proof using the helper function
    tamper_with_eccvm_op_eval(proof.eccvm_proof);

    auto transcript = std::make_shared<Transcript>();
    GoblinAvmStdlibProof stdlib_proof(builder, proof);
    bb::GoblinAvmRecursiveVerifier verifier{ transcript, stdlib_proof, recursive_table_commitments };
    [[maybe_unused]] auto goblin_rec_verifier_output = verifier.reduce_to_pairing_check_and_ipa_opening();

    EXPECT_FALSE(CircuitChecker::check(builder));
}
} // namespace bb::stdlib::recursion::honk
