#include "barretenberg/goblin/goblin_flush_circuit.hpp"

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/eccvm/eccvm_verifier.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/goblin_avm/goblin_avm.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/translator_vm/translator_verifier.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

namespace bb {
namespace {

class GoblinFlushCircuitTests : public testing::Test {
  public:
    using TableCommitments = MergeVerifier::TableCommitments;

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    struct ProverOutput {
        GoblinWithoutMergeProof proof;
        TableCommitments merge_commitments;
    };

    static ProverOutput create_goblin_prover_output()
    {
        // Generate OP_QUEUE and populate it with some operations
        auto op_queue = std::make_shared<ECCOpQueue>();
        MegaCircuitBuilder builder(op_queue);

        builder.queue_ecc_no_op();
        builder.queue_ecc_no_op();
        builder.queue_ecc_no_op();
        builder.queue_ecc_no_op();
        builder.queue_ecc_eq();
        builder.queue_ecc_add_accum(bb::g1::affine_element::one());

        // Use GoblinWithoutMerge with the accumulated op queue
        op_queue->merge();
        GoblinWithoutMerge flush_goblin(op_queue);
        auto flush_proof = flush_goblin.prove();

        // Extract merge commitments from op_queue
        TableCommitments table_commitments;
        auto merged_table = op_queue->construct_ultra_ops_table_columns();
        CommitmentKey<curve::BN254> pcs_commitment_key(op_queue->get_ultra_ops_table_num_rows());
        for (size_t idx = 0; idx < MegaFlavor::NUM_WIRES; idx++) {
            table_commitments[idx] = pcs_commitment_key.commit(merged_table[idx]);
        }

        return { flush_proof, table_commitments };
    }
};

/**
 * @brief Build Circuit C and check that the circuit is satisfied
 */
TEST_F(GoblinFlushCircuitTests, CircuitCorrectness)
{
    auto [proof, table_commitments] = create_goblin_prover_output();

    auto builder = build_goblin_flush_circuit(proof, table_commitments);

    EXPECT_FALSE(builder.failed()) << builder.err();
    EXPECT_TRUE(CircuitChecker::check(builder));
}

/**
 * @brief Build Circuit C, prove it with Ultra Honk, and verify the proof
 */
TEST_F(GoblinFlushCircuitTests, ProveAndVerify)
{
    auto [proof, table_commitments] = create_goblin_prover_output();

    auto builder = build_goblin_flush_circuit(proof, table_commitments);

    ASSERT_FALSE(builder.failed()) << builder.err();

    using Flavor = UltraFlavor;
    using Prover = UltraProver_<Flavor>;
    using Verifier = UltraVerifier_<Flavor, bb::GoblinFlushIO>;
    using ProverInstance = ProverInstance_<Flavor>;

    auto prover_instance = std::make_shared<ProverInstance>(builder);
    auto verification_key = std::make_shared<Flavor::VerificationKey>(prover_instance->get_precomputed());
    auto vk_and_hash = std::make_shared<Flavor::VKAndHash>(verification_key);

    Prover prover(prover_instance, verification_key);
    auto ultra_proof = prover.construct_proof();

    Verifier verifier(vk_and_hash);
    bool verified = verifier.verify_proof(ultra_proof).result;
    EXPECT_TRUE(verified);
}

/**
 * @brief Verify that the IPA claim from Circuit C matches the native Goblin verifier's output
 */
TEST_F(GoblinFlushCircuitTests, IpaClaimConsistency)
{
    auto [proof, table_commitments] = create_goblin_prover_output();

    // Get the IPA claim from native Goblin verification (ECCVM and Translator only)
    auto native_transcript = std::make_shared<NativeTranscript>();
    ECCVMVerifier eccvm_verifier{ native_transcript, proof.eccvm_proof };
    auto eccvm_result = eccvm_verifier.reduce_to_ipa_opening();

    auto translator_input = eccvm_verifier.get_translator_input_data();
    TranslatorVerifier translator_verifier{ native_transcript,
                                            proof.translator_proof,
                                            translator_input.evaluation_challenge_x,
                                            translator_input.batching_challenge_v,
                                            translator_input.accumulated_result,
                                            table_commitments };
    auto translator_result = translator_verifier.reduce_to_pairing_check();
    ASSERT_TRUE(eccvm_result.reduction_succeeded && translator_result.reduction_succeeded);

    // Build Circuit C and extract the IPA claim from public inputs
    auto builder = build_goblin_flush_circuit(proof, table_commitments);
    ASSERT_FALSE(builder.failed()) << builder.err();

    // Reconstruct GoblinFlushIO from the circuit's public inputs
    using GoblinFlushIO = stdlib::recursion::honk::GoblinFlushIO<UltraCircuitBuilder>;
    using FF = stdlib::bn254<UltraCircuitBuilder>::ScalarField;

    std::vector<FF> public_inputs;
    public_inputs.reserve(builder.num_public_inputs());
    for (size_t i = 0; i < builder.num_public_inputs(); i++) {
        public_inputs.emplace_back(&builder, builder.get_variable(builder.public_inputs()[i]));
    }

    GoblinFlushIO io;
    io.reconstruct_from_public(public_inputs);

    // Compare IPA claim values (convert circuit bigfield values to native for comparison)
    auto native_claim = eccvm_result.ipa_claim;

    EXPECT_EQ(fq(io.ipa_claim.opening_pair.challenge.get_value()), native_claim.opening_pair.challenge);
    EXPECT_EQ(fq(io.ipa_claim.opening_pair.evaluation.get_value()), native_claim.opening_pair.evaluation);
    EXPECT_EQ(io.ipa_claim.commitment.get_value(), native_claim.commitment);
}

} // namespace
} // namespace bb
