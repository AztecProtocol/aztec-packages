#include "barretenberg/client_ivc/mock_circuit_producer.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_format_mocks.hpp"
#include "barretenberg/dsl/acir_format/proof_surgeon.hpp"
#include "barretenberg/stdlib/client_ivc_verifier/client_ivc_recursive_verifier.hpp"

#include <gtest/gtest.h>

using namespace acir_format;
using namespace bb;
using namespace bb::stdlib::recursion::honk;

class CivcRecursionConstraintTest : public ::testing::Test {
  public:
    using Builder = UltraCircuitBuilder;

    // Types for ClientIVC recursive verifier
    using Flavor = UltraRollupFlavor;
    using DeciderProvingKey = DeciderProvingKey_<Flavor>;
    using VerificationKey = Flavor::VerificationKey;
    using ClientIVCRecursiveVerifier = stdlib::recursion::honk::ClientIVCRecursiveVerifier;

    // Types for ClientIVC
    using DeciderZKProvingKey = DeciderProvingKey_<MegaZKFlavor>;
    using MegaZKVerificationKey = MegaZKFlavor::VerificationKey;

    // Public inputs added by bb to a ClientIVC proof
    static constexpr size_t PUBLIC_INPUTS_SIZE = bb::HidingKernelIO::PUBLIC_INPUTS_SIZE;

    struct ClientIVCData {
        std::shared_ptr<MegaZKVerificationKey> mega_vk;
        ClientIVC::Proof proof;
    };

    static ClientIVCData get_civc_data(TraceSettings trace_settings)
    {
        static constexpr size_t NUM_CIRCUITS = 4;

        ClientIVC ivc(NUM_CIRCUITS, trace_settings);

        PrivateFunctionExecutionMockCircuitProducer circuit_producer;

        for (size_t idx = 0; idx < NUM_CIRCUITS; idx++) {
            circuit_producer.construct_and_accumulate_next_circuit(ivc);
        }

        ClientIVC::Proof proof = ivc.prove();

        return { ivc.get_vk().mega, proof };
    }

    static AcirProgram create_acir_program(const ClientIVCData& civc_data)
    {
        AcirProgram program;

        // Extract the witnesses from the provided data
        auto key_witnesses = civc_data.mega_vk->to_field_elements();
        auto key_hash_witness = civc_data.mega_vk->hash();
        std::vector<fr> proof_witnesses;
        proof_witnesses.insert(
            proof_witnesses.end(), civc_data.proof.mega_proof.begin(), civc_data.proof.mega_proof.end());
        proof_witnesses.insert(proof_witnesses.end(),
                               civc_data.proof.goblin_proof.merge_proof.begin(),
                               civc_data.proof.goblin_proof.merge_proof.end());
        proof_witnesses.insert(proof_witnesses.end(),
                               civc_data.proof.goblin_proof.eccvm_proof.pre_ipa_proof.begin(),
                               civc_data.proof.goblin_proof.eccvm_proof.pre_ipa_proof.end());
        proof_witnesses.insert(proof_witnesses.end(),
                               civc_data.proof.goblin_proof.eccvm_proof.ipa_proof.begin(),
                               civc_data.proof.goblin_proof.eccvm_proof.ipa_proof.end());
        proof_witnesses.insert(proof_witnesses.end(),
                               civc_data.proof.goblin_proof.translator_proof.begin(),
                               civc_data.proof.goblin_proof.translator_proof.end());

        // Construct witness indices for each component in the constraint; populate the witness array
        auto [key_indices, key_hash_index, proof_indices, public_inputs_indices] =
            ProofSurgeon<fr>::populate_recursion_witness_data(
                program.witness,
                proof_witnesses,
                key_witnesses,
                key_hash_witness,
                /*num_public_inputs_to_extract=*/civc_data.mega_vk->num_public_inputs - PUBLIC_INPUTS_SIZE);

        auto constraint = RecursionConstraint{ .key = key_indices,
                                               .proof = proof_indices,
                                               .public_inputs = public_inputs_indices,
                                               .key_hash = key_hash_index,
                                               .proof_type = PROOF_TYPE::CIVC };

        // Construct a constraint system
        program.constraints.varnum = static_cast<uint32_t>(program.witness.size());
        program.constraints.num_acir_opcodes = static_cast<uint32_t>(1);
        program.constraints.civc_recursion_constraints = { constraint };
        program.constraints.original_opcode_indices = create_empty_original_opcode_indices();
        mock_opcode_indices(program.constraints);

        return program;
    }

    static std::shared_ptr<DeciderProvingKey> get_civc_recursive_verifier_pk(AcirProgram& program)
    {
        // Build constraints
        Builder builder = create_circuit(program, { .honk_recursion = 2 });

        // Construct vk
        auto proving_key = std::make_shared<DeciderProvingKey>(builder);

        return proving_key;
    }

  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(CivcRecursionConstraintTest, GenerateRecursiveCivcVerifierVKFromConstraints)
{
    using VerificationKey = CivcRecursionConstraintTest::VerificationKey;
    using ClientIVCData = CivcRecursionConstraintTest::ClientIVCData;

    ClientIVCData civc_data = CivcRecursionConstraintTest::get_civc_data(TraceSettings());

    std::shared_ptr<VerificationKey> actual_vk;
    {
        AcirProgram program = create_acir_program(civc_data);
        auto proving_key = get_civc_recursive_verifier_pk(program);
        actual_vk = std::make_shared<VerificationKey>(proving_key->get_precomputed());

        // Prove and verify
        UltraProver_<UltraRollupFlavor> prover(proving_key, actual_vk);
        HonkProof proof = prover.prove();

        VerifierCommitmentKey<curve::Grumpkin> ipa_verification_key(1 << CONST_ECCVM_LOG_N);
        UltraVerifier_<UltraRollupFlavor> verifier(actual_vk, ipa_verification_key);

        // Split the proof
        auto ultra_proof =
            HonkProof(proof.begin(), proof.begin() + static_cast<std::ptrdiff_t>(proof.size() - IPA_PROOF_LENGTH));
        auto ipa_proof =
            HonkProof(proof.begin() + static_cast<std::ptrdiff_t>(proof.size() - IPA_PROOF_LENGTH), proof.end());

        EXPECT_TRUE(verifier.verify_proof<bb::RollupIO>(proof, ipa_proof));
    }

    std::shared_ptr<VerificationKey> expected_vk;
    {
        AcirProgram program = create_acir_program(civc_data);
        program.witness.clear();
        auto proving_key = get_civc_recursive_verifier_pk(program);
        expected_vk = std::make_shared<VerificationKey>(proving_key->get_precomputed());
    }

    EXPECT_EQ(*actual_vk, *expected_vk);
}
