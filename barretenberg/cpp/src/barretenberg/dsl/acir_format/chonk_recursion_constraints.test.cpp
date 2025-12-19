#include "barretenberg/chonk/chonk_verifier.hpp"
#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_format_mocks.hpp"
#include "barretenberg/dsl/acir_format/gate_count_constants.hpp"
#include "barretenberg/dsl/acir_format/proof_surgeon.hpp"

#include <gtest/gtest.h>

using namespace acir_format;
using namespace bb;
using namespace bb::stdlib::recursion::honk;

class ChonkRecursionConstraintTest : public ::testing::Test {
  public:
    using Builder = UltraCircuitBuilder;

    // Types for Chonk recursive verifier
    using Flavor = UltraRollupFlavor;
    using ProverInstance = ProverInstance_<Flavor>;
    using VerificationKey = Flavor::VerificationKey;
    using ChonkRecursiveVerifier = bb::ChonkRecursiveVerifier;

    // Types for Chonk
    using DeciderZKProvingKey = ProverInstance_<MegaZKFlavor>;
    using MegaZKVerificationKey = MegaZKFlavor::VerificationKey;

    // Public inputs added by bb to a Chonk proof
    static constexpr size_t PUBLIC_INPUTS_SIZE = bb::HidingKernelIO::PUBLIC_INPUTS_SIZE;

    struct ChonkData {
        std::shared_ptr<MegaZKVerificationKey> mega_vk;
        ChonkProof proof;
    };

    static ChonkData get_chonk_data()
    {
        static constexpr size_t NUM_APP_CIRCUITS = 1;

        PrivateFunctionExecutionMockCircuitProducer circuit_producer(NUM_APP_CIRCUITS);
        const size_t num_circuits = circuit_producer.total_num_circuits;
        Chonk ivc{ num_circuits };

        for (size_t j = 0; j < num_circuits; ++j) {
            circuit_producer.construct_and_accumulate_next_circuit(ivc);
        }

        ChonkProof proof = ivc.prove();
        return { ivc.get_vk().mega, proof };
    }

    static AcirProgram create_acir_program(const ChonkData& chonk_data)
    {
        AcirProgram program;

        // Extract the witnesses from the provided data
        auto key_witnesses = chonk_data.mega_vk->to_field_elements();
        auto key_hash_witness = chonk_data.mega_vk->hash();
        std::vector<fr> proof_witnesses = chonk_data.proof.to_field_elements();

        // Construct witness indices for each component in the constraint; populate the witness array
        auto [key_indices, key_hash_index, proof_indices, public_inputs_indices] =
            ProofSurgeon<fr>::populate_recursion_witness_data(
                program.witness,
                proof_witnesses,
                key_witnesses,
                key_hash_witness,
                /*num_public_inputs_to_extract=*/static_cast<size_t>(chonk_data.mega_vk->num_public_inputs) -
                    PUBLIC_INPUTS_SIZE);

        auto constraint = RecursionConstraint{ .key = key_indices,
                                               .proof = proof_indices,
                                               .public_inputs = public_inputs_indices,
                                               .key_hash = key_hash_index,
                                               .proof_type = PROOF_TYPE::CHONK };

        // Construct a constraint system
        program.constraints.max_witness_index = static_cast<uint32_t>(program.witness.size() - 1);
        program.constraints.num_acir_opcodes = static_cast<uint32_t>(1);
        program.constraints.chonk_recursion_constraints = { constraint };
        program.constraints.original_opcode_indices = create_empty_original_opcode_indices();
        mock_opcode_indices(program.constraints);

        return program;
    }

    static std::shared_ptr<ProverInstance> get_chonk_recursive_verifier_pk(AcirProgram& program)
    {
        // Build constraints
        auto builder = create_circuit<Builder>(program, { .has_ipa_claim = true });

        // Construct vk
        auto prover_instance = std::make_shared<ProverInstance>(builder);

        return prover_instance;
    }

  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(ChonkRecursionConstraintTest, GenerateRecursiveChonkVerifierVKFromConstraints)
{
    using VerificationKey = ChonkRecursionConstraintTest::VerificationKey;
    using ChonkData = ChonkRecursionConstraintTest::ChonkData;

    ChonkData chonk_data = ChonkRecursionConstraintTest::get_chonk_data();

    std::shared_ptr<VerificationKey> vk_from_valid_witness;
    {
        AcirProgram program = create_acir_program(chonk_data);
        auto prover_instance = get_chonk_recursive_verifier_pk(program);
        vk_from_valid_witness = std::make_shared<VerificationKey>(prover_instance->get_precomputed());

        // Prove and verify
        UltraProver_<UltraRollupFlavor> prover(prover_instance, vk_from_valid_witness);
        HonkProof proof = prover.prove();

        auto vk_and_hash = std::make_shared<UltraRollupFlavor::VKAndHash>(vk_from_valid_witness);
        UltraVerifier_<UltraRollupFlavor, bb::RollupIO> verifier(vk_and_hash);

        EXPECT_TRUE(verifier.verify_proof(proof).result);
    }

    std::shared_ptr<VerificationKey> vk_from_constraints;
    {
        AcirProgram program = create_acir_program(chonk_data);
        program.witness.clear();
        auto prover_instance = get_chonk_recursive_verifier_pk(program);
        vk_from_constraints = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
    }

    EXPECT_EQ(*vk_from_valid_witness, *vk_from_constraints);
}

TEST_F(ChonkRecursionConstraintTest, GateCountChonkRecursion)
{
    using ChonkData = ChonkRecursionConstraintTest::ChonkData;

    ChonkData chonk_data = ChonkRecursionConstraintTest::get_chonk_data();

    AcirProgram program = create_acir_program(chonk_data);

    ProgramMetadata metadata{ .has_ipa_claim = true, .collect_gates_per_opcode = true };
    auto builder = create_circuit<Builder>(program, metadata);

    // Verify the gate count was recorded
    EXPECT_EQ(program.constraints.gates_per_opcode.size(), 1);

    EXPECT_EQ(program.constraints.gates_per_opcode[0], CHONK_RECURSION_GATES);
}
