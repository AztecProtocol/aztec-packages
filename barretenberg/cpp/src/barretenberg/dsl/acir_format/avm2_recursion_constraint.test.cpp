#ifndef DISABLE_AZTEC_VM

#include "barretenberg/dsl/acir_format/avm2_recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_format_mocks.hpp"
#include "barretenberg/dsl/acir_format/proof_surgeon.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/ultra_honk/decider_keys.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "barretenberg/vm/aztec_constants.hpp"
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
    std::vector<std::vector<FF>> public_inputs_cols;
};

class AcirAvm2RecursionConstraint : public ::testing::Test {
  public:
    using InnerProver = bb::avm2::AvmProvingHelper;
    using InnerVerifier = bb::avm2::AvmVerifier;

    using OuterProver = UltraProver;
    using OuterVerifier = UltraVerifier;
    using OuterDeciderProvingKey = DeciderProvingKey_<UltraFlavor>;

    using DeciderProvingKey = DeciderProvingKey_<UltraFlavor>;
    using OuterVerificationKey = UltraFlavor::VerificationKey;
    using OuterBuilder = UltraCircuitBuilder;

    static void SetUpTestSuite()
    {
        bb::srs::init_crs_factory(bb::srs::get_ignition_crs_path());
        bb::srs::init_grumpkin_crs_factory(bb::srs::get_grumpkin_crs_path());
    }

    static InnerCircuitData create_inner_circuit_data()
    {
        auto [trace, public_inputs] = avm2::testing::get_minimal_trace_with_pi();

        InnerProver prover;
        const auto [proof, vk_data] = prover.prove(std::move(trace));
        const auto verification_key = prover.create_verification_key(vk_data);

        const auto public_inputs_cols = public_inputs.to_columns();
        const bool verified = prover.verify(proof, public_inputs, vk_data);
        EXPECT_TRUE(verified) << "native proof verification failed";

        return { proof, verification_key, public_inputs_cols };
    }

    /**
     * @brief Create a circuit that recursively verifies one or more inner avm2 circuits
     */
    static OuterBuilder create_outer_circuit(const std::vector<InnerCircuitData>& inner_circuits)
    {
        std::vector<RecursionConstraint> avm_recursion_constraints;

        SlabVector<fr> witness;

        for (const auto& inner_circuit_data : inner_circuits) {
            std::vector<fr> key_witnesses = inner_circuit_data.verification_key->to_field_elements();
            std::vector<fr> proof_witnesses = inner_circuit_data.proof;

            // We assume a single public input column for now (containing the flag reverted)
            std::vector<fr> public_inputs_witnesses = inner_circuit_data.public_inputs_cols[0];

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

        AcirFormat constraint_system;
        constraint_system.varnum = static_cast<uint32_t>(witness.size());
        constraint_system.num_acir_opcodes = static_cast<uint32_t>(avm_recursion_constraints.size());
        constraint_system.avm_recursion_constraints = avm_recursion_constraints;
        constraint_system.original_opcode_indices = create_empty_original_opcode_indices();

        mock_opcode_indices(constraint_system);
        auto outer_circuit =
            create_circuit(constraint_system, /*recursive*/ false, /*size_hint*/ 0, witness, /*honk_recursion=*/1);
        return outer_circuit;
    }
};

TEST_F(AcirAvm2RecursionConstraint, TestBasicSingleAvm2RecursionConstraint)
{
    std::vector<InnerCircuitData> layer_1_circuits;
    layer_1_circuits.push_back(create_inner_circuit_data());
    auto layer_2_circuit = create_outer_circuit(layer_1_circuits);

    info("circuit gates = ", layer_2_circuit.get_estimated_num_finalized_gates());

    auto proving_key = std::make_shared<DeciderProvingKey>(layer_2_circuit);
    OuterProver prover(proving_key);
    info("prover gates = ", proving_key->proving_key.circuit_size);
    auto proof = prover.construct_proof();
    auto verification_key = std::make_shared<OuterVerificationKey>(proving_key->proving_key);
    OuterVerifier verifier(verification_key);
    EXPECT_EQ(verifier.verify_proof(proof), true);
}

#endif // DISABLE_AZTEC_VM