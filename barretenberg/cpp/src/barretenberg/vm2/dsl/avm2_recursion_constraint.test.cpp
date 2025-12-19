#include "barretenberg/dsl/acir_format/avm2_recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_format_mocks.hpp"
#include "barretenberg/dsl/acir_format/gate_count_constants.hpp"
#include "barretenberg/dsl/acir_format/proof_surgeon.hpp"
#include "barretenberg/dsl/acir_format/test_class.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/constraining/prover.hpp"
#include "barretenberg/vm2/constraining/recursion/goblin_avm_recursive_verifier.hpp"
#include "barretenberg/vm2/constraining/recursion/recursive_flavor.hpp"
#include "barretenberg/vm2/constraining/recursion/recursive_verifier.hpp"
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
        auto [proof, vk_data] = prover.prove(std::move(trace));
        proof.resize(AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED, FF::zero()); // Pad proof length

        const bool verified = prover.verify(proof, public_inputs, vk_data);
        EXPECT_TRUE(verified) << "native proof verification failed";

        const auto public_inputs_flat = PublicInputs::columns_to_flat(public_inputs.to_columns());

        // TO BE REMOVED ONCE PUBLIC INPUTS ARE VALIDATED (DAVID'S PR!)
        // TODO(#14234)[Unconditional PIs validation]: Remove next line
        proof.insert(proof.begin(), 0);

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

    static void invalidate_witness(AcirConstraint& constraint,
                                   WitnessVector& witness_values,
                                   const InvalidWitness::Target& invalid_witness_target)
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
            // REMOVE +1 AFTER DAVID'S PR IS MERGED
            // Tamper with the inputs by changing on of the univariate coefficients
            witness_values[constraint.proof[1 + AvmFlavor::NUM_WITNESS_ENTITIES]] += FF::one();
            break;
        }
        }
    }
};

class AvmRecursionConstraintTest : public ::testing::Test, public TestClass<AvmRecursionConstraintTestingFunctions> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(AvmRecursionConstraintTest, GenerateVKFromConstraints)
{
    // AVM constraints are always proven with UltraRollupFlavor (they are part of the base rollup circuit)
    size_t num_gates = test_vk_independence<UltraRollupFlavor>();

    EXPECT_EQ(num_gates, FINALIZED_GOBLIN_AVM_GATE_COUNT);
}

TEST_F(AvmRecursionConstraintTest, Tampering)
{
    std::vector<std::string> _ = test_tampering();
}

TEST_F(AvmRecursionConstraintTest, GateCountAndOuterVKCheck)
{
    using ProverInstance = ProverInstance_<UltraRollupFlavor>;

    static constexpr FF EXPECTED_OUTER_VK_HASH =
        FF("0x09c2c15426bce647913e27c928c81726da8a90175739a6a8d1ef6b90bc015a6d");
    auto [constraint, witness] = generate_constraints();

    AcirFormat acir_format = constraint_to_acir_format(constraint, static_cast<uint32_t>(witness.size() - 1));

    AcirProgram program = { acir_format, {} };
    ProgramMetadata metadata = { .has_ipa_claim = true }; // Base::generate_metadata();
    metadata.collect_gates_per_opcode = true;
    auto builder = create_circuit<Builder>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode.size(), 1);
    EXPECT_EQ(program.constraints.gates_per_opcode[0], GOBLIN_AVM_GATE_COUNT);

    auto prover_instance = std::make_shared<ProverInstance>(builder);
    auto vk = std::make_shared<typename UltraRollupFlavor::VerificationKey>(prover_instance->get_precomputed());
    EXPECT_EQ(vk->hash(), EXPECTED_OUTER_VK_HASH);
}

TEST_F(AvmRecursionConstraintTest, InnerVKCheck)
{
    static constexpr FF EXPECTED_INNER_VK_HASH =
        FF("0x1f197ad657b0e30220d11af1c6ef1c5c657effd8a7af00098218f143ad3f5a12");
    const auto [proof, public_inputs_flat] =
        AvmRecursionConstraintTestingFunctions::create_avm_data(); // Base::create_avm_data();

    Builder inner_builder;
    std::vector<field_t<Builder>> stdlib_public_inputs_flat;
    stdlib_public_inputs_flat.reserve(AVM_PUBLIC_INPUTS_COLUMNS_COMBINED_LENGTH);
    for (size_t idx = 0; idx < AVM_PUBLIC_INPUTS_COLUMNS_COMBINED_LENGTH; idx++) {
        stdlib_public_inputs_flat.emplace_back(field_t<Builder>::from_witness(
            &inner_builder, idx < public_inputs_flat.size() ? public_inputs_flat[idx] : FF::random_element()));
    }
    stdlib::Proof<Builder> stdlib_proof;
    stdlib_proof.reserve(AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED);
    for (const auto proof_element : proof) {
        stdlib_proof.emplace_back(field_t<Builder>::from_witness(&inner_builder, proof_element));
    }

    AvmGoblinRecursiveVerifier goblin_avm_verifier(inner_builder);
    auto [_mega_proof, _goblin_proof, mega_vk, _goblin_vk] =
        goblin_avm_verifier.construct_and_prove_inner_recursive_verification_circuit(
            stdlib_proof, PublicInputs::flat_to_columns<field_t<Builder>>(stdlib_public_inputs_flat));

    EXPECT_EQ(mega_vk->hash(), EXPECTED_INNER_VK_HASH);
}
