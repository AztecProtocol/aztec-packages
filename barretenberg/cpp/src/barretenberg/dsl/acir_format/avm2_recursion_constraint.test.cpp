#include "barretenberg/srs/global_crs.hpp"
#ifndef DISABLE_AZTEC_VM

#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_format_mocks.hpp"
#include "barretenberg/dsl/acir_format/avm2_recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/proof_surgeon.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/ultra_honk/decider_keys.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/constraining/prover.hpp"
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

struct InnerCircuitData {
    AvmProvingHelper::Proof proof;
    std::shared_ptr<AvmFlavor::VerificationKey> verification_key;
    std::vector<FF> public_inputs_flat;
};

class AcirAvm2RecursionConstraint : public ::testing::Test {
  public:
    using InnerProver = bb::avm2::AvmProvingHelper;
    using InnerVerifier = bb::avm2::AvmVerifier;

    using OuterFlavor = UltraRollupFlavor;
    using OuterProver = UltraProver_<OuterFlavor>;
    using OuterVerifier = UltraVerifier_<OuterFlavor>;
    using OuterDeciderProvingKey = DeciderProvingKey_<OuterFlavor>;

    using OuterVerificationKey = OuterFlavor::VerificationKey;
    using OuterBuilder = UltraCircuitBuilder;

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    static InnerCircuitData create_inner_circuit_data()
    {
        auto [trace, public_inputs] = avm2::testing::get_minimal_trace_with_pi();

        InnerProver prover;
        auto [proof, vk_data] = prover.prove(std::move(trace));
        const auto verification_key = InnerProver::create_verification_key(vk_data);

        const bool verified = prover.verify(proof, public_inputs, vk_data);
        EXPECT_TRUE(verified) << "native proof verification failed";

        const auto public_inputs_flat = PublicInputs::columns_to_flat(public_inputs.to_columns());

        // TODO(#14234)[Unconditional PIs validation]: Remove next line
        proof.insert(proof.begin(), 0);
        return { proof, verification_key, public_inputs_flat };
    }

    /**
     * @brief Create a circuit that recursively verifies one or more inner avm2 circuits
     */
    static AcirProgram construct_avm_verifier_program(const std::vector<InnerCircuitData>& inner_circuits)
    {
        std::vector<RecursionConstraint> avm_recursion_constraints;

        AcirProgram program;

        SlabVector<fr>& witness = program.witness;

        for (const auto& inner_circuit_data : inner_circuits) {
            const std::vector<fr> key_witnesses = inner_circuit_data.verification_key->to_field_elements();
            const std::vector<fr> proof_witnesses = inner_circuit_data.proof;
            const std::vector<fr> public_inputs_witnesses = inner_circuit_data.public_inputs_flat;

            // Helper to append some values to the witness vector and return their corresponding indices
            auto add_to_witness_and_track_indices =
                [&witness](const std::vector<bb::fr>& input) -> std::vector<uint32_t> {
                std::vector<uint32_t> indices;
                indices.reserve(input.size());
                auto witness_idx = static_cast<uint32_t>(witness.size());
                for (const auto& value : input) {
                    witness.push_back(value);
                    indices.push_back(witness_idx++);
                }
                return indices;
            };

            RecursionConstraint avm_recursion_constraint{
                .key = add_to_witness_and_track_indices(key_witnesses),
                .proof = add_to_witness_and_track_indices(proof_witnesses),
                .public_inputs = add_to_witness_and_track_indices(public_inputs_witnesses),
                .key_hash = 0, // not used
                .proof_type = AVM,
            };
            avm_recursion_constraints.push_back(avm_recursion_constraint);
        }

        std::vector<size_t> avm_recursion_opcode_indices(avm_recursion_constraints.size());
        std::iota(avm_recursion_opcode_indices.begin(), avm_recursion_opcode_indices.end(), 0);

        AcirFormat& constraint_system = program.constraints;
        constraint_system.varnum = static_cast<uint32_t>(witness.size());
        constraint_system.num_acir_opcodes = static_cast<uint32_t>(avm_recursion_constraints.size());
        constraint_system.avm_recursion_constraints = avm_recursion_constraints;
        constraint_system.original_opcode_indices = create_empty_original_opcode_indices();

        mock_opcode_indices(constraint_system);

        return program;
    }
};

TEST_F(AcirAvm2RecursionConstraint, TestBasicSingleAvm2RecursionConstraint)
{
    // Skip this test since it is redundant with the one below (which also does proving and verification for the AVM
    // recursive verifier circuit) and both are expensive to run. It would be nice to reinstate this as a standalone in
    // the future if possible.
    GTEST_SKIP();

    std::vector<InnerCircuitData> layer_1_circuits;
    layer_1_circuits.push_back(create_inner_circuit_data());
    AcirProgram avm_verifier_program = construct_avm_verifier_program(layer_1_circuits);
    const ProgramMetadata metadata{ .honk_recursion = 1 };
    auto layer_2_circuit = create_circuit(avm_verifier_program, metadata);

    info("circuit gates = ", layer_2_circuit.get_estimated_num_finalized_gates());

    auto proving_key = std::make_shared<OuterDeciderProvingKey>(layer_2_circuit);
    OuterProver prover(proving_key);
    info("prover gates = ", proving_key->proving_key.circuit_size);
    auto proof = prover.construct_proof();
    auto verification_key = std::make_shared<OuterVerificationKey>(proving_key->proving_key);
    auto ipa_verification_key = std::make_shared<VerifierCommitmentKey<curve::Grumpkin>>(1 << CONST_ECCVM_LOG_N);
    OuterVerifier verifier(verification_key, ipa_verification_key);
    EXPECT_EQ(verifier.verify_proof(proof, proving_key->proving_key.ipa_proof), true);
}

/**
 * @brief Ensure that an AVM2 recursive verifier circuit VK can be constructed from a corresponding acir program without
 * a witness.
 * @details This is the logic required, for example, to write the VK of the public base circuit without knowledge of a
 * particular satisfying witness.
 *
 */
TEST_F(AcirAvm2RecursionConstraint, TestGenerateVKFromConstraintsWithoutWitness)
{
    // Generate AVM proof, verification key and public inputs
    InnerCircuitData avm_prover_output = create_inner_circuit_data();

    // First, construct an AVM2 recursive verifier circuit VK by providing a valid program witness
    std::shared_ptr<OuterVerificationKey> expected_vk;
    {
        AcirProgram avm_verifier_program = construct_avm_verifier_program({ avm_prover_output });
        const ProgramMetadata metadata{ .honk_recursion = 2 };
        auto layer_2_circuit = create_circuit(avm_verifier_program, metadata);

        info("circuit gates = ", layer_2_circuit.get_estimated_num_finalized_gates());

        auto proving_key = std::make_shared<OuterDeciderProvingKey>(layer_2_circuit);
        OuterProver prover(proving_key);
        info("prover gates = ", proving_key->proving_key.circuit_size);
        expected_vk = std::make_shared<OuterVerificationKey>(prover.proving_key->proving_key);

        // Construct and verify a proof of the outer AVM verifier circuits
        auto proof = prover.construct_proof();
        auto ipa_verification_key = std::make_shared<VerifierCommitmentKey<curve::Grumpkin>>(1 << CONST_ECCVM_LOG_N);
        OuterVerifier verifier(expected_vk, ipa_verification_key);
        EXPECT_TRUE(verifier.verify_proof(proof, proving_key->proving_key.ipa_proof));
    }

    // Now, construct the AVM2 recursive verifier circuit VK by providing the program without a witness
    std::shared_ptr<OuterVerificationKey> actual_vk;
    {
        AcirProgram avm_verifier_program = construct_avm_verifier_program({ avm_prover_output });

        // Clear the program witness then construct the bberg circuit as normal
        avm_verifier_program.witness.clear();
        const ProgramMetadata metadata{ .honk_recursion = 2 };
        auto layer_2_circuit = create_circuit(avm_verifier_program, metadata);

        info("circuit gates = ", layer_2_circuit.get_estimated_num_finalized_gates());

        auto proving_key = std::make_shared<OuterDeciderProvingKey>(layer_2_circuit);
        OuterProver prover(proving_key);
        info("prover gates = ", proving_key->proving_key.circuit_size);
        actual_vk = std::make_shared<OuterVerificationKey>(prover.proving_key->proving_key);
    }

    // Compare the VK constructed via running the IVC with the one constructed via mocking
    EXPECT_EQ(*actual_vk.get(), *expected_vk.get());
}

#endif // DISABLE_AZTEC_VM
