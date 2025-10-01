#include "barretenberg/stdlib/protogalaxy_verifier/protogalaxy_recursive_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/protogalaxy/folding_test_utils.hpp"
#include "barretenberg/protogalaxy/protogalaxy_prover.hpp"
#include "barretenberg/protogalaxy/protogalaxy_verifier.hpp"
#include "barretenberg/stdlib/hash/blake3s/blake3s.hpp"
#include "barretenberg/stdlib/hash/pedersen/pedersen.hpp"
#include "barretenberg/stdlib/honk_verifier/decider_recursive_verifier.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/ultra_honk/decider_prover.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

auto& engine = bb::numeric::get_debug_randomness();

namespace bb::stdlib::recursion::honk {
class ProtogalaxyRecursiveTests : public testing::Test {
  public:
    // Recursive types: used to construct the circuit that performs folding verification
    using RecursiveFlavor = MegaRecursiveFlavor_<MegaCircuitBuilder>;
    using RecursiveBuilder = RecursiveFlavor::CircuitBuilder;
    using RecursiveVerifierInstance = RecursiveVerifierInstance_<RecursiveFlavor>;
    using RecursiveVerificationKey = RecursiveVerifierInstance::VerificationKey;
    using RecursiveVKAndHash = RecursiveVerifierInstance::VKAndHash;
    using RecursiveVerifierInstances = std::array<std::shared_ptr<RecursiveVerifierInstance>, NUM_INSTANCES>;
    using RecursiveFoldingVerifier = ProtogalaxyRecursiveVerifier_<RecursiveVerifierInstance>;
    using RecursiveFF = RecursiveFlavor::FF;
    using RecursiveCommitment = RecursiveFlavor::Commitment;
    // Native types: used to construct the circuit whose instance will be folded and whose folding will be recursively
    // verified
    using NativeFlavor = RecursiveFlavor::NativeFlavor;
    using NativeProverInstance = ProverInstance_<NativeFlavor>;
    using NativeVerifierInstance = ::bb::VerifierInstance_<NativeFlavor>;
    using NativeVerificationKey = NativeFlavor::VerificationKey;
    using NativeProver = UltraProver_<NativeFlavor>;
    using NativeVerifier = UltraVerifier_<NativeFlavor>;
    using NativeFoldingProver = ProtogalaxyProver_<NativeFlavor>;
    using NativeFoldingVerifier = ProtogalaxyVerifier_<NativeVerifierInstance>;
    using NativeBuilder = NativeFlavor::CircuitBuilder;
    using NativeCurve = bn254<NativeBuilder>;
    using Commitment = NativeFlavor::Commitment;
    using NativeFF = NativeFlavor::FF;
    using CommitmentKey = NativeFlavor::CommitmentKey;

    struct NativeFoldingData {
        std::shared_ptr<NativeProverInstance> prover_inst;
        std::shared_ptr<NativeVerifierInstance> verifier_inst;
    };

    struct RecursiveFoldingData {
        std::shared_ptr<RecursiveVerifierInstance> verifier_inst;
        std::shared_ptr<RecursiveVKAndHash> vk_and_hash;
    };

    enum class AccumulatorTamperingMode : uint8_t {
        None,
        Wires,
        Alphas,
        GateChallenges,
        RelationParameters,
        TargetSum,
    };

    enum class InstanceTamperingMode : uint8_t {
        None,
        Wires,
    };

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
    /**
     * @brief Create a non-trivial arbitrary inner circuit, the proof of which will be recursively verified
     *
     * @param builder
     * @param public_inputs
     * @param log_num_gates
     *
     * TODO(https://github.com/AztecProtocol/barretenberg/issues/744): make testing utility with functionality shared
     * amongst test files
     */
    static void create_function_circuit(NativeBuilder& builder,
                                        const size_t& log_num_gates = 9,
                                        const size_t& log_num_gates_with_public_inputs = 9)
    {
        using Fr = typename NativeCurve::ScalarField;
        using Fq = stdlib::bigfield<NativeBuilder, typename NativeCurve::BaseFieldNative::Params>;
        using byte_array_ct = typename NativeCurve::byte_array_ct;
        using FrNative = typename NativeCurve::ScalarFieldNative;

        // Create 2^log_n many add gates based on input log num gates
        MockCircuits::add_arithmetic_gates(builder, 1 << log_num_gates);

        // Create 2^log_n many add gates with public inputs based on input log num gates
        MockCircuits::add_arithmetic_gates_with_public_inputs(builder, 1 << log_num_gates_with_public_inputs);

        // Create lookup gates
        MockCircuits::add_lookup_gates(builder);

        // Create RAM gates
        MockCircuits::add_RAM_gates(builder);

        // Create ecc gates
        GoblinMockCircuits::add_some_ecc_op_gates(builder);

        // Arbitrary non-trivial arithmetic logic
        Fr a = Fr::from_witness(&builder, FrNative::random_element(&engine));
        Fr b = Fr::from_witness(&builder, FrNative::random_element(&engine));
        Fr c = Fr::from_witness(&builder, FrNative::random_element(&engine));

        for (size_t i = 0; i < 32; ++i) {
            a = (a * b) + b + a;
            a = a.madd(b, c);
        }

        // Pedersen hash
        [[maybe_unused]] auto ped_hash = pedersen_hash<NativeBuilder>::hash({ a, b });

        // Blake hash
        byte_array_ct to_hash(&builder, "nonsense test data");
        [[maybe_unused]] auto blake_hash = stdlib::Blake3s<NativeBuilder>::hash(to_hash);

        // Bigfield arithmetic
        FrNative bigfield_data = FrNative::random_element(&engine);
        FrNative bigfield_data_a{ bigfield_data.data[0], bigfield_data.data[1], 0, 0 };
        FrNative bigfield_data_b{ bigfield_data.data[2], bigfield_data.data[3], 0, 0 };

        Fq big_a(Fr::from_witness(&builder, bigfield_data_a.to_montgomery_form()), Fr::from_witness(&builder, 0));
        Fq big_b(Fr::from_witness(&builder, bigfield_data_b.to_montgomery_form()), Fr::from_witness(&builder, 0));

        [[maybe_unused]] Fq result = big_a * big_b;

        // Add default IO
        stdlib::recursion::honk::DefaultIO<NativeBuilder>::add_default(builder);
    };

    /**
     * @brief Get prover and verifier instances to be used in folding
     */
    static NativeFoldingData get_instance_data(const size_t& log_num_gates = 9,
                                               const size_t& log_num_gates_with_public_inputs = 9)
    {
        NativeBuilder builder;
        create_function_circuit(builder, log_num_gates, log_num_gates_with_public_inputs);

        auto prover_inst = std::make_shared<NativeProverInstance>(builder);
        auto honk_vk = std::make_shared<NativeVerificationKey>(prover_inst->get_precomputed());
        auto verifier_inst = std::make_shared<NativeVerifierInstance>(honk_vk);

        return NativeFoldingData{ .prover_inst = prover_inst, .verifier_inst = verifier_inst };
    }

    /**
     * @brief Get a valid accumulator by folding two valid instances
     */
    static NativeFoldingData get_accumulator_data(const size_t& log_num_gates = 9,
                                                  const size_t& log_num_gates_with_public_inputs = 9)
    {
        NativeFoldingData instances_1 = get_instance_data(log_num_gates, log_num_gates_with_public_inputs);
        NativeFoldingData instances_2 = get_instance_data(log_num_gates, log_num_gates_with_public_inputs);

        NativeFoldingProver folding_prover({ instances_1.prover_inst, instances_2.prover_inst },
                                           { instances_1.verifier_inst, instances_2.verifier_inst },
                                           std::make_shared<typename NativeFoldingProver::Transcript>());
        NativeFoldingVerifier folding_verifier({ instances_1.verifier_inst, instances_2.verifier_inst },
                                               std::make_shared<typename NativeFoldingVerifier::Transcript>());

        auto [prover_accumulator, folding_proof] = folding_prover.prove();
        auto verifier_accumulator = folding_verifier.verify_folding_proof(folding_proof);
        return NativeFoldingData{ .prover_inst = prover_accumulator, .verifier_inst = verifier_accumulator };
    }

    /**
     * @brief Create a recursive verifier instances from native ones
     */
    static RecursiveFoldingData create_recursive_folding_data(
        RecursiveBuilder& builder,
        const std::shared_ptr<NativeVerifierInstance>& verifier_instance_1,
        const std::shared_ptr<NativeVerifierInstance>& verifier_instance_2)
    {
        RecursiveFoldingData recursive_folding_data;
        // Turn first verifier instance into recursive instance
        recursive_folding_data.verifier_inst =
            std::make_shared<RecursiveVerifierInstance>(&builder, verifier_instance_1);
        if (verifier_instance_1->is_complete) {
            recursive_folding_data.verifier_inst->is_complete = true;
            // If the instance comes from a previous round of folding, we need to populate witness commitments, target
            // sum, gate challenge, relation parameters, and batching challenges
            for (auto [native_comm, rec_comm] :
                 zip_view(verifier_instance_1->witness_commitments.get_all(),
                          recursive_folding_data.verifier_inst->witness_commitments.get_all())) {
                rec_comm = RecursiveCommitment::from_witness(&builder, native_comm);
            }

            recursive_folding_data.verifier_inst->target_sum =
                RecursiveFF::from_witness(&builder, verifier_instance_1->target_sum);

            for (auto [native_relation_parameters, rec_relation_parameters] :
                 zip_view(verifier_instance_1->relation_parameters.get_to_fold(),
                          recursive_folding_data.verifier_inst->relation_parameters.get_to_fold())) {
                rec_relation_parameters = RecursiveFF::from_witness(&builder, native_relation_parameters);
            }

            for (auto [native_alpha, rec_alphas] :
                 zip_view(verifier_instance_1->alphas, recursive_folding_data.verifier_inst->alphas)) {
                rec_alphas = RecursiveFF::from_witness(&builder, native_alpha);
            }

            for (auto [native_gate_challenge, rec_gate_challenge] : zip_view(
                     verifier_instance_1->gate_challenges, recursive_folding_data.verifier_inst->gate_challenges)) {
                rec_gate_challenge = RecursiveFF::from_witness(&builder, native_gate_challenge);
            }
        }
        recursive_folding_data.verifier_inst->target_sum =
            RecursiveFF::from_witness(&builder, verifier_instance_1->target_sum);
        recursive_folding_data.vk_and_hash = std::make_shared<RecursiveVKAndHash>(builder, verifier_instance_2->vk);

        return recursive_folding_data;
    }

    /**
     * @brief Create the circuit that verifies the folding proof. Return the circuit, the hash of the folded
     * verifier accumulator computed in-circuit, and the verifier transcript.
     */
    static std::pair<typename RecursiveVerifierInstance::NativeFF,
                     std::shared_ptr<RecursiveFoldingVerifier::Transcript>>
    create_folding_circuit(RecursiveBuilder& builder,
                           const NativeFoldingData& folding_data_1,
                           const NativeFoldingData& folding_data_2,
                           const HonkProof& folding_proof)
    {
        // Instantiate recursive verifier instances
        auto recursive_folding_data =
            create_recursive_folding_data(builder, folding_data_1.verifier_inst, folding_data_2.verifier_inst);
        // Instantiate recursive folding proof
        stdlib::Proof<RecursiveBuilder> recursive_folding_proof(builder, folding_proof);
        // Instantiate folding verifier transcript
        auto recursive_transcript = std::make_shared<typename RecursiveFoldingVerifier::Transcript>();
        recursive_transcript->enable_manifest();
        if (folding_data_1.verifier_inst->is_complete) {
            // In this case we need to add the accumulator verifier instance to the transcript to ensure its origin is
            // properly tracked, otherwise in the protocol the recursive folding verifier interacts with values that it
            // has never seen before (because Oink is not run on an accumulator)
            auto accumulator_hash =
                recursive_folding_data.verifier_inst->hash_through_transcript("-", *recursive_transcript);
            recursive_transcript->add_to_hash_buffer("accumulator_hash", accumulator_hash);
        }
        // Instatiate recursive folding verifier
        RecursiveFoldingVerifier recursive_folding_verifier(
            &builder, recursive_folding_data.verifier_inst, recursive_folding_data.vk_and_hash, recursive_transcript);
        // Recursively verify folding proof
        auto folded_verifier_instance = recursive_folding_verifier.verify_folding_proof(recursive_folding_proof);

        return { folded_verifier_instance->hash_through_transcript("-", *recursive_transcript).get_value(),
                 recursive_transcript };
    }

    /**
     * @brief Perform the folding natively for comparison with the in-circuit one. Return the hash of the folded
     * verifier accumulator and the verifier transcript.
     */
    static std::tuple<std::shared_ptr<NativeVerifierInstance>,
                      typename NativeVerifierInstance::FF,
                      std::shared_ptr<typename NativeFoldingVerifier::Transcript>>
    perfom_native_folding(const NativeFoldingData& folding_data_1,
                          const NativeFoldingData& folding_data_2,
                          const HonkProof& folding_proof)
    {
        auto native_transcript = std::make_shared<NativeFoldingVerifier::Transcript>();
        native_transcript->enable_manifest();
        if (folding_data_1.verifier_inst->is_complete) {
            auto accumulator_hash = folding_data_1.verifier_inst->hash_through_transcript("-", *native_transcript);
            native_transcript->add_to_hash_buffer("accumulator_hash", accumulator_hash);
        }
        NativeFoldingVerifier folding_verifier({ folding_data_1.verifier_inst, folding_data_2.verifier_inst },
                                               native_transcript);
        auto native_folded_verifier_accumulator = folding_verifier.verify_folding_proof(folding_proof);

        // We don't have an equality operator for NativeVerifierInstances, so we check that the hashes are equal
        return { native_folded_verifier_accumulator,
                 native_folded_verifier_accumulator->hash_through_transcript("-", *native_transcript),
                 native_transcript };
    }

    /**
     * @brief Tamper with an accumulator by changing one of its values: wires, alphas, gate challenge, relation
     * parameters, or target sum. Update both the prover and verifier side.
     */
    static void tamper_with_accumulator(const NativeFoldingData& accumulator,
                                        const AccumulatorTamperingMode& mode,
                                        bool expected)
    {
        bool is_valid = true;

        accumulator.prover_inst->commitment_key =
            CommitmentKey(accumulator.prover_inst->get_precomputed().metadata.dyadic_size);

        switch (mode) {
        case AccumulatorTamperingMode::None:
            // No tampering
            is_valid = check_accumulator_target_sum_manual(accumulator.prover_inst);
            break;
        case AccumulatorTamperingMode::Wires:
            accumulator.prover_inst->polynomials.w_l.at(1) += NativeFF(1);
            accumulator.verifier_inst->witness_commitments.get_wires()[0] =
                accumulator.prover_inst->commitment_key.commit(accumulator.prover_inst->polynomials.w_l);
            is_valid = check_accumulator_target_sum_manual(accumulator.prover_inst);
            break;
        case AccumulatorTamperingMode::Alphas:
            accumulator.prover_inst->alphas[1] +=
                NativeFF(150); // Second subrelation is zero for the mock circuits constructed here
            accumulator.verifier_inst->alphas[1] = accumulator.prover_inst->alphas[1];
            is_valid = check_accumulator_target_sum_manual(accumulator.prover_inst);
            break;
        case AccumulatorTamperingMode::GateChallenges:
            accumulator.prover_inst->gate_challenges[0] += NativeFF(42);
            accumulator.verifier_inst->gate_challenges[0] = accumulator.prover_inst->gate_challenges[0];
            is_valid = check_accumulator_target_sum_manual(accumulator.prover_inst);
            break;
        case AccumulatorTamperingMode::RelationParameters:
            accumulator.prover_inst->relation_parameters.get_to_fold()[0] += NativeFF(3009);
            accumulator.verifier_inst->relation_parameters.get_to_fold()[0] =
                accumulator.prover_inst->relation_parameters.get_to_fold()[0];
            is_valid = check_accumulator_target_sum_manual(accumulator.prover_inst);
            break;
        case AccumulatorTamperingMode::TargetSum:
            accumulator.prover_inst->target_sum += NativeFF(2025);
            accumulator.verifier_inst->target_sum = accumulator.prover_inst->target_sum;
            is_valid = check_accumulator_target_sum_manual(accumulator.prover_inst);
            break;
        }

        EXPECT_EQ(is_valid, expected);
    }

    /**
     * @brief Tamper with an instance by changing its wire values.
     */
    static void tamper_with_instance(const NativeFoldingData& instance, const InstanceTamperingMode& mode)
    {
        auto run_oink_and_reset = [&instance]() {
            OinkProver<NativeFlavor> oink_prover(
                instance.prover_inst, std::make_shared<NativeVerificationKey>(instance.prover_inst->get_precomputed()));
            oink_prover.prove();
            // Reset so that PG runs Oink on this instance
            instance.prover_inst->is_complete = false;
        };

        bool is_valid = true;

        switch (mode) {
        case InstanceTamperingMode::None:
            // No tampering
            break;
        case InstanceTamperingMode::Wires:
            instance.prover_inst->polynomials.w_l.at(1) += NativeFF(1);
            run_oink_and_reset();
            is_valid = check_accumulator_target_sum_manual(instance.prover_inst);
            break;
        }

        bool expected = mode == InstanceTamperingMode::None;
        EXPECT_EQ(is_valid, expected);
    }

    static bool run_decider(std::shared_ptr<NativeProverInstance>& folded_prover_inst,
                            std::shared_ptr<NativeVerifierInstance>& folded_verifier_inst)
    {
        // Generate decider proof
        DeciderProver_<NativeFlavor> decider_prover(folded_prover_inst);
        decider_prover.construct_proof();
        HonkProof decider_proof = decider_prover.export_proof();

        // Natively verify the decider proof
        DeciderVerifier_<NativeFlavor> decider_verifier(folded_verifier_inst);
        bool result = decider_verifier.verify_proof(decider_proof).check();

        return result;
    }

    static void protogalaxy_testing(const AccumulatorTamperingMode& accumulator_mode,
                                    const InstanceTamperingMode& instance_mode,
                                    const AccumulatorTamperingMode& folded_accumulator_mode,
                                    const size_t& log_num_gates = 9,
                                    const size_t& log_num_gates_with_public_inputs = 9)
    {
        NativeFoldingData accumulator = get_accumulator_data();
        NativeFoldingData instance = get_instance_data(log_num_gates, log_num_gates_with_public_inputs);
        tamper_with_accumulator(
            accumulator, accumulator_mode, /*expected=*/accumulator_mode == AccumulatorTamperingMode::None);
        tamper_with_instance(instance, instance_mode);

        // Fold
        auto folding_prover_transcript = std::make_shared<typename NativeFoldingProver::Transcript>();
        if (accumulator.verifier_inst->is_complete) {
            auto accumulator_hash = accumulator.verifier_inst->hash_through_transcript("-", *folding_prover_transcript);
            folding_prover_transcript->add_to_hash_buffer("accumulator_hash", accumulator_hash);
        }
        NativeFoldingProver folding_prover({ accumulator.prover_inst, instance.prover_inst },
                                           { accumulator.verifier_inst, instance.verifier_inst },
                                           folding_prover_transcript);
        auto [folded_accumulator, folding_proof] = folding_prover.prove();

        // Construct the circuit that recursively verifies the folding proof
        RecursiveBuilder builder;
        auto [folded_verifier_accumulator_hash, recursive_transcript] =
            create_folding_circuit(builder, accumulator, instance, folding_proof);

        // Check that the circuit is satisfied
        EXPECT_TRUE(CircuitChecker::check(builder)) << "Builder error: " << builder.err();

        // Verify that the native folding result matches the recursive one. As NativeVerifierInstance doesn't have
        // operator==, we check that the hashes match
        auto [native_folded_verifier_accumulator, native_folded_verifier_accumulator_hash, native_transcript] =
            perfom_native_folding(accumulator, instance, folding_proof);
        EXPECT_EQ(folded_verifier_accumulator_hash, native_folded_verifier_accumulator_hash)
            << "Native and recursive hashes don't match.";

        // Verify that the transcripts of recursive and native verifiers match
        auto native_manifest = native_transcript->get_manifest();
        auto recursive_manifest = recursive_transcript->get_manifest();
        EXPECT_EQ(native_manifest.size(), recursive_manifest.size());
        BB_ASSERT_GT(native_manifest.size(), 0UL);
        for (size_t idx = 0; idx < native_manifest.size(); idx++) {
            EXPECT_EQ(recursive_manifest[idx], native_manifest[idx])
                << "Recursive Verifier/Verifier manifest discrepency in round " << idx;
        }

        // Verify that if one of the accumulated instances was invalid, then the folded instance is invalid. We use the
        // native folded instance because we have already checked that the native and in-circuit computed one agree
        tamper_with_accumulator(NativeFoldingData{ folded_accumulator, native_folded_verifier_accumulator },
                                folded_accumulator_mode,
                                /*expected=*/
                                accumulator_mode == AccumulatorTamperingMode::None &&
                                    instance_mode == InstanceTamperingMode::None &&
                                    folded_accumulator_mode == AccumulatorTamperingMode::None);
        bool is_folded_accumulator_valid = run_decider(folded_accumulator, native_folded_verifier_accumulator);
        EXPECT_EQ(is_folded_accumulator_valid,
                  accumulator_mode == AccumulatorTamperingMode::None && instance_mode == InstanceTamperingMode::None &&
                      folded_accumulator_mode == AccumulatorTamperingMode::None);
    }
};

TEST_F(ProtogalaxyRecursiveTests, ValidFolding)
{
    protogalaxy_testing(AccumulatorTamperingMode::None, InstanceTamperingMode::None, AccumulatorTamperingMode::None);
}

TEST_F(ProtogalaxyRecursiveTests, FoldCircuitsOfDifferentSize)
{
    protogalaxy_testing(
        AccumulatorTamperingMode::None, InstanceTamperingMode::None, AccumulatorTamperingMode::None, 10, 10);
}

TEST_F(ProtogalaxyRecursiveTests, WiresIncomingAccumulator)
{
    protogalaxy_testing(AccumulatorTamperingMode::Wires, InstanceTamperingMode::None, AccumulatorTamperingMode::None);
}

TEST_F(ProtogalaxyRecursiveTests, AlphasIncomingAccumulator)
{
    protogalaxy_testing(AccumulatorTamperingMode::Alphas, InstanceTamperingMode::None, AccumulatorTamperingMode::None);
}

TEST_F(ProtogalaxyRecursiveTests, GateChallengesIncomingAccumulator)
{
    protogalaxy_testing(
        AccumulatorTamperingMode::GateChallenges, InstanceTamperingMode::None, AccumulatorTamperingMode::None);
}

TEST_F(ProtogalaxyRecursiveTests, RelationParametersIncomingAccumulator)
{
    protogalaxy_testing(
        AccumulatorTamperingMode::RelationParameters, InstanceTamperingMode::None, AccumulatorTamperingMode::None);
}

TEST_F(ProtogalaxyRecursiveTests, TargetSumIncomingAccumulator)
{
    protogalaxy_testing(
        AccumulatorTamperingMode::TargetSum, InstanceTamperingMode::None, AccumulatorTamperingMode::None);
}

TEST_F(ProtogalaxyRecursiveTests, WiresIncomingInstance)
{
    protogalaxy_testing(AccumulatorTamperingMode::None, InstanceTamperingMode::Wires, AccumulatorTamperingMode::None);
}

TEST_F(ProtogalaxyRecursiveTests, WiresFoldedAccumulator)
{
    protogalaxy_testing(AccumulatorTamperingMode::None, InstanceTamperingMode::None, AccumulatorTamperingMode::Wires);
}

TEST_F(ProtogalaxyRecursiveTests, AlphasFoldedAccumulator)
{
    protogalaxy_testing(AccumulatorTamperingMode::None, InstanceTamperingMode::None, AccumulatorTamperingMode::Alphas);
}

TEST_F(ProtogalaxyRecursiveTests, GateChallengesFoldedAccumulator)
{
    protogalaxy_testing(
        AccumulatorTamperingMode::None, InstanceTamperingMode::None, AccumulatorTamperingMode::GateChallenges);
}

TEST_F(ProtogalaxyRecursiveTests, RelationParametersFoldedAccumulator)
{
    protogalaxy_testing(
        AccumulatorTamperingMode::None, InstanceTamperingMode::None, AccumulatorTamperingMode::RelationParameters);
}

TEST_F(ProtogalaxyRecursiveTests, TargetSumFoldedAccumulator)
{
    protogalaxy_testing(
        AccumulatorTamperingMode::None, InstanceTamperingMode::None, AccumulatorTamperingMode::TargetSum);
}

} // namespace bb::stdlib::recursion::honk
