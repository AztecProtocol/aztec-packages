#include "barretenberg/dsl/acir_format/avm2_recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/gate_count_constants.hpp"
#include "barretenberg/dsl/acir_format/test_class.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/constraining/prover.hpp"
#include "barretenberg/vm2/constraining/recursion/recursive_flavor.hpp"
#include "barretenberg/vm2/constraining/recursion/recursive_verifier.hpp"
#include "barretenberg/vm2/constraining/recursion/two_layer_avm_recursive_verifier.hpp"
#include "barretenberg/vm2/constraining/verifier.hpp"
#include "barretenberg/vm2/proving_helper.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"

#include <gtest/gtest.h>
#include <memory>
#include <vector>

using namespace acir_format;
using namespace bb;
using namespace bb::avm2;

class AvmRecursionConstraintTestingFunctions {
  public:
    using AcirConstraint = RecursionConstraint;
    using Builder = UltraCircuitBuilder;

    using AvmProver = bb::avm2::AvmProvingHelper;
    using FF = Builder::FF;

    class InvalidWitness {
      public:
        enum class Target : uint8_t { None, PublicInputs, Proof };
        static std::vector<Target> get_all()
        {
            std::vector<Target> targets = { Target::None, Target::PublicInputs, Target::Proof };
            return targets;
        };
        static std::vector<std::string> get_labels()
        {
            std::vector<std::string> labels = { "None", "PublicInputs", "Proof" };
            return labels;
        };
    };

    static std::pair<AvmProver::Proof, std::vector<FF>> create_avm_data()
    {
        auto [trace, public_inputs] = avm2::testing::get_minimal_trace_with_pi();

        AvmProver prover;
        auto proof = prover.prove(std::move(trace));
        proof.resize(AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED, FF::zero()); // Pad proof

        const bool verified = prover.verify(proof, public_inputs);
        EXPECT_TRUE(verified) << "native proof verification failed";

        auto public_inputs_flat = PublicInputs::columns_to_flat(public_inputs.to_columns());
        public_inputs_flat.resize(AVM_PUBLIC_INPUTS_COLUMNS_COMBINED_LENGTH, FF::zero()); // Pad public inputs

        return { proof, public_inputs_flat };
    }

    static ProgramMetadata generate_metadata() { return ProgramMetadata{ .has_ipa_claim = true }; }

    static void generate_constraints(AcirConstraint& avm_recursion_constraint, WitnessVector& witness_values)
    {
        const auto [proof, public_inputs_flat] = create_avm_data();
        avm_recursion_constraint = RecursionConstraint{
            .key = {}, // Unused, the key is hard-coded in the circuit
            .proof = add_to_witness_and_track_indices(witness_values, proof),
            .public_inputs = add_to_witness_and_track_indices(witness_values, public_inputs_flat),
            .key_hash = IS_CONSTANT, // Unused, the key hash is hard-coded in the circuit
            .proof_type = AVM,
            .predicate = WitnessOrConstant<typename Builder::FF>::from_constant(1),
        };
    }

    static std::pair<AcirConstraint, WitnessVector> invalidate_witness(
        AcirConstraint constraint, WitnessVector witness_values, const InvalidWitness::Target& invalid_witness_target)
    {
        switch (invalid_witness_target) {
        case InvalidWitness::Target::None:
            break;
        case InvalidWitness::Target::PublicInputs: {
            // Tamper with the public inputs
            witness_values[constraint.public_inputs[0]] += FF::one();
            break;
        }
        case InvalidWitness::Target::Proof: {
            // Tamper with the proof by changing one of the univariate coefficients
            witness_values[constraint.proof[FrCodec::calc_num_fields<AvmFlavor::Commitment>() *
                                            AvmFlavor::NUM_WITNESS_ENTITIES]] += FF::one();
            break;
        }
        }

        return { constraint, witness_values };
    }
};

class AvmRecursionConstraintTest : public ::testing::Test, public TestClass<AvmRecursionConstraintTestingFunctions> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(AvmRecursionConstraintTest, GenerateVKFromConstraints)
{
    if (avm2::testing::skip_slow_tests()) {
        GTEST_SKIP() << "Skipping slow test";
    }
    // AVM constraints are always proven with UltraRollupFlavor (they are part of the base rollup circuit)
    size_t num_gates = test_vk_independence<UltraRollupFlavor>();

    EXPECT_EQ(num_gates, FINALIZED_GOBLIN_AVM_GATE_COUNT);
}

TEST_F(AvmRecursionConstraintTest, Tampering)
{
    if (avm2::testing::skip_slow_tests()) {
        GTEST_SKIP() << "Skipping slow test";
    }
    std::vector<std::string> _ = test_tampering();
}

// TODO(fcarreiro): Re-enable when the VK is fixed.
TEST_F(AvmRecursionConstraintTest, DISABLED_GateCountAndVKCheck)
{
    if (avm2::testing::skip_slow_tests()) {
        GTEST_SKIP() << "Skipping slow test";
    }
    using ProverInstance = ProverInstance_<UltraRollupFlavor>;

    AcirConstraint constraint;
    WitnessVector witness;
    Base::generate_constraints(constraint, witness);

    AcirFormat acir_format = constraint_to_acir_format(constraint, static_cast<uint32_t>(witness.size() - 1));

    AcirProgram program = { acir_format, {} };
    ProgramMetadata metadata = Base::generate_metadata();
    metadata.collect_gates_per_opcode = true;
    auto builder = create_circuit<Builder>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode.size(), 1);
    EXPECT_EQ(program.constraints.gates_per_opcode[0], GOBLIN_AVM_GATE_COUNT);

    auto prover_instance = std::make_shared<ProverInstance>(builder);
    auto vk = std::make_shared<typename UltraRollupFlavor::VerificationKey>(prover_instance->get_precomputed());

    static constexpr FF EXPECTED_OUTER_VK_HASH =
        FF("0x195059523571dbadeae1b213250567e17b4994568b736b73a1aae2b0c65fd2cd");
    EXPECT_EQ(vk->hash(), EXPECTED_OUTER_VK_HASH)
        << "The VK hash of the outer circuit in the Goblinized AVM recursive verifier has changed. If this is "
           "expected, update the expected value in the test.";
}

class AvmRecursionInnerCircuitTests : public ::testing::Test {
  public:
    using Builder = UltraCircuitBuilder;
    using InnerProverOutput = TwoLayerAvmRecursiveVerifier::InnerProverOutput;
    using TwoLayerAvmRecursiveVerifierOutput = TwoLayerAvmRecursiveVerifier::TwoLayerAvmRecursiveVerifierOutput;
    using FF = Builder::FF;

    static constexpr FF EXPECTED_INNER_VK_HASH =
        FF("0x2be1149e37f087a8420d61586aed0d7db942f04937f2d3fa01bdf7f4cc62fb3c");
    static constexpr size_t EXPECT_GATE_COUNT = 1203700;

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    static std::tuple<stdlib::Proof<Builder>, std::vector<std::vector<field_t<Builder>>>, InnerProverOutput>
    create_and_prove_inner_circuit(Builder& outer_builder,
                                   const HonkProof& proof,
                                   const std::vector<FF>& public_inputs_flat)
    {
        std::vector<field_t<Builder>> stdlib_public_inputs_flat;
        stdlib_public_inputs_flat.reserve(AVM_PUBLIC_INPUTS_COLUMNS_COMBINED_LENGTH);
        for (const auto public_input : public_inputs_flat) {
            stdlib_public_inputs_flat.emplace_back(field_t<Builder>::from_witness(&outer_builder, public_input));
        }
        stdlib::Proof<Builder> stdlib_proof;
        stdlib_proof.reserve(AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED);
        for (const auto proof_element : proof) {
            stdlib_proof.emplace_back(field_t<Builder>::from_witness(&outer_builder, proof_element));
        }

        std::vector<std::vector<field_t<Builder>>> public_inputs =
            PublicInputs::flat_to_columns<field_t<Builder>>(stdlib_public_inputs_flat);
        auto [mega_proof, goblin_proof, mega_vk] =
            TwoLayerAvmRecursiveVerifier::construct_and_prove_inner_recursive_verification_circuit(stdlib_proof,
                                                                                                   public_inputs);

        return { stdlib_proof, public_inputs, { mega_proof, goblin_proof, mega_vk } };
    }
};

// TODO(fcarreiro): Re-enable when the VK is fixed.
TEST_F(AvmRecursionInnerCircuitTests, DISABLED_GateCountAndVKCheck)
{
    using MegaAvmProverInstance = ProverInstance_<MegaAvmFlavor>;
    using MegaAvmVerificationKey = MegaAvmFlavor::VerificationKey;

    if (avm2::testing::skip_slow_tests()) {
        GTEST_SKIP() << "Skipping slow test";
    }
    const auto [proof, public_inputs_flat] = AvmRecursionConstraintTestingFunctions::create_avm_data();

    Builder outer_builder;

    std::vector<field_t<Builder>> stdlib_public_inputs_flat;
    stdlib_public_inputs_flat.reserve(AVM_PUBLIC_INPUTS_COLUMNS_COMBINED_LENGTH);
    for (const auto public_input : public_inputs_flat) {
        stdlib_public_inputs_flat.emplace_back(field_t<Builder>::from_witness(&outer_builder, public_input));
    }
    stdlib::Proof<Builder> stdlib_proof;
    stdlib_proof.reserve(AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED);
    for (const auto proof_element : proof) {
        stdlib_proof.emplace_back(field_t<Builder>::from_witness(&outer_builder, proof_element));
    }

    std::vector<std::vector<field_t<Builder>>> public_inputs =
        PublicInputs::flat_to_columns<field_t<Builder>>(stdlib_public_inputs_flat);

    MegaCircuitBuilder inner_builder;
    TwoLayerAvmRecursiveVerifier::construct_inner_recursive_verification_circuit(
        inner_builder, stdlib_proof, public_inputs);

    auto mega_proving_key = std::make_shared<MegaAvmProverInstance>(inner_builder);
    auto mega_vk = std::make_shared<MegaAvmVerificationKey>(mega_proving_key->get_precomputed());

    EXPECT_EQ(mega_vk->hash(), EXPECTED_INNER_VK_HASH)
        << "The VK hash of the inner circuit in the Goblinized AVM recursive verifier has changed. If this is "
           "expected, update the expected value in the test.";
    EXPECT_EQ(inner_builder.num_gates(), EXPECT_GATE_COUNT);
}

/**
 * @brief Test that if the data passed to the outer circuit construction is not valid (mega proof/goblin proof are
 * invalid, vk is different from the one of the inner circuit), then the outer circuit fails.
 *
 */
TEST_F(AvmRecursionInnerCircuitTests, Tampering)
{
    if (avm2::testing::skip_slow_tests()) {
        GTEST_SKIP() << "Skipping slow test";
    }
    const auto [proof, public_inputs_flat] = AvmRecursionConstraintTestingFunctions::create_avm_data();

    {
        Builder outer_builder;
        auto [stdlib_proof, public_inputs, inner_prover_output] =
            create_and_prove_inner_circuit(outer_builder, proof, public_inputs_flat);

        auto mega_proof_tampered = inner_prover_output.mega_proof;
        mega_proof_tampered[0] += FF::one(); // Tamper with the first public input

        TwoLayerAvmRecursiveVerifier goblin_avm_verifier(outer_builder);
        TwoLayerAvmRecursiveVerifierOutput output = goblin_avm_verifier.construct_outer_recursive_verification_circuit(
            stdlib_proof,
            public_inputs,
            { mega_proof_tampered, inner_prover_output.goblin_proof, inner_prover_output.mega_vk });

        EXPECT_TRUE(outer_builder.failed());
    }

    {
        Builder outer_builder;
        auto [stdlib_proof, public_inputs, inner_prover_output] =
            create_and_prove_inner_circuit(outer_builder, proof, public_inputs_flat);

        // Tamper with one of the ECCVM op evaluations. The `op` evaluation is located 3 evaluations before the end of
        // pre-IPA proof (followed by x_lo_y_hi, x_hi_z_1, y_lo_z_2 evaluations). See also
        // GoblinAvmRecursiveVerifierTests::tamper_with_eccvm_op_eval for reference
        static constexpr size_t evals_after_op = 3; // x_lo_y_hi, x_hi_z_1, y_lo_z_2
        const size_t op_eval_idx = inner_prover_output.goblin_proof.eccvm_proof.size() - evals_after_op;

        auto goblin_proof_tampered = inner_prover_output.goblin_proof;
        goblin_proof_tampered.eccvm_proof[op_eval_idx] += FF(1);

        TwoLayerAvmRecursiveVerifier goblin_avm_verifier(outer_builder);
        TwoLayerAvmRecursiveVerifierOutput output = goblin_avm_verifier.construct_outer_recursive_verification_circuit(
            stdlib_proof,
            public_inputs,
            { inner_prover_output.mega_proof, goblin_proof_tampered, inner_prover_output.mega_vk });

        EXPECT_TRUE(outer_builder.failed());
    }

    {
        Builder outer_builder;
        auto [stdlib_proof, public_inputs, inner_prover_output] =
            create_and_prove_inner_circuit(outer_builder, proof, public_inputs_flat);

        auto mega_vk_tampered = inner_prover_output.mega_vk;
        mega_vk_tampered->q_m = mega_vk_tampered->q_m + MegaAvmFlavor::Commitment::one(); // Tamper with q_m commitment

        TwoLayerAvmRecursiveVerifier goblin_avm_verifier(outer_builder);
        TwoLayerAvmRecursiveVerifierOutput output = goblin_avm_verifier.construct_outer_recursive_verification_circuit(
            stdlib_proof,
            public_inputs,
            { inner_prover_output.mega_proof, inner_prover_output.goblin_proof, mega_vk_tampered });

        EXPECT_TRUE(outer_builder.failed());
    }
}
