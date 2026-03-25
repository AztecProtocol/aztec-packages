#include "barretenberg/goblin/goblin_flush_circuit.hpp"

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

namespace bb {
namespace {

class GoblinFlushCircuitTests : public testing::Test {
  public:
    using MergeCommitments = MergeVerifier::InputCommitments;

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    struct ProverOutput {
        GoblinProof proof;
        MergeCommitments merge_commitments;
    };

    static ProverOutput create_goblin_prover_output(const size_t num_circuits = 5)
    {
        Goblin goblin;
        GoblinMockCircuits::construct_and_merge_mock_circuits(goblin, num_circuits);
        auto goblin_proof = goblin.prove();

        // Extract merge commitments from op_queue
        MergeCommitments merge_commitments;
        auto t_current = goblin.op_queue->construct_current_ultra_ops_subtable_columns();
        auto T_prev = goblin.op_queue->construct_previous_ultra_ops_table_columns();
        CommitmentKey<curve::BN254> pcs_commitment_key(goblin.op_queue->get_ultra_ops_table_num_rows());
        for (size_t idx = 0; idx < MegaFlavor::NUM_WIRES; idx++) {
            merge_commitments.t_commitments[idx] = pcs_commitment_key.commit(t_current[idx]);
            merge_commitments.T_prev_commitments[idx] = pcs_commitment_key.commit(T_prev[idx]);
        }

        return { std::move(goblin_proof), merge_commitments };
    }
};

/**
 * @brief Build Circuit C and check that the circuit is satisfied
 */
TEST_F(GoblinFlushCircuitTests, CircuitCorrectness)
{
    auto [proof, merge_commitments] = create_goblin_prover_output();

    auto builder = build_goblin_flush_circuit(proof, merge_commitments);

    EXPECT_FALSE(builder.failed()) << builder.err();
    EXPECT_TRUE(CircuitChecker::check(builder));
}

/**
 * @brief Build Circuit C, prove it with Ultra Honk, and verify the proof
 */
TEST_F(GoblinFlushCircuitTests, ProveAndVerify)
{
    auto [proof, merge_commitments] = create_goblin_prover_output();

    auto builder = build_goblin_flush_circuit(proof, merge_commitments);

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
    auto [proof, merge_commitments] = create_goblin_prover_output();

    // Get the IPA claim from native Goblin verification
    auto native_transcript = std::make_shared<NativeTranscript>();
    GoblinVerifier native_verifier(native_transcript, proof, merge_commitments, MergeSettings::APPEND);
    auto native_result = native_verifier.reduce_to_pairing_check_and_ipa_opening();
    ASSERT_TRUE(native_result.all_checks_passed);

    // Build Circuit C and extract the IPA claim from public inputs
    auto builder = build_goblin_flush_circuit(proof, merge_commitments);
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
    auto native_claim = native_result.ipa_claim;

    EXPECT_EQ(fq(io.ipa_claim.opening_pair.challenge.get_value()), native_claim.opening_pair.challenge);
    EXPECT_EQ(fq(io.ipa_claim.opening_pair.evaluation.get_value()), native_claim.opening_pair.evaluation);
    EXPECT_EQ(io.ipa_claim.commitment.get_value(), native_claim.commitment);
}

} // namespace
} // namespace bb
