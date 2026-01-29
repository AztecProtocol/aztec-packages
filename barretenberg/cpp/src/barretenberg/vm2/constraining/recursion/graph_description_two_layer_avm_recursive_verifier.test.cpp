#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/goblin_avm/goblin_avm_verifier.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_verification_keys_comparator.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "barretenberg/vm2/constraining/recursion/two_layer_avm_recursive_verifier.hpp"
#include "barretenberg/vm2/proving_helper.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"

namespace bb::stdlib::recursion::honk {

using namespace bb::avm2;

class BoomerangTwoLayerAvmRecursiveVerifierTests : public ::testing::Test {
  public:
    using Builder = UltraCircuitBuilder;

    using AvmProver = bb::avm2::AvmProvingHelper;
    using FF = Builder::FF;

    using ProverInstance = ProverInstance_<UltraFlavor>;
    using IO = bb::stdlib::recursion::honk::RollupIO;

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    static std::pair<AvmProver::Proof, std::vector<FF>> create_avm_data()
    {
        auto [trace, public_inputs] = bb::avm2::testing::get_minimal_trace_with_pi();

        AvmProver prover;
        auto proof = prover.prove(std::move(trace));
        proof.resize(AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED, FF::zero()); // Pad proof

        const bool verified = prover.verify(proof, public_inputs);
        EXPECT_TRUE(verified) << "native proof verification failed";

        auto public_inputs_flat = PublicInputs::columns_to_flat(public_inputs.to_columns());
        public_inputs_flat.resize(AVM_PUBLIC_INPUTS_COLUMNS_COMBINED_LENGTH, FF::zero()); // Pad public inputs

        return { proof, public_inputs_flat };
    }
};

/**
 * @brief Construct and check a goblin recursive verification circuit
 *
 */
TEST_F(BoomerangTwoLayerAvmRecursiveVerifierTests, graph_description_basic)
{
    if (avm2::testing::skip_slow_tests()) {
        GTEST_SKIP() << "Skipping slow test";
    }

    auto [proof, public_inputs_flat] = create_avm_data();

    Builder builder;

    std::vector<field_t<Builder>> stdlib_public_inputs_flat;
    stdlib_public_inputs_flat.reserve(AVM_PUBLIC_INPUTS_COLUMNS_COMBINED_LENGTH);
    for (const auto public_input : public_inputs_flat) {
        stdlib_public_inputs_flat.emplace_back(field_t<Builder>::from_witness(&builder, public_input));
        // We need to fix this witness because it is only used in Poseidon, and as part of Poseidon it only appears in
        // one gate
        stdlib_public_inputs_flat.back().fix_witness();
    }
    stdlib::Proof<Builder> stdlib_proof;
    stdlib_proof.reserve(AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED);
    for (const auto proof_element : proof) {
        stdlib_proof.emplace_back(field_t<Builder>::from_witness(&builder, proof_element));
        // We need to fix this witness because it is only used in Poseidon, and as part of Poseidon it only appears in
        // one gate
        stdlib_proof.back().fix_witness();
    }

    std::vector<std::vector<field_t<Builder>>> public_inputs =
        PublicInputs::flat_to_columns<field_t<Builder>>(stdlib_public_inputs_flat);

    avm2::TwoLayerAvmRecursiveVerifier goblin_avm_verifier(builder);
    auto output = goblin_avm_verifier.verify_proof(stdlib_proof, public_inputs);

    IO inputs;
    inputs.pairing_inputs = output.points_accumulator;
    inputs.ipa_claim = output.ipa_claim;
    inputs.set_public();

    builder.ipa_proof = output.ipa_proof.get_value();

    // Construct and verify a proof for the Goblin Recursive Verifier circuit
    {
        auto prover_instance = std::make_shared<ProverInstance>(builder);
        auto verification_key =
            std::make_shared<typename UltraFlavor::VerificationKey>(prover_instance->get_precomputed());
        auto vk_and_hash = std::make_shared<typename UltraFlavor::VKAndHash>(verification_key);
        UltraProver_<UltraFlavor> prover(prover_instance, verification_key);
        UltraRollupVerifier verifier(vk_and_hash);
        auto proof = prover.construct_proof();
        bool verified = verifier.verify_proof(proof).result;

        ASSERT_TRUE(verified);
    }

    // The pairing points are public outputs from the recursive verifier that will be verified externally via a pairing
    // check. While they are computed within the circuit (via batch_mul for P0 and negation for P1), their output
    // coordinates may not appear in multiple constraint gates. Calling fix_witness() adds explicit constraints on these
    // values. Without these constraints, the StaticAnalyzer detects 20 variables (the coordinate limbs) that appear in
    // only one gate. This ensures the pairing point coordinates are properly constrained within the circuit itself,
    // rather than relying solely on them being public outputs.
    output.points_accumulator.P0.fix_witness();
    output.points_accumulator.P1.fix_witness();
    info("Recursive Verifier: num gates = ", builder.num_gates());
    auto graph = cdg::StaticAnalyzer(builder, false);
    auto variables_in_one_gate = graph.get_variables_in_one_gate();
    // The variable in one gate is the last Shplonk power we compute. It is computed even though it is not used because
    // of how the PCS is structured (more precisely, because of the interaction between gemini and interleaving).
    EXPECT_EQ(variables_in_one_gate.size(), 1);
}

} // namespace bb::stdlib::recursion::honk
