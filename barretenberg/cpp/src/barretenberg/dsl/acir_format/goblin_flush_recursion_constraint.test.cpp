#include "goblin_flush_recursion_constraint.hpp"

#include "acir_format.hpp"
#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/chonk_verifier.hpp"
#include "barretenberg/dsl/acir_format/hypernova_recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/mock_verifier_inputs.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"

#include <gtest/gtest.h>

using namespace acir_format;
using namespace bb;

/**
 * @brief Test suite for Goblin flush recursion constraints (ULTRA_GOBLIN proof type).
 *
 * @details Follows the HyperNova test pattern: construct the goblin flush circuit by mocking the IVC state
 * at different points in the pipeline, and verify that the VK of the resulting Mega circuit (A_G) is
 * independent of the concrete IVC state. This is critical because A_G's VK hash is hard-coded in K_G.
 *
 * The flush can occur after:
 *   - An INIT kernel (first kernel, OINK queue entry for the app)
 *   - An INNER kernel (subsequent kernel, HN queue entry)
 *   - A RESET kernel (reset kernel, also HN queue entry)
 *
 * In all cases, the Mega circuit containing the ULTRA_GOBLIN constraint must have the same VK.
 */
class GoblinFlushRecursionConstraintTest : public ::testing::Test {
  public:
    using Builder = MegaCircuitBuilder;
    using Flavor = MegaFlavor;
    using VerificationKey = MegaFlavor::VerificationKey;
    using FF = Flavor::FF;
    using VerifierInputs = Chonk::VerifierInputs;
    using QUEUE_TYPE = Chonk::QUEUE_TYPE;

    /**
     * @brief Build a mock app circuit (the Goblin App A_G) with a single ULTRA_GOBLIN recursion constraint.
     *
     * @details The ULTRA_GOBLIN constraint has empty proof/key — BB constructs the Goblin proof and
     * Circuit C on-the-fly. We use the IVC state to generate the proof.
     */
    static AcirProgram construct_goblin_flush_program()
    {
        AcirProgram program;

        // Hacky way to ensure that the construction of the constraints doesn't go through the write_vk path
        uint32_t predicate_idx = add_to_witness_and_track_indices(program.witness, bb::fr::one());

        RecursionConstraint constraint{
            .key = {},
            .proof = {},
            .public_inputs = {},
            .key_hash = 0,
            .proof_type = ULTRA_GOBLIN,
            .predicate = WitnessOrConstant<bb::fr>::from_index(predicate_idx),
        };

        program.constraints.max_witness_index = 0;
        program.constraints.num_acir_opcodes = 1;
        program.constraints.honk_recursion_constraints = { constraint };
        program.constraints.original_opcode_indices =
            AcirFormatOriginalOpcodeIndices{ .honk_recursion_constraints = { 0 } };

        return program;
    }

    /**
     * @brief Build a Mega circuit from an ACIR program containing the ULTRA_GOBLIN constraint
     * and extract its VK.
     */
    static std::shared_ptr<VerificationKey> build_goblin_flush_circuit_and_get_vk(
        const std::shared_ptr<Chonk>& ivc = nullptr, const bool is_write_vk_mode = true)
    {
        AcirProgram program = construct_goblin_flush_program();
        if (is_write_vk_mode) {
            program.witness = {};
        }
        ProgramMetadata metadata{ ivc };
        auto circuit = acir_format::create_circuit<Builder>(program, metadata);
        auto prover_instance = std::make_shared<Chonk::ProverInstance>(circuit);
        return std::make_shared<VerificationKey>(prover_instance->get_precomputed());
    }

    // --- Helpers for building real IVC state at various pipeline positions ---

    static Builder construct_mock_app_circuit(const std::shared_ptr<Chonk>& ivc)
    {
        Builder circuit{ ivc->goblin.op_queue };
        GoblinMockCircuits::add_some_ecc_op_gates(circuit);
        MockCircuits::add_arithmetic_gates(circuit);
        stdlib::recursion::honk::AppIO::add_default(circuit);
        return circuit;
    }

    static std::shared_ptr<VerificationKey> get_verification_key(Builder& builder_in)
    {
        MegaCircuitBuilder_<bb::fr> builder{ builder_in };
        builder.op_queue = std::make_shared<ECCOpQueue>(*builder.op_queue);
        auto prover_instance = std::make_shared<Chonk::ProverInstance>(builder);
        return std::make_shared<VerificationKey>(prover_instance->get_precomputed());
    }

    static RecursionConstraint create_recursion_constraint(const VerifierInputs& input, std::vector<FF>& witness)
    {
        PROOF_TYPE proof_type = queue_type_to_proof_type(input.type);
        RecursionConstraint constraint = recursion_data_to_recursion_constraint(witness,
                                                                                input.proof,
                                                                                input.honk_vk->to_field_elements(),
                                                                                input.honk_vk->hash(),
                                                                                bb::fr::zero(),
                                                                                /*num_public_inputs_to_extract=*/0,
                                                                                proof_type);
        constraint.proof = {};
        return constraint;
    }

    static AcirProgram construct_mock_kernel_program(const Chonk::VerificationQueue& verification_queue)
    {
        AcirProgram program;
        std::vector<RecursionConstraint> hn_recursion_constraints;
        hn_recursion_constraints.reserve(verification_queue.size());
        for (const auto& queue_entry : verification_queue) {
            hn_recursion_constraints.push_back(create_recursion_constraint(queue_entry, program.witness));
        }
        program.constraints.max_witness_index = static_cast<uint32_t>(program.witness.size() - 1);
        program.constraints.num_acir_opcodes = static_cast<uint32_t>(hn_recursion_constraints.size());
        program.constraints.hn_recursion_constraints = hn_recursion_constraints;
        program.constraints.original_opcode_indices =
            hn_recursion_constraints.size() == 1
                ? AcirFormatOriginalOpcodeIndices{ .hn_recursion_constraints = { 0 } }
                : AcirFormatOriginalOpcodeIndices{ .hn_recursion_constraints = { 0, 1 } };
        return program;
    }

    static void construct_and_accumulate_mock_kernel(const std::shared_ptr<Chonk>& ivc)
    {
        const ProgramMetadata metadata{ ivc };
        AcirProgram mock_kernel_program = construct_mock_kernel_program(ivc->verification_queue);
        auto kernel = acir_format::create_circuit<Builder>(mock_kernel_program, metadata);
        auto prover_instance = std::make_shared<Chonk::ProverInstance>(kernel);
        auto kernel_vk = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
        ivc->accumulate(kernel, kernel_vk);
    }

    static void construct_and_accumulate_mock_app(const std::shared_ptr<Chonk>& ivc)
    {
        auto app_circuit = construct_mock_app_circuit(ivc);
        ivc->accumulate(app_circuit, get_verification_key(app_circuit));
    }

  protected:
    void SetUp() override { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

/**
 * @brief Generate A_G's VK using a mocked IVC state (no real accumulation) and verify it matches
 * the VK obtained from a real IVC run where the flush happens after the INIT kernel.
 *
 * @details After accumulating one app + one kernel (INIT), the verification queue contains
 * a single HN entry. The goblin flush app runs at this point.
 */
TEST_F(GoblinFlushRecursionConstraintTest, VKIndependenceAfterInitKernel)
{
    BB_DISABLE_ASSERTS();

    // Step 1: Get VK from real IVC state after init kernel
    std::shared_ptr<VerificationKey> real_vk;
    {
        auto ivc = std::make_shared<Chonk>(/*num_circuits=*/5);
        construct_and_accumulate_mock_app(ivc);
        construct_and_accumulate_mock_kernel(ivc);
        // At this point, the verification queue has the kernel's entry and the flush would happen next
        real_vk = build_goblin_flush_circuit_and_get_vk(ivc, /*is_write_vk_mode=*/false);
    }

    // Step 2: Get VK from mocked IVC state (no real accumulation)
    std::shared_ptr<VerificationKey> mocked_vk;
    {
        auto ivc = std::make_shared<Chonk>(/*num_circuits=*/5);
        // Mock the state as if one app (OINK) + one kernel (HN) were accumulated
        acir_format::mock_chonk_accumulation(ivc, QUEUE_TYPE::OINK, /*is_kernel=*/false);
        // Clear the verification queue so it doesn't interfere with the flush program
        ivc->verification_queue.clear();
        ivc->goblin.merge_verification_queue.clear();
        mocked_vk = build_goblin_flush_circuit_and_get_vk(ivc, /*is_write_vk_mode=*/true);
    }

    EXPECT_EQ(*real_vk.get(), *mocked_vk.get());
}

/**
 * @brief Same as above, but the flush happens after an INNER kernel (two app+kernel pairs accumulated).
 */
TEST_F(GoblinFlushRecursionConstraintTest, VKIndependenceAfterInnerKernel)
{
    BB_DISABLE_ASSERTS();

    // Step 1: Get VK from real IVC state after inner kernel
    std::shared_ptr<VerificationKey> real_vk;
    {
        auto ivc = std::make_shared<Chonk>(/*num_circuits=*/7);
        // App 1 + Init kernel
        construct_and_accumulate_mock_app(ivc);
        construct_and_accumulate_mock_kernel(ivc);
        // App 2 + Inner kernel
        construct_and_accumulate_mock_app(ivc);
        construct_and_accumulate_mock_kernel(ivc);
        // Flush after inner kernel
        real_vk = build_goblin_flush_circuit_and_get_vk(ivc, /*is_write_vk_mode=*/false);
    }

    // Step 2: Get VK from mocked IVC state
    std::shared_ptr<VerificationKey> mocked_vk;
    {
        auto ivc = std::make_shared<Chonk>(/*num_circuits=*/7);
        acir_format::mock_chonk_accumulation(ivc, QUEUE_TYPE::HN, /*is_kernel=*/true);
        ivc->verification_queue.clear();
        ivc->goblin.merge_verification_queue.clear();
        mocked_vk = build_goblin_flush_circuit_and_get_vk(ivc, /*is_write_vk_mode=*/true);
    }

    EXPECT_EQ(*real_vk.get(), *mocked_vk.get());
}

/**
 * @brief Same as above, but the flush happens after a RESET kernel.
 *
 * @details A RESET kernel appears when the second kernel in a sequence has a different VK from the first.
 * In the HyperNova test pattern, RESET is triggered by accumulating: app, init kernel, reset kernel.
 * The RESET kernel has a single HN entry in the verification queue.
 */
TEST_F(GoblinFlushRecursionConstraintTest, VKIndependenceAfterResetKernel)
{
    BB_DISABLE_ASSERTS();

    // Step 1: Get VK from real IVC state after reset kernel
    std::shared_ptr<VerificationKey> real_vk;
    {
        auto ivc = std::make_shared<Chonk>(/*num_circuits=*/7);
        // App + Init kernel
        construct_and_accumulate_mock_app(ivc);
        construct_and_accumulate_mock_kernel(ivc);
        EXPECT_EQ(ivc->verification_queue.size(), 1);
        EXPECT_EQ(ivc->verification_queue[0].type, QUEUE_TYPE::HN);
        // Reset kernel (accumulates the HN entry from init kernel)
        construct_and_accumulate_mock_kernel(ivc);
        // Flush after reset kernel
        real_vk = build_goblin_flush_circuit_and_get_vk(ivc, /*is_write_vk_mode=*/false);
    }

    // Step 2: Get VK from mocked IVC state
    std::shared_ptr<VerificationKey> mocked_vk;
    {
        auto ivc = std::make_shared<Chonk>(/*num_circuits=*/7);
        // Mock state as if app + init kernel + reset kernel were accumulated
        acir_format::mock_chonk_accumulation(ivc, QUEUE_TYPE::HN, /*is_kernel=*/true);
        ivc->verification_queue.clear();
        ivc->goblin.merge_verification_queue.clear();
        mocked_vk = build_goblin_flush_circuit_and_get_vk(ivc, /*is_write_vk_mode=*/true);
    }

    EXPECT_EQ(*real_vk.get(), *mocked_vk.get());
}

/**
 * @brief Verify that the VK is the same regardless of which kernel type precedes the flush.
 *
 * @details The flush circuit (A_G) contains only the ULTRA_GOBLIN constraint, which generates Circuit C
 * on-the-fly. Circuit C's structure depends only on the Goblin proof format (fixed), not on the
 * preceding kernel. Therefore A_G's VK must be identical across all scenarios.
 */
TEST_F(GoblinFlushRecursionConstraintTest, VKConsistentAcrossAllKernelTypes)
{
    BB_DISABLE_ASSERTS();

    // Get VK after init kernel (1 app + 1 kernel)
    std::shared_ptr<VerificationKey> vk_after_init;
    {
        auto ivc = std::make_shared<Chonk>(/*num_circuits=*/5);
        construct_and_accumulate_mock_app(ivc);
        construct_and_accumulate_mock_kernel(ivc);
        vk_after_init = build_goblin_flush_circuit_and_get_vk(ivc, /*is_write_vk_mode=*/true);
    }

    // Get VK after inner kernel (2 apps + 2 kernels)
    std::shared_ptr<VerificationKey> vk_after_inner;
    {
        auto ivc = std::make_shared<Chonk>(/*num_circuits=*/7);
        construct_and_accumulate_mock_app(ivc);
        construct_and_accumulate_mock_kernel(ivc);
        construct_and_accumulate_mock_app(ivc);
        construct_and_accumulate_mock_kernel(ivc);
        vk_after_inner = build_goblin_flush_circuit_and_get_vk(ivc, /*is_write_vk_mode=*/true);
    }

    // Get VK after reset kernel (1 app + init kernel + reset kernel)
    std::shared_ptr<VerificationKey> vk_after_reset;
    {
        auto ivc = std::make_shared<Chonk>(/*num_circuits=*/7);
        construct_and_accumulate_mock_app(ivc);
        construct_and_accumulate_mock_kernel(ivc);
        construct_and_accumulate_mock_kernel(ivc);
        vk_after_reset = build_goblin_flush_circuit_and_get_vk(ivc, /*is_write_vk_mode=*/true);
    }

    EXPECT_EQ(*vk_after_init.get(), *vk_after_inner.get())
        << "VK differs between flush after INIT vs flush after INNER kernel";
    EXPECT_EQ(*vk_after_init.get(), *vk_after_reset.get())
        << "VK differs between flush after INIT vs flush after RESET kernel";
}

/**
 * @brief End-to-end test: A0, K0, A1, K1, A_G, K_G, K_reset, K_tail, K_hiding.
 * @details Builds the goblin flush app (A_G) using create_goblin_flush_recursion_constraints via the ACIR
 * constraint system, then accumulates it alongside normal kernels. Verifies the full Chonk IVC proof.
 */
TEST_F(GoblinFlushRecursionConstraintTest, EndToEndSingleFlush)
{
    // 5 apps (A0, A1, A_G, + 0 padding) + 5 kernels (K0, K1, K_G, K_reset, K_tail) + hiding = 9 circuits
    // Actually: A0, K0, A1, K1, A_G, K_G, K_reset, K_tail, K_hiding = 9 circuits
    auto ivc = std::make_shared<Chonk>(/*num_circuits=*/9);

    // A0: normal app
    construct_and_accumulate_mock_app(ivc);

    // K0: init kernel
    construct_and_accumulate_mock_kernel(ivc);

    // A1: normal app
    construct_and_accumulate_mock_app(ivc);

    // K1: inner kernel
    construct_and_accumulate_mock_kernel(ivc);

    // A_G: goblin flush app (built from ULTRA_GOBLIN ACIR constraint)
    {
        AcirProgram program = construct_goblin_flush_program();
        ProgramMetadata metadata{ ivc };
        auto ag_circuit = acir_format::create_circuit<Builder>(program, metadata);
        auto ag_vk = get_verification_key(ag_circuit);
        ivc->accumulate(ag_circuit, ag_vk);
    }

    // K_G: goblin flush kernel (normal kernel - complete_kernel_circuit_logic handles the flush)
    construct_and_accumulate_mock_kernel(ivc);

    // Trailing kernels: K_reset, K_tail, K_hiding
    construct_and_accumulate_mock_kernel(ivc); // reset
    construct_and_accumulate_mock_kernel(ivc); // tail
    construct_and_accumulate_mock_kernel(ivc); // hiding

    auto proof = ivc->prove();
    {
        ChonkNativeVerifier verifier(ivc->get_hiding_kernel_vk_and_hash());
        EXPECT_TRUE(verifier.verify(proof));
    }
}
