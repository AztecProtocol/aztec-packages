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
    using ProtogalaxyTestUtils = ProtogalaxyTestUtilities<NativeFlavor>;
    using NativeProverInstance = ProtogalaxyTestUtils::ProverInstance;
    using NativeVerifierInstance = ProtogalaxyTestUtils::VerifierInstance;
    using NativeProverInstances = ProtogalaxyTestUtils::ProverInstances;
    using NativeVerifierInstances = ProtogalaxyTestUtils::VerifierInstances;
    using NativeVerificationKey = ProtogalaxyTestUtils::VerificationKey;
    using TupleOfKeys = ProtogalaxyTestUtils::TupleOfKeys;
    using NativeBuilder = ProtogalaxyTestUtils::Builder;
    using NativeFoldingData = ProtogalaxyTestUtils::FoldingData;
    using NativeFoldingProver = ProtogalaxyTestUtils::FoldingProver;
    using NativeFoldingVerifier = ProtogalaxyTestUtils::FoldingVerifier;
    using NativeCurve = bn254<NativeBuilder>;
    using Commitment = NativeFlavor::Commitment;
    using NativeFF = NativeFlavor::FF;
    using CommitmentKey = NativeFlavor::CommitmentKey;

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
     */
    static void create_function_circuit(NativeBuilder& builder,
                                        const size_t& log_num_gates = 9,
                                        const size_t& log_num_gates_with_public_inputs = 9)
    {
        // using FrNative = typename NativeCurve::ScalarFieldNative;
        // using Fr = typename NativeCurve::ScalarField;
        // using byte_array_ct = typename NativeCurve::byte_array_ct;

        ProtogalaxyTestUtils::create_function_circuit(builder, log_num_gates, log_num_gates_with_public_inputs);

        // // Pedersen hash
        // Fr a = Fr::from_witness(&builder, FrNative::random_element(&engine));
        // Fr b = Fr::from_witness(&builder, FrNative::random_element(&engine));
        // [[maybe_unused]] auto ped_hash = pedersen_hash<NativeBuilder>::hash({ a, b });

        // // Blake hash
        // byte_array_ct to_hash(&builder, "nonsense test data");
        // [[maybe_unused]] auto blake_hash = stdlib::Blake3s<NativeBuilder>::hash(to_hash);
    };

    /**
     * @brief Create a recursive verifier instances from native ones
     */
    static RecursiveFoldingData create_recursive_folding_data(RecursiveBuilder& builder,
                                                              const NativeVerifierInstances& verifier_instances)
    {
        RecursiveFoldingData recursive_folding_data;
        // Turn first verifier instance into recursive instance
        recursive_folding_data.verifier_inst =
            std::make_shared<RecursiveVerifierInstance>(&builder, verifier_instances[0]);
        recursive_folding_data.verifier_inst->is_complete = true;
        // If the instance comes from a previous round of folding, we need to populate witness commitments, target
        // sum, gate challenge, relation parameters, and batching challenges
        for (auto [native_comm, rec_comm] :
             zip_view(verifier_instances[0]->witness_commitments.get_all(),
                      recursive_folding_data.verifier_inst->witness_commitments.get_all())) {
            rec_comm = RecursiveCommitment::from_witness(&builder, native_comm);
        }

        recursive_folding_data.verifier_inst->target_sum =
            RecursiveFF::from_witness(&builder, verifier_instances[0]->target_sum);

        for (auto [native_relation_parameters, rec_relation_parameters] :
             zip_view(verifier_instances[0]->relation_parameters.get_to_fold(),
                      recursive_folding_data.verifier_inst->relation_parameters.get_to_fold())) {
            rec_relation_parameters = RecursiveFF::from_witness(&builder, native_relation_parameters);
        }

        for (auto [native_alpha, rec_alphas] :
             zip_view(verifier_instances[0]->alphas, recursive_folding_data.verifier_inst->alphas)) {
            rec_alphas = RecursiveFF::from_witness(&builder, native_alpha);
        }

        for (auto [native_gate_challenge, rec_gate_challenge] :
             zip_view(verifier_instances[0]->gate_challenges, recursive_folding_data.verifier_inst->gate_challenges)) {
            rec_gate_challenge = RecursiveFF::from_witness(&builder, native_gate_challenge);
        }
        recursive_folding_data.verifier_inst->target_sum =
            RecursiveFF::from_witness(&builder, verifier_instances[0]->target_sum);
        recursive_folding_data.vk_and_hash = std::make_shared<RecursiveVKAndHash>(builder, verifier_instances[1]->vk);

        return recursive_folding_data;
    }

    /**
     * @brief Create the circuit that verifies the folding proof. Return folded verifier accumulator and the verifier
     * transcript.
     *
     * @note We return a shared pointer to the folded verifier accumulator to be consistent with the rest of the code.
     *
     */
    static std::pair<std::shared_ptr<NativeVerifierInstance>, std::shared_ptr<RecursiveFoldingVerifier::Transcript>>
    create_folding_circuit(RecursiveBuilder& builder,
                           const NativeVerifierInstances& verifier_instances,
                           const HonkProof& folding_proof)
    {
        // Instantiate recursive verifier instances
        auto recursive_folding_data = create_recursive_folding_data(builder, verifier_instances);
        // Instantiate recursive folding proof
        stdlib::Proof<RecursiveBuilder> recursive_folding_proof(builder, folding_proof);
        // Instantiate folding verifier transcript
        auto recursive_transcript = std::make_shared<typename RecursiveFoldingVerifier::Transcript>();
        recursive_transcript->enable_manifest();
        // We need to add the accumulator verifier instance to the transcript to ensure its origin is
        // properly tracked, otherwise in the protocol the recursive folding verifier interacts with values that it
        // has never seen before (because Oink is not run on an accumulator)
        auto accumulator_hash =
            recursive_folding_data.verifier_inst->hash_through_transcript("-", *recursive_transcript);
        recursive_transcript->add_to_hash_buffer("accumulator_hash", accumulator_hash);
        // Instatiate recursive folding verifier
        RecursiveFoldingVerifier recursive_folding_verifier(
            &builder, recursive_folding_data.verifier_inst, recursive_folding_data.vk_and_hash, recursive_transcript);
        // Recursively verify folding proof
        auto folded_verifier_instance = recursive_folding_verifier.verify_folding_proof(recursive_folding_proof);

        return { std::make_shared<NativeVerifierInstance>(folded_verifier_instance->get_value()),
                 recursive_transcript };
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
        auto prover_inst = get<0>(accumulator);
        auto verifier_inst = get<1>(accumulator);

        prover_inst->commitment_key = CommitmentKey(prover_inst->get_precomputed().metadata.dyadic_size);

        switch (mode) {
        case AccumulatorTamperingMode::None:
            // No tampering
            is_valid = check_accumulator_target_sum_manual(prover_inst);
            break;
        case AccumulatorTamperingMode::Wires:
            prover_inst->polynomials.w_l.at(2) += NativeFF(1);
            verifier_inst->witness_commitments.get_wires()[0] =
                prover_inst->commitment_key.commit(prover_inst->polynomials.w_l);
            is_valid = check_accumulator_target_sum_manual(prover_inst);
            break;
        case AccumulatorTamperingMode::Alphas:
            prover_inst->alphas[1] +=
                NativeFF(150); // Second subrelation is zero for the mock circuits constructed here
            verifier_inst->alphas[1] = prover_inst->alphas[1];
            is_valid = check_accumulator_target_sum_manual(prover_inst);
            break;
        case AccumulatorTamperingMode::GateChallenges:
            prover_inst->gate_challenges[0] += NativeFF(42);
            verifier_inst->gate_challenges[0] = prover_inst->gate_challenges[0];
            is_valid = check_accumulator_target_sum_manual(prover_inst);
            break;
        case AccumulatorTamperingMode::RelationParameters:
            prover_inst->relation_parameters.get_to_fold()[0] += NativeFF(3009);
            verifier_inst->relation_parameters.get_to_fold()[0] = prover_inst->relation_parameters.get_to_fold()[0];
            is_valid = check_accumulator_target_sum_manual(prover_inst);
            break;
        case AccumulatorTamperingMode::TargetSum:
            prover_inst->target_sum += NativeFF(2025);
            verifier_inst->target_sum = prover_inst->target_sum;
            is_valid = check_accumulator_target_sum_manual(prover_inst);
            break;
        }

        EXPECT_EQ(is_valid, expected);
    }

    /**
     * @brief Tamper with an instance by changing its wire values.
     */
    static void tamper_with_instance(const NativeFoldingData& instance, const InstanceTamperingMode& mode)
    {
        auto prover_inst = get<0>(instance);

        auto run_oink = [&prover_inst]() {
            OinkProver<NativeFlavor> oink_prover(
                prover_inst, std::make_shared<NativeVerificationKey>(prover_inst->get_precomputed()));
            oink_prover.prove();
        };

        bool is_valid = true;

        switch (mode) {
        case InstanceTamperingMode::None:
            // No tampering
            break;
        case InstanceTamperingMode::Wires:
            prover_inst->polynomials.w_l.at(1) += NativeFF(1);
            run_oink();
            is_valid = check_accumulator_target_sum_manual(prover_inst);
            // Reset so that PG runs Oink on this instance
            prover_inst->is_complete = false;
            break;
        }

        bool expected = mode == InstanceTamperingMode::None;
        EXPECT_EQ(is_valid, expected);
    }

    static void compare_accumulators(const std::shared_ptr<NativeVerifierInstance>& lhs,
                                     const std::shared_ptr<NativeVerifierInstance>& rhs)
    {
        auto compare_iterators = []<typename T>(const T& lhs, const T& rhs, const std::string& label) {
            BB_ASSERT_EQ(lhs.size(), rhs.size(), "Mistmatch in the sizes of the " << label);
            for (size_t idx = 0; idx < lhs.size(); idx++) {
                EXPECT_EQ(lhs[idx], rhs[idx]) << "Mismatch in the " << label << " at index " << idx;
            }
        };

        BB_ASSERT_EQ(lhs->is_complete, rhs->is_complete);
        BB_ASSERT_EQ(lhs->is_complete, true);

        compare_iterators(lhs->alphas, rhs->alphas, "alphas");
        compare_iterators(
            lhs->relation_parameters.get_to_fold(), rhs->relation_parameters.get_to_fold(), "relation paramaters");
        compare_iterators(lhs->gate_challenges, rhs->gate_challenges, "gate challenges");
        compare_iterators(
            lhs->witness_commitments.get_all(), rhs->witness_commitments.get_all(), "witness commitments");
        compare_iterators(lhs->vk->get_all(), rhs->vk->get_all(), "vk commitments");
        BB_ASSERT_EQ(lhs->target_sum, rhs->target_sum, "Mismatch in target sum");
    }

    static void protogalaxy_testing(const AccumulatorTamperingMode& accumulator_mode,
                                    const InstanceTamperingMode& instance_mode,
                                    const AccumulatorTamperingMode& folded_accumulator_mode,
                                    const size_t& log_num_gates = 9,
                                    const size_t& log_num_gates_with_public_inputs = 9)
    {
        // Build test data
        TupleOfKeys keys;
        ProtogalaxyTestUtils::construct_accumulator_and_add_to_tuple(keys, 0);

        NativeBuilder native_builder;
        create_function_circuit(native_builder, log_num_gates, log_num_gates_with_public_inputs);
        ProtogalaxyTestUtils::construct_instances_and_add_to_tuple(keys, native_builder, 1);

        // Tampering
        tamper_with_accumulator(ProtogalaxyTestUtils::get_folding_data(keys, 0),
                                accumulator_mode,
                                /*expected=*/accumulator_mode == AccumulatorTamperingMode::None);
        tamper_with_instance(ProtogalaxyTestUtils::get_folding_data(keys, 1), instance_mode);

        // Fold
        auto [folded_accumulator, folding_proof] =
            ProtogalaxyTestUtils::fold(get<0>(keys), get<1>(keys), /*hash_accumulator=*/true);

        // Construct the circuit that recursively verifies the folding proof
        RecursiveBuilder builder;
        auto [folded_verifier_accumulator, recursive_transcript] =
            create_folding_circuit(builder, get<1>(keys), folding_proof);

        // Check that the circuit is satisfied
        EXPECT_TRUE(CircuitChecker::check(builder)) << "Builder error: " << builder.err();

        // Verify that the native folding result matches the recursive one.
        auto [native_folded_verifier_accumulator, native_transcript] =
            ProtogalaxyTestUtils::verify_folding_proof(get<1>(keys), folding_proof, /*hash_accumulator=*/true);
        compare_accumulators(folded_verifier_accumulator, native_folded_verifier_accumulator);

        // Verify that the transcripts of recursive and native verifiers match
        auto native_manifest = native_transcript->get_manifest();
        auto recursive_manifest = recursive_transcript->get_manifest();
        EXPECT_EQ(native_manifest.size(), recursive_manifest.size());
        BB_ASSERT_GT(native_manifest.size(), 0UL);
        for (size_t idx = 0; idx < native_manifest.size(); idx++) {
            EXPECT_EQ(recursive_manifest[idx], native_manifest[idx])
                << "Recursive Verifier/Verifier manifest discrepency in round " << idx;
        }

        // Tamper with the accumulator. Note that checking whether the target sum of the accumulator is equal to the sum
        // of the relation contributions across the rows returns false if and only either the incoming instance was
        // invalid, or if the accumulator itself has been tampered with. This is because a PG prover always returns an
        // accumulator for which the target sum is equal to the sum of the relation contributions across the rows unless
        // the incoming instance is invalid (meaning the sum of the relation contributions across the rows is not zero).
        tamper_with_accumulator(NativeFoldingData{ folded_accumulator, native_folded_verifier_accumulator },
                                folded_accumulator_mode,
                                /*expected=*/
                                instance_mode == InstanceTamperingMode::None &&
                                    folded_accumulator_mode == AccumulatorTamperingMode::None);

        // Verify that if one of the accumulated instances was invalid, or if the folded accumulator has
        // been tampered with, then the decider fails. We use the native folded instance because we have already checked
        // that the native and in-circuit computed one agree
        bool is_folded_accumulator_valid =
            ProtogalaxyTestUtils::run_decider(folded_accumulator, native_folded_verifier_accumulator);
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
