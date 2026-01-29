#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"

#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/goblin_avm/goblin_avm.hpp"
#include "barretenberg/goblin_avm/goblin_avm_verifier.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_verification_keys_comparator.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

namespace bb::stdlib::recursion::honk {
class BoomerangGoblinAvmRecursiveVerifierTests : public testing::Test {
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

    struct ProverOutput {
        GoblinAvmProof proof;
        TableCommitments table_commitments;
        RecursiveTableCommitments recursive_table_commitments;
    };

    /**
     * @brief Create a goblin proof needed by the goblin recursive verifier
     *
     * @return ProverOutput
     */
    static ProverOutput create_goblin_avm_prover_output(OuterBuilder* outer_builder)
    {
        auto op_queue = std::make_shared<ECCOpQueue>();
        InnerBuilder inner_builder(op_queue);
        GoblinAvm goblin(inner_builder);
        MockCircuits::construct_arithmetic_circuit(inner_builder);

        // Merge the ecc ops from the newly constructed circuit
        auto goblin_proof = goblin.prove();

        // Subtable values and commitments - needed for (Recursive)MergeVerifier
        TableCommitments table_commitments;
        auto ultra_ops_table_columns = goblin.op_queue->construct_ultra_ops_table_columns();
        CommitmentKey<curve::BN254> pcs_commitment_key(goblin.op_queue->get_ultra_ops_table_num_rows());
        for (size_t idx = 0; idx < MegaFlavor::NUM_WIRES; idx++) {
            table_commitments[idx] = pcs_commitment_key.commit(ultra_ops_table_columns[idx]);
        }

        RecursiveTableCommitments recursive_table_commitments;
        for (size_t idx = 0; idx < MegaFlavor::NUM_WIRES; idx++) {
            recursive_table_commitments[idx] = RecursiveCommitment::from_witness(outer_builder, table_commitments[idx]);
            // Removing the free witness tag, since the merge commitments in the full scheme are supposed to
            // be fiat-shamirred earlier
            recursive_table_commitments[idx].unset_free_witness_tag();
        }

        // Output is a goblin proof plus merge commitments
        return { goblin_proof, table_commitments, recursive_table_commitments };
    }
};

/**
 * @brief Construct and check a goblin recursive verification circuit
 *
 */
TEST_F(BoomerangGoblinAvmRecursiveVerifierTests, graph_description_basic)
{
    OuterBuilder builder;

    auto [proof, table_commitments, recursive_table_commitments] = create_goblin_avm_prover_output(&builder);

    auto transcript = std::make_shared<Transcript>();
    GoblinAvmStdlibProof stdlib_proof(builder, proof);
    GoblinAvmRecursiveVerifier verifier{ transcript, stdlib_proof, recursive_table_commitments };
    auto output = verifier.reduce_to_pairing_check_and_ipa_opening();

    stdlib::recursion::honk::RollupIO inputs;
    inputs.pairing_inputs = output.translator_pairing_points;
    inputs.ipa_claim = output.ipa_claim;
    inputs.set_public();

    builder.ipa_proof = output.ipa_proof.get_value();

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
    // Use the already aggregated pairing points (merge + translator)
    auto translator_pairing_points = output.translator_pairing_points;

    // The pairing points are public outputs from the recursive verifier that will be verified externally via a pairing
    // check. While they are computed within the circuit (via batch_mul for P0 and negation for P1), their output
    // coordinates may not appear in multiple constraint gates. Calling fix_witness() adds explicit constraints on these
    // values. Without these constraints, the StaticAnalyzer detects 20 variables (the coordinate limbs) that appear in
    // only one gate. This ensures the pairing point coordinates are properly constrained within the circuit itself,
    // rather than relying solely on them being public outputs.
    translator_pairing_points.P0.fix_witness();
    translator_pairing_points.P1.fix_witness();
    info("Recursive Verifier: num gates = ", builder.num_gates());
    auto graph = cdg::StaticAnalyzer(builder, false);
    auto variables_in_one_gate = graph.get_variables_in_one_gate();
    // All pairing point coordinate limbs are now properly constrained. The self_reduce() call in bigfield::set_public()
    // ensures limbs are in canonical form, adding constraints that use each limb in multiple gates.
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

} // namespace bb::stdlib::recursion::honk
