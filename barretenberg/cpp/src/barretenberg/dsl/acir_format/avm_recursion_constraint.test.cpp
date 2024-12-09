#ifndef DISABLE_AZTEC_VM

#include "avm_recursion_constraint.hpp"
#include "acir_format.hpp"
#include "acir_format_mocks.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/ultra_honk/decider_keys.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "barretenberg/vm/avm/generated/circuit_builder.hpp"
#include "barretenberg/vm/avm/generated/composer.hpp"
#include "barretenberg/vm/avm/generated/flavor.hpp"
#include "barretenberg/vm/avm/generated/prover.hpp"
#include "barretenberg/vm/avm/generated/verifier.hpp"
#include "barretenberg/vm/avm/tests/helpers.test.hpp"
#include "barretenberg/vm/avm/trace/helper.hpp"
#include "barretenberg/vm/avm/trace/public_inputs.hpp"
#include "barretenberg/vm/avm/trace/trace.hpp"
#include "barretenberg/vm/aztec_constants.hpp"
#include "barretenberg/vm/constants.hpp"
#include "proof_surgeon.hpp"
#include <gtest/gtest.h>
#include <memory>
#include <vector>

using namespace acir_format;
using namespace bb;
using namespace bb::avm_trace;

class AcirAvmRecursionConstraint : public ::testing::Test {
  public:
    using InnerBuilder = AvmCircuitBuilder;
    using InnerProver = AvmProver;
    using InnerVerifier = AvmVerifier;

    using OuterProver = UltraProver;
    using OuterVerifier = UltraVerifier;
    using OuterDeciderProvingKey = DeciderProvingKey_<UltraFlavor>;

    using DeciderProvingKey = DeciderProvingKey_<UltraFlavor>;
    using OuterVerificationKey = UltraFlavor::VerificationKey;
    using OuterBuilder = UltraCircuitBuilder;

    static void SetUpTestSuite() { bb::srs::init_crs_factory("../srs_db/ignition"); }

    // mutate the input kernel_public_inputs_vec to add end gas values
    static InnerBuilder create_inner_circuit([[maybe_unused]] std::vector<FF>& kernel_public_inputs_vec)
    {
        AvmPublicInputs public_inputs;
        public_inputs.gas_settings.gas_limits.l2_gas = 1000000;
        public_inputs.gas_settings.gas_limits.da_gas = 1000000;
        AvmTraceBuilder trace_builder(public_inputs);
        InnerBuilder builder;

        trace_builder.op_set(0, 15, 1, AvmMemoryTag::U8);
        trace_builder.op_set(0, 12, 2, AvmMemoryTag::U8);
        trace_builder.op_add(0, 1, 2, 3);
        trace_builder.op_sub(0, 3, 2, 3);
        trace_builder.op_mul(0, 1, 1, 3);
        trace_builder.op_set(0, 0, 100, AvmMemoryTag::U32);
        trace_builder.op_return(0, 0, 100);
        auto trace = trace_builder.finalize(); // Passing true enables a longer trace with lookups

        builder.set_trace(std::move(trace));
        builder.check_circuit();
        return builder;
    }

    /**
     * @brief Create a circuit that recursively verifies one or more inner avm circuits
     */
    static OuterBuilder create_outer_circuit(std::vector<InnerBuilder>& inner_avm_circuits,
                                             const std::vector<FF>& kernel_public_inputs_vec)
    {
        std::vector<RecursionConstraint> avm_recursion_constraints;

        SlabVector<fr> witness;

        for (auto& avm_circuit : inner_avm_circuits) {
            AvmComposer composer = AvmComposer();
            InnerProver prover = composer.create_prover(avm_circuit);
            InnerVerifier verifier = composer.create_verifier(avm_circuit);

            std::vector<fr> key_witnesses = verifier.key->to_field_elements();
            std::vector<fr> proof_witnesses = prover.construct_proof();

            std::vector<FF> public_inputs_vec(kernel_public_inputs_vec);
            public_inputs_vec.resize(AVM_PUBLIC_INPUTS_FLATTENED_SIZE);

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
                .public_inputs = add_to_witness_and_track_indices(public_inputs_vec),
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
            create_circuit(constraint_system, /*recursive*/ false, /*size_hint*/ 0, witness, /*honk_recursion=*/true);
        return outer_circuit;
    }
};

TEST_F(AcirAvmRecursionConstraint, TestBasicSingleAvmRecursionConstraint)
{
    std::vector<FF> public_inputs_vec;
    // public_inputs_vec.resize(PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH);
    // public_inputs_vec.at(L2_START_GAS_LEFT_PCPI_OFFSET) = FF(1000000);
    // public_inputs_vec.at(DA_START_GAS_LEFT_PCPI_OFFSET) = FF(1000000);

    std::vector<InnerBuilder> layer_1_circuits;
    layer_1_circuits.push_back(create_inner_circuit(public_inputs_vec));
    auto layer_2_circuit = create_outer_circuit(layer_1_circuits, public_inputs_vec);

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
