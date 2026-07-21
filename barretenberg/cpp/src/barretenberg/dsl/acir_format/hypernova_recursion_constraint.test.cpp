#include "barretenberg/dsl/acir_format/hypernova_recursion_constraint.hpp"
#include "acir_format.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/chonk_verifier.hpp"
#include "barretenberg/dsl/acir_format/gate_count_constants.hpp"
#include "barretenberg/dsl/acir_format/mock_verifier_inputs.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "honk_recursion_constraint.hpp"

#include <gtest/gtest.h>
#include <vector>

using namespace acir_format;
using namespace bb;

class HypernovaRecursionConstraintTest : public ::testing::Test {

  public:
    using Builder = MegaCircuitBuilder;
    using FF = Chonk::FF;
    using VerifierInputs = Chonk::VerifierInputs;
    using PairingPoints = Chonk::PairingPoints;

    /**
     * @brief Constuct a simple arbitrary circuit to represent a mock app circuit
     *
     */
    static Builder construct_mock_app_circuit(const std::shared_ptr<Chonk>& ivc)
    {
        Builder circuit{ ivc->goblin.op_queue };
        GoblinMockCircuits::add_some_ecc_op_gates(circuit);
        MockCircuits::add_arithmetic_gates(circuit);
        stdlib::recursion::honk::AppIO::add_default(circuit);
        return circuit;
    }

    static Chonk::CircuitVerificationKey make_circuit_vk(Builder& builder_in, CircuitKind kind)
    {
        MegaCircuitBuilder_<bb::fr> builder{ builder_in };
        builder.op_queue = std::make_shared<ECCOpQueue>(*builder.op_queue);
        return dispatch_kind(kind, [&]<CircuitKind K>() {
            using FlavorT = flavor_for<K>;
            using VK = typename FlavorT::VerificationKey;
            return Chonk::CircuitVerificationKey{ std::make_shared<VK>(
                ProverInstance_<FlavorT>(builder).get_precomputed()) };
        });
    }

    static void construct_and_accumulate_trailing_kernels(const std::shared_ptr<Chonk>& ivc)
    {

        // Reset-tail kernel: verifies a single previous-kernel proof
        EXPECT_EQ(ivc->verification_queue.size(), 1);
        EXPECT_EQ(ivc->verification_queue[0].kind, CircuitKind::Kernel);
        construct_and_accumulate_mock_kernel(ivc);

        // Hiding kernel: verifies the tail kernel's proof
        EXPECT_EQ(ivc->verification_queue.size(), 1);
        EXPECT_EQ(ivc->verification_queue[0].kind, CircuitKind::Kernel);
        construct_and_accumulate_mock_kernel(ivc);
    }

    static UltraCircuitBuilder create_inner_circuit(size_t log_num_gates = 10)
    {
        UltraCircuitBuilder builder;

        // Create 2^log_n many add gates based on input log num gates
        const size_t num_gates = (1 << log_num_gates);
        for (size_t i = 0; i < num_gates; ++i) {
            fr a = fr::random_element();
            uint32_t a_idx = builder.add_variable(a);

            fr b = fr::random_element();
            fr c = fr::random_element();
            fr d = a + b + c;
            uint32_t b_idx = builder.add_variable(b);
            uint32_t c_idx = builder.add_variable(c);
            uint32_t d_idx = builder.add_variable(d);

            builder.create_big_add_gate({ a_idx, b_idx, c_idx, d_idx, fr(1), fr(1), fr(1), fr(-1), fr(0) });
        }

        stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>::add_default(builder);
        return builder;
    }

    /**
     * @brief Constuct a mock app circuit with a UH recursive verifier
     *
     */
    static Builder construct_mock_UH_recursion_app_circuit(const std::shared_ptr<Chonk>& ivc, const bool tamper_vk)
    {
        AcirProgram program;
        std::vector<RecursionConstraint> recursion_constraints;

        Builder circuit{ ivc->goblin.op_queue };
        GoblinMockCircuits::add_some_ecc_op_gates(circuit);
        MockCircuits::add_arithmetic_gates(circuit);

        {
            using RecursiveFlavor = UltraRecursiveFlavor_<Builder>;
            using VerifierOutput = bb::stdlib::recursion::honk::UltraRecursiveVerifierOutput<Builder>;
            using StdlibProof = bb::stdlib::Proof<Builder>;
            using StdlibIO = bb::stdlib::recursion::honk::DefaultIO<Builder>;

            // Create an arbitrary inner circuit
            auto inner_circuit = create_inner_circuit();

            // Compute native verification key
            auto prover_instance = std::make_shared<ProverInstance_<UltraFlavor>>(inner_circuit);
            auto honk_vk = std::make_shared<UltraFlavor::VerificationKey>(prover_instance->get_precomputed());
            UltraProver prover(prover_instance, honk_vk); // A prerequisite for computing VK
            auto inner_proof = prover.construct_proof();

            if (tamper_vk) {
                honk_vk->q_l() = g1::one;
                auto honk_vk_and_hash = std::make_shared<UltraFlavor::VKAndHash>(honk_vk);
                UltraVerifier_<UltraFlavor, DefaultIO> verifier(honk_vk_and_hash);
                EXPECT_FALSE(verifier.verify_proof(inner_proof).result);
            }
            // Instantiate the recursive verifier using the native verification key
            auto stdlib_vk_and_hash = std::make_shared<RecursiveFlavor::VKAndHash>(circuit, honk_vk);
            bb::UltraVerifier_<RecursiveFlavor, StdlibIO> verifier(stdlib_vk_and_hash);

            StdlibProof stdlib_inner_proof(circuit, inner_proof);
            VerifierOutput output = verifier.verify_proof(stdlib_inner_proof);

            // IO
            StdlibIO inputs;
            inputs.pairing_inputs = output.points_accumulator;
            inputs.set_public(); // propagate resulting pairing points on the public inputs
        }

        return circuit;
    }

    /**
     * @brief Create an ACIR RecursionConstraint given the corresponding verifier inputs
     * @brief In practice such constraints are created via a call to verify_proof(...) in noir
     *
     * @param input bberg style proof and verification key
     * @param witness Array of witnesses into which the above data is placed
     * @return RecursionConstraint
     */
    static RecursionConstraint create_recursion_constraint(const VerifierInputs& input,
                                                           PROOF_TYPE proof_type,
                                                           std::vector<FF>& witness)
    {
        auto fields = input.vk_to_field_elements();
        auto hash = input.vk_hash();
        RecursionConstraint constraint =
            recursion_data_to_recursion_constraint(witness,
                                                   input.proof, // proof contains the public inputs at this stage
                                                   fields,
                                                   hash,
                                                   bb::fr::zero(),
                                                   /*num_public_inputs_to_extract=*/0,
                                                   proof_type);

        constraint.proof = {}; // the proof witness indices are not needed in an ivc recursion constraint

        return constraint;
    }

    /**
     * @brief Build a set of bare HN recursion constraints carrying only the given proof types.
     * @details This is the input the Noir compiler hands to barretenberg: the proof type per recursive
     * verification, with no proof/VK witnesses yet. Feeding it to `create_mock_chonk_from_constraints`
     * exercises the same mock-IVC construction used by the production write-VK path.
     */
    static std::vector<RecursionConstraint> make_hn_recursion_constraints(const std::vector<PROOF_TYPE>& proof_types)
    {
        std::vector<RecursionConstraint> constraints;
        constraints.reserve(proof_types.size());
        for (PROOF_TYPE proof_type : proof_types) {
            RecursionConstraint constraint;
            constraint.proof_type = proof_type;
            constraints.push_back(constraint);
        }
        return constraints;
    }

    /**
     * @brief Generate an acir program {constraints, witness} for a mock kernel
     * @details The IVC contains and internal verification queue that contains proofs to be recursively verified.
     * Construct an AcirProgram with a RecursionConstraint for each entry in the ivc verification queue. (In practice
     * these constraints would come directly from calls to verify_proof in noir).
     * @note This method needs the number of public inputs in each proof-to-be-verified so they can be extracted and
     * provided separately as is required in the acir constraint system.
     *
     * @param ivc
     * @param inner_circuit_num_pub_inputs Num pub inputs for each circuit whose accumulation is recursively
     * verified
     * @return Builder
     */
    static AcirProgram construct_mock_kernel_program(const std::shared_ptr<Chonk>& ivc)
    {
        AcirProgram program;

        // Derive the ACIR proof_type for each queued proof the same way the verifier-side cross-check expects:
        // the init kernel's first app is OINK, the hiding kernel verifies the tail via HN_FINAL, every other
        // proof is HN. is_init is read from the (still-native) queue front; is_hiding from the IVC's circuit kinds.
        const auto& verification_queue = ivc->verification_queue;
        const bool is_init = !verification_queue.empty() && verification_queue.front().kind == CircuitKind::App;
        const bool is_hiding = ivc->is_hiding_kernel();

        // Construct recursion constraints based on the ivc verification queue; populate the witness along the way
        std::vector<RecursionConstraint> hn_recursion_constraints;
        hn_recursion_constraints.reserve(verification_queue.size());
        for (size_t idx = 0; idx < verification_queue.size(); ++idx) {
            PROOF_TYPE proof_type;
            if (is_hiding) {
                BB_ASSERT_EQ(
                    verification_queue.size(), 1U, "The hiding kernel should recursively verify only one proof.");
                proof_type = PROOF_TYPE::HN_FINAL;
            } else if (is_init && idx == 0) {
                proof_type = PROOF_TYPE::OINK;
            } else {
                proof_type = PROOF_TYPE::HN;
            }
            hn_recursion_constraints.push_back(
                create_recursion_constraint(verification_queue[idx], proof_type, program.witness));
        }

        // Construct a constraint system containing the business logic and ivc recursion constraints
        program.constraints.max_witness_index = static_cast<uint32_t>(program.witness.size() - 1);
        program.constraints.num_acir_opcodes = static_cast<uint32_t>(hn_recursion_constraints.size());
        program.constraints.hn_recursion_constraints = hn_recursion_constraints;
        for (size_t idx = 0; idx < hn_recursion_constraints.size(); ++idx) {
            program.constraints.original_opcode_indices.hn_recursion_constraints.push_back(static_cast<uint32_t>(idx));
        }

        return program;
    }

    static void construct_and_accumulate_mock_kernel(std::shared_ptr<Chonk> ivc)
    {
        BB_ASSERT_NEQ(ivc->current_kind(), CircuitKind::App);
        // construct a mock kernel program (acir) from the ivc verification queue
        const ProgramMetadata metadata{ ivc };
        AcirProgram mock_kernel_program = construct_mock_kernel_program(ivc);
        auto kernel = acir_format::create_circuit<Builder>(mock_kernel_program, metadata);
        // Build the VK in the flavor matching the current kind (Kernel / HidingKernel) from the kernel circuit.
        Chonk::CircuitVerificationKey vk = dispatch_kind(ivc->current_kind(), [&]<CircuitKind K>() {
            using FlavorT = flavor_for<K>;
            using VK = typename FlavorT::VerificationKey;
            return Chonk::CircuitVerificationKey{ std::make_shared<VK>(
                ProverInstance_<FlavorT>(kernel).get_precomputed()) };
        });
        ivc->accumulate(kernel, vk);
    }

    static void construct_and_accumulate_mock_app(std::shared_ptr<Chonk> ivc)
    {
        BB_ASSERT_EQ(ivc->current_kind(), CircuitKind::App);
        auto app_circuit = construct_mock_app_circuit(ivc);
        ivc->accumulate(app_circuit, make_circuit_vk(app_circuit, ivc->current_kind()));
    }

    /**
     * @brief Construct a kernel circuit VK from an acir program with IVC recursion constraints.
     * Always uses MegaKernelFlavor — for the hiding kernel use MegaZKFlavor directly at the call site.
     */
    static std::shared_ptr<Chonk::KernelVerificationKey> construct_kernel_vk_from_acir_program(AcirProgram& program)
    {
        auto kernel = acir_format::create_circuit<Builder>(program);
        return std::make_shared<Chonk::KernelVerificationKey>(
            ProverInstance_<Chonk::KernelFlavor>(kernel).get_precomputed());
    }

    // ---------------------------------------------------------------------------------------------
    // Per-kernel-type scenario helpers
    //
    // Each kernel type is exercised two ways and the results compared:
    //   - real_*_vk: run the actual IVC over mock app/kernel circuits up to the target kernel and read its VK.
    //   - mock_*_vk: build the target kernel's VK through the production write-VK path, i.e. from the recursion
    //     constraints' proof types via create_mock_chonk_from_constraints.
    // ---------------------------------------------------------------------------------------------

    // Proof types Noir emits for an init kernel verifying `num_apps` leading apps: the first via OINK, the rest HN.
    static std::vector<PROOF_TYPE> init_kernel_proof_types(size_t num_apps)
    {
        std::vector<PROOF_TYPE> proof_types(num_apps, PROOF_TYPE::HN);
        proof_types.front() = PROOF_TYPE::OINK;
        return proof_types;
    }

    // Proof types Noir emits for an inner kernel verifying the previous kernel (HN) followed by `num_apps` apps (HN).
    static std::vector<PROOF_TYPE> inner_kernel_proof_types(size_t num_apps)
    {
        return std::vector<PROOF_TYPE>(num_apps + 1, PROOF_TYPE::HN);
    }

    // Build a kernel VK from recursion constraints via the production write-VK path.
    static std::shared_ptr<Chonk::KernelVerificationKey> mock_kernel_vk(const std::vector<PROOF_TYPE>& proof_types)
    {
        auto ivc = create_mock_chonk_from_constraints(make_hn_recursion_constraints(proof_types));
        AcirProgram program = construct_mock_kernel_program(ivc);
        program.witness = {}; // remove the witness to mimic the VK construction context
        return construct_kernel_vk_from_acir_program(program);
    }

    // Build the hiding kernel's (MegaZK) VK from recursion constraints via the production write-VK path.
    static std::shared_ptr<Chonk::MegaZKVerificationKey> mock_hiding_kernel_vk()
    {
        auto ivc = create_mock_chonk_from_constraints(make_hn_recursion_constraints({ PROOF_TYPE::HN_FINAL }));
        AcirProgram program = construct_mock_kernel_program(ivc);
        program.witness = {};
        auto kernel = acir_format::create_circuit<Builder>(program);
        return std::make_shared<Chonk::MegaZKVerificationKey>(
            Chonk::HidingKernelProverInstance(kernel).get_precomputed());
    }

    struct KernelGateCounts {
        size_t num_opcodes;
        size_t gate_count; // total kernel-completion gates (attributed to the first recursion opcode)
        size_t ecc_rows;
        size_t ultra_ops;
    };

    // Build a kernel via the production write-VK path with gate counting enabled and report its gate/ECC/op counts.
    static KernelGateCounts mock_kernel_gate_counts(const std::vector<PROOF_TYPE>& proof_types)
    {
        auto ivc = create_mock_chonk_from_constraints(make_hn_recursion_constraints(proof_types));
        AcirProgram program = construct_mock_kernel_program(ivc);
        ProgramMetadata metadata{ .ivc = ivc, .collect_gates_per_opcode = true };
        auto kernel = acir_format::create_circuit<Builder>(program, metadata);
        return { program.constraints.gates_per_opcode.size(),
                 program.constraints.gates_per_opcode.empty() ? 0 : program.constraints.gates_per_opcode[0],
                 kernel.op_queue->get_num_rows(),
                 kernel.op_queue->get_current_subtable_size() };
    }

    // Real-IVC VK for an init kernel verifying `num_apps` leading apps.
    static std::shared_ptr<Chonk::KernelVerificationKey> real_init_kernel_vk(size_t num_apps)
    {
        std::vector<CircuitKind> kinds(num_apps, CircuitKind::App);
        kinds.push_back(CircuitKind::Kernel);       // init kernel (target)
        kinds.push_back(CircuitKind::Kernel);       // tail kernel
        kinds.push_back(CircuitKind::HidingKernel); // hiding kernel
        auto ivc = std::make_shared<Chonk>(kinds);
        for (size_t i = 0; i < num_apps; ++i) {
            construct_and_accumulate_mock_app(ivc);
        }
        construct_and_accumulate_mock_kernel(ivc); // init kernel verifying the leading apps
        return ivc->verification_queue.back().kernel_honk_vk;
    }

    // Real-IVC VK for an inner kernel verifying the previous kernel plus `num_apps` apps.
    static std::shared_ptr<Chonk::KernelVerificationKey> real_inner_kernel_vk(size_t num_apps)
    {
        std::vector<CircuitKind> kinds = { CircuitKind::App, CircuitKind::Kernel }; // App0 + init kernel
        kinds.insert(kinds.end(), num_apps, CircuitKind::App);                      // the inner kernel's apps
        kinds.push_back(CircuitKind::Kernel);                                       // inner kernel (target)
        kinds.push_back(CircuitKind::Kernel);                                       // tail kernel
        kinds.push_back(CircuitKind::HidingKernel);                                 // hiding kernel
        auto ivc = std::make_shared<Chonk>(kinds);
        construct_and_accumulate_mock_app(ivc);    // App0
        construct_and_accumulate_mock_kernel(ivc); // init kernel (verifies App0)
        for (size_t i = 0; i < num_apps; ++i) {
            construct_and_accumulate_mock_app(ivc);
        }
        construct_and_accumulate_mock_kernel(ivc); // inner kernel verifying the previous kernel + apps
        return ivc->verification_queue.back().kernel_honk_vk;
    }

    // Real-IVC VK for a reset/tail kernel verifying only the previous kernel.
    static std::shared_ptr<Chonk::KernelVerificationKey> real_reset_tail_kernel_vk()
    {
        auto ivc = std::make_shared<Chonk>(std::vector<CircuitKind>{ CircuitKind::App,
                                                                     CircuitKind::Kernel,
                                                                     CircuitKind::Kernel,
                                                                     CircuitKind::Kernel,
                                                                     CircuitKind::HidingKernel });
        construct_and_accumulate_mock_app(ivc);    // App0
        construct_and_accumulate_mock_kernel(ivc); // init kernel (verifies App0)
        construct_and_accumulate_mock_kernel(ivc); // reset/tail kernel (verifies only the previous kernel)
        return ivc->verification_queue.back().kernel_honk_vk;
    }

    // Real-IVC (MegaZK) VK for the hiding kernel.
    static std::shared_ptr<Chonk::MegaZKVerificationKey> real_hiding_kernel_vk()
    {
        auto ivc = std::make_shared<Chonk>(std::vector<CircuitKind>{
            CircuitKind::App, CircuitKind::Kernel, CircuitKind::Kernel, CircuitKind::HidingKernel });
        construct_and_accumulate_mock_app(ivc);
        construct_and_accumulate_mock_kernel(ivc);      // init kernel
        construct_and_accumulate_trailing_kernels(ivc); // reset-tail + hiding kernels
        return ivc->hiding_vk;
    }

  protected:
    void SetUp() override { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

/**
 * @brief Check that the size of a mock merge proof matches expectation
 */
TEST_F(HypernovaRecursionConstraintTest, MockMergeProofSize)
{
    Goblin::MergeProof merge_proof = create_mock_merge_proof();
    EXPECT_EQ(merge_proof.size(), MERGE_PROOF_SIZE);
}

/**
 * @brief Test IVC accumulation of a one app and one kernel; The kernel includes a recursive oink verification for the
 * app, specified via an ACIR RecursionConstraint.
 */
TEST_F(HypernovaRecursionConstraintTest, AccumulateSingleApp)
{
    auto ivc = std::make_shared<Chonk>(std::vector<CircuitKind>{
        CircuitKind::App, CircuitKind::Kernel, CircuitKind::Kernel, CircuitKind::HidingKernel });

    // construct a mock app_circuit
    construct_and_accumulate_mock_app(ivc);

    // Construct kernel consisting only of the kernel completion logic
    construct_and_accumulate_mock_kernel(ivc);

    // add the trailing kernels
    construct_and_accumulate_trailing_kernels(ivc);

    auto proof = ivc->prove();
    {
        auto vk_and_hash = ivc->get_hiding_kernel_vk_and_hash();
        ChonkNativeVerifier verifier(vk_and_hash);
        EXPECT_TRUE(verifier.verify(proof));
    }
}

/**
 * @brief Test IVC accumulation of two apps and two kernels; The first kernel contains a recursive oink verification and
 * the second contains two recursive HN verifications, all specified via ACIR RecursionConstraints.
 */
TEST_F(HypernovaRecursionConstraintTest, AccumulateTwoApps)
{
    // app, kernel, app, kernel, then the trailing reset, tail and hiding kernels
    auto ivc = std::make_shared<Chonk>(std::vector<CircuitKind>{ CircuitKind::App,
                                                                 CircuitKind::Kernel,
                                                                 CircuitKind::App,
                                                                 CircuitKind::Kernel,
                                                                 CircuitKind::Kernel,
                                                                 CircuitKind::HidingKernel });

    // construct a mock app_circuit
    construct_and_accumulate_mock_app(ivc);

    const ProgramMetadata metadata{ ivc };

    // Construct kernel_0; consists of a single oink recursive verification for app (plus databus/merge logic)
    construct_and_accumulate_mock_kernel(ivc);

    // construct a mock app_circuit
    construct_and_accumulate_mock_app(ivc);

    // Construct and accumulate another Kernel circuit
    construct_and_accumulate_mock_kernel(ivc);

    // Accumulate the trailing kernels
    construct_and_accumulate_trailing_kernels(ivc);

    auto proof = ivc->prove();
    {
        ChonkNativeVerifier verifier(ivc->get_hiding_kernel_vk_and_hash());
        EXPECT_TRUE(verifier.verify(proof));
    }
}

// VK pinning: the kernel VK built from the recursion constraints (production write-VK path) must match the VK
// from a real IVC run, for an init kernel verifying 1..MAX_APPS_PER_KERNEL leading apps.
TEST_F(HypernovaRecursionConstraintTest, GenerateInitKernelVKFromConstraints)
{
    BB_DISABLE_ASSERTS();
    for (size_t num_apps = 1; num_apps <= MAX_APPS_PER_KERNEL; ++num_apps) {
        auto expected_kernel_vk = real_init_kernel_vk(num_apps);
        auto kernel_vk = mock_kernel_vk(init_kernel_proof_types(num_apps));
        EXPECT_EQ(*kernel_vk, *expected_kernel_vk) << "init kernel VK mismatch for " << num_apps << " app(s)";
    }
}

// VK pinning for an inner kernel verifying the previous kernel plus 1..MAX_APPS_PER_KERNEL apps.
TEST_F(HypernovaRecursionConstraintTest, GenerateInnerKernelVKFromConstraints)
{
    BB_DISABLE_ASSERTS();
    for (size_t num_apps = 1; num_apps <= MAX_APPS_PER_KERNEL; ++num_apps) {
        auto expected_kernel_vk = real_inner_kernel_vk(num_apps);
        auto kernel_vk = mock_kernel_vk(inner_kernel_proof_types(num_apps));
        EXPECT_EQ(*kernel_vk, *expected_kernel_vk) << "inner kernel VK mismatch for " << num_apps << " app(s)";
    }
}

// VK pinning for a reset or tail kernel: verifies a single previous-kernel HN proof.
TEST_F(HypernovaRecursionConstraintTest, GenerateResetTailKernelVKFromConstraints)
{
    BB_DISABLE_ASSERTS();
    auto expected_kernel_vk = real_reset_tail_kernel_vk();
    auto kernel_vk = mock_kernel_vk({ PROOF_TYPE::HN });
    EXPECT_EQ(*kernel_vk, *expected_kernel_vk);
}

// VK pinning for the hiding kernel (MegaZK), which verifies the tail kernel's HN_FINAL proof.
TEST_F(HypernovaRecursionConstraintTest, GenerateHidingKernelVKFromConstraints)
{
    BB_DISABLE_ASSERTS();
    auto expected_hiding_kernel_vk = real_hiding_kernel_vk();
    auto kernel_vk = mock_hiding_kernel_vk();
    EXPECT_EQ(*kernel_vk, *expected_hiding_kernel_vk);
}

/**
 * @brief Test IVC accumulation of a one app and one kernel. The app includes a UltraHonk Recursive Verifier.
 */
TEST_F(HypernovaRecursionConstraintTest, RecursiveVerifierAppCircuit)
{
    auto ivc = std::make_shared<Chonk>(std::vector<CircuitKind>{
        CircuitKind::App, CircuitKind::Kernel, CircuitKind::Kernel, CircuitKind::HidingKernel });

    // construct a mock app_circuit with an UH recursion call
    Builder app_circuit = construct_mock_UH_recursion_app_circuit(ivc, /*tamper_vk=*/false);

    // Complete instance and generate an oink proof
    {
        ivc->accumulate(app_circuit, make_circuit_vk(app_circuit, ivc->current_kind()));
    }

    // Construct kernel consisting only of the kernel completion logic
    construct_and_accumulate_mock_kernel(ivc);

    construct_and_accumulate_trailing_kernels(ivc);

    auto proof = ivc->prove();
    {
        ChonkNativeVerifier verifier(ivc->get_hiding_kernel_vk_and_hash());
        EXPECT_TRUE(verifier.verify(proof));
    }
}

/**
 * @brief Test IVC accumulation of a one app and one kernel. The app includes a UltraHonk Recursive Verifier that
 * verifies an invalid proof.
 */
TEST_F(HypernovaRecursionConstraintTest, RecursiveVerifierAppCircuitFailure)
{
    BB_DISABLE_ASSERTS(); // Disable assert in HN prover

    auto ivc = std::make_shared<Chonk>(std::vector<CircuitKind>{
        CircuitKind::App, CircuitKind::Kernel, CircuitKind::Kernel, CircuitKind::HidingKernel });

    // construct and accumulate mock app_circuit that has bad pairing point object
    Builder app_circuit = construct_mock_UH_recursion_app_circuit(ivc, /*tamper_vk=*/true);
    {
        ivc->accumulate(app_circuit, make_circuit_vk(app_circuit, ivc->current_kind()));
    }

    // Construct kernel consisting only of the kernel completion logic
    construct_and_accumulate_mock_kernel(ivc);

    // add the trailing kernels
    construct_and_accumulate_trailing_kernels(ivc);

    // We expect the Chonk proof to fail due to the app with a failed UH recursive verification
    auto proof = ivc->prove();
    {
        ChonkNativeVerifier verifier(ivc->get_hiding_kernel_vk_and_hash());
        EXPECT_FALSE(verifier.verify(proof));
    }
}

/**
 * @brief Pin gate, ECC-row and ultra-op counts for an init kernel verifying 1..MAX_APPS_PER_KERNEL apps.
 */
TEST_F(HypernovaRecursionConstraintTest, InitKernelGateCount)
{
    BB_DISABLE_ASSERTS();
    for (size_t num_apps = 1; num_apps <= MAX_APPS_PER_KERNEL; ++num_apps) {
        auto counts = mock_kernel_gate_counts(init_kernel_proof_types(num_apps));
        EXPECT_EQ(counts.num_opcodes, num_apps) << "init kernel, " << num_apps << " app(s)";
        EXPECT_EQ(counts.gate_count, INIT_KERNEL_GATE_COUNT[num_apps - 1]) << "init kernel, " << num_apps << " app(s)";
        EXPECT_EQ(counts.ecc_rows, INIT_KERNEL_ECC_ROWS[num_apps - 1] + MSM_ROWS_OFFSET)
            << "init kernel, " << num_apps << " app(s)";
        EXPECT_EQ(counts.ultra_ops, INIT_KERNEL_ULTRA_OPS[num_apps - 1]) << "init kernel, " << num_apps << " app(s)";
    }
}

/**
 * @brief Pin gate, ECC-row and ultra-op counts for an inner kernel verifying the previous kernel plus
 * 1..MAX_APPS_PER_KERNEL apps.
 */
TEST_F(HypernovaRecursionConstraintTest, InnerKernelGateCount)
{
    BB_DISABLE_ASSERTS();
    for (size_t num_apps = 1; num_apps <= MAX_APPS_PER_KERNEL; ++num_apps) {
        auto counts = mock_kernel_gate_counts(inner_kernel_proof_types(num_apps));
        EXPECT_EQ(counts.num_opcodes, num_apps + 1) << "inner kernel, " << num_apps << " app(s)";
        EXPECT_EQ(counts.gate_count, INNER_KERNEL_GATE_COUNT[num_apps - 1])
            << "inner kernel, " << num_apps << " app(s)";
        EXPECT_EQ(counts.ecc_rows, INNER_KERNEL_ECC_ROWS[num_apps - 1] + MSM_ROWS_OFFSET)
            << "inner kernel, " << num_apps << " app(s)";
        EXPECT_EQ(counts.ultra_ops, INNER_KERNEL_ULTRA_OPS[num_apps - 1]) << "inner kernel, " << num_apps << " app(s)";
    }
}

/**
 * @brief Pin gate, ECC-row and ultra-op counts for a reset/tail kernel.
 */
TEST_F(HypernovaRecursionConstraintTest, ResetTailKernelGateCount)
{
    BB_DISABLE_ASSERTS();
    auto counts = mock_kernel_gate_counts({ PROOF_TYPE::HN });
    EXPECT_EQ(counts.num_opcodes, 1U);
    EXPECT_EQ(counts.gate_count, RESET_TAIL_KERNEL_GATE_COUNT);
    EXPECT_EQ(counts.ecc_rows, RESET_TAIL_KERNEL_ECC_ROWS + MSM_ROWS_OFFSET);
    EXPECT_EQ(counts.ultra_ops, RESET_TAIL_KERNEL_ULTRA_OPS);
}

/**
 * @brief Pin the hiding kernel gate count, ECC-row and ultra-op usage. The hiding kernel's batch-merge recursive
 * verifier is sized for CHONK_MAX_NUM_CIRCUITS.
 */
TEST_F(HypernovaRecursionConstraintTest, HidingKernelGateCount)
{
    BB_DISABLE_ASSERTS();
<<<<<<< HEAD
    auto counts = mock_kernel_gate_counts({ PROOF_TYPE::HN_FINAL });
    EXPECT_EQ(counts.num_opcodes, 1U);
    EXPECT_EQ(counts.gate_count, HIDING_KERNEL_GATE_COUNT);
    EXPECT_EQ(counts.ecc_rows, HIDING_KERNEL_ECC_ROWS + MSM_ROWS_OFFSET);
    EXPECT_EQ(counts.ultra_ops, bb::HIDING_KERNEL_ULTRA_OPS);
=======
    auto ivc = std::make_shared<Chonk>(/*num_circuits=*/5);

    // Mock the state where we need to verify a hiding kernel proof
    acir_format::mock_chonk_accumulation(ivc, Chonk::QUEUE_TYPE::HN_FINAL, /*is_kernel=*/true);

    // Construct kernel program with gate counting enabled
    AcirProgram program = construct_mock_kernel_program(ivc->verification_queue);
    ProgramMetadata metadata{ .ivc = ivc, .collect_gates_per_opcode = true };

    auto kernel = acir_format::create_circuit<Builder>(program, metadata);

    // Verify the gate count was recorded
    EXPECT_EQ(program.constraints.gates_per_opcode.size(), 1);

    // Assert gate count
    EXPECT_EQ(program.constraints.gates_per_opcode[0], HIDING_KERNEL_GATE_COUNT);

    // Assert ECC row count
    size_t actual_ecc_rows = kernel.op_queue->get_num_rows();
    EXPECT_EQ(actual_ecc_rows, HIDING_KERNEL_ECC_ROWS);

    // Assert ultra ops count
    size_t actual_ultra_ops = kernel.op_queue->get_current_subtable_size();
    EXPECT_EQ(actual_ultra_ops, acir_format::HIDING_KERNEL_ULTRA_OPS);
>>>>>>> origin/v5-next
}

// =====================================================================================
// Boundary check failure tests - verify that invalid inputs are rejected
// =====================================================================================

/**
 * @brief Test that mismatched constraints/indices sizes are rejected
 */
TEST_F(HypernovaRecursionConstraintTest, FailsOnConstraintIndicesSizeMismatch)
{
    auto ivc = create_mock_chonk_from_constraints(make_hn_recursion_constraints({ PROOF_TYPE::OINK }));

    AcirProgram program = construct_mock_kernel_program(ivc);

    // Corrupt the opcode indices to have wrong size
    program.constraints.original_opcode_indices.hn_recursion_constraints.push_back(999);

    ProgramMetadata metadata{ .ivc = ivc };

    EXPECT_THROW_WITH_MESSAGE(acir_format::create_circuit<Builder>(program, metadata),
                              "hn_recursion_data constraints/indices size mismatch");
}

/**
 * @brief Test that ACIR constraints vs IVC queue size mismatch is rejected
 */
TEST_F(HypernovaRecursionConstraintTest, FailsOnAcirQueueSizeMismatch)
{
    auto ivc = create_mock_chonk_from_constraints(make_hn_recursion_constraints({ PROOF_TYPE::OINK }));

    AcirProgram program = construct_mock_kernel_program(ivc);

    // Add an extra constraint that doesn't exist in the IVC queue
    program.constraints.hn_recursion_constraints.push_back(program.constraints.hn_recursion_constraints[0]);
    program.constraints.original_opcode_indices.hn_recursion_constraints.push_back(1);

    ProgramMetadata metadata{ .ivc = ivc };

    EXPECT_THROW_WITH_MESSAGE(acir_format::create_circuit<Builder>(program, metadata),
                              "mismatch in number of recursive verifications");
}

/**
 * @brief Test that non-empty public_inputs in HN constraint is rejected
 */
TEST_F(HypernovaRecursionConstraintTest, FailsOnNonEmptyPublicInputs)
{
    auto ivc = create_mock_chonk_from_constraints(make_hn_recursion_constraints({ PROOF_TYPE::OINK }));

    AcirProgram program = construct_mock_kernel_program(ivc);

    // Add public inputs to the constraint (which should be empty for HN)
    program.constraints.hn_recursion_constraints[0].public_inputs = { 0, 1, 2 };

    ProgramMetadata metadata{ .ivc = ivc };

    EXPECT_THROW_WITH_MESSAGE(acir_format::create_circuit<Builder>(program, metadata),
                              "unexpected non-empty public_inputs in HN constraint");
}

/**
 * @brief Test that proof_type mismatch between ACIR and IVC queue is rejected
 */
TEST_F(HypernovaRecursionConstraintTest, FailsOnProofTypeMismatch)
{
    auto ivc = create_mock_chonk_from_constraints(make_hn_recursion_constraints({ PROOF_TYPE::OINK }));

    AcirProgram program = construct_mock_kernel_program(ivc);

    // Change the proof type to something that doesn't match the IVC state: the init kernel's first app is
    // verified via an OINK proof, so an HN proof_type must be rejected by the circuit-kinds-derived cross-check.
    program.constraints.hn_recursion_constraints[0].proof_type = PROOF_TYPE::HN;

    ProgramMetadata metadata{ .ivc = ivc };

    EXPECT_THROW_WITH_MESSAGE(acir_format::create_circuit<Builder>(program, metadata),
                              "ACIR proof_type disagrees with circuit-kinds-derived state");
}
