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
#include "barretenberg/ultra_honk/oink_verifier.hpp"
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

    enum class ProofTamperingMode : uint8_t {
        None,
        Perturbator,
        CombinerQuotient,
    };

    static constexpr size_t INDEX_FIRST_PERTURBATOR_COEFF = 624;
    static constexpr size_t INDEX_FIRST_COMBINER_QUOTIENT_COEFF = 644;

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
    /**
     * @brief Create a non-trivial arbitrary inner circuit, the proof of which will be recursively verified
     */
    static void create_function_circuit(NativeBuilder& builder,
                                        const size_t& log_num_gates = 9,
                                        const size_t& log_num_gates_with_public_inputs = 9)
    {
        using FrNative = typename NativeCurve::ScalarFieldNative;
        using Fr = typename NativeCurve::ScalarField;
        using byte_array_ct = typename NativeCurve::byte_array_ct;

        ProtogalaxyTestUtils::create_function_circuit(builder, log_num_gates, log_num_gates_with_public_inputs);

        // Pedersen hash
        Fr a = Fr::from_witness(&builder, FrNative::random_element(&engine));
        Fr b = Fr::from_witness(&builder, FrNative::random_element(&engine));
        [[maybe_unused]] auto ped_hash = pedersen_hash<NativeBuilder>::hash({ a, b });

        // Blake hash
        byte_array_ct to_hash(&builder, "nonsense test data");
        [[maybe_unused]] auto blake_hash = stdlib::Blake3s<NativeBuilder>::hash(to_hash);
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
        // The first instance is always an accumulator, we need to populate witness commitments, target
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

        stdlib::Proof<RecursiveBuilder> recursive_folding_proof(builder, folding_proof);

        auto recursive_transcript = std::make_shared<typename RecursiveFoldingVerifier::Transcript>();
        recursive_transcript->enable_manifest();
        // We need to add the accumulator verifier instance to the transcript to ensure its origin is
        // properly tracked, otherwise in the protocol the recursive folding verifier interacts with values that it
        // has never seen before (because Oink is not run on an accumulator)
        auto accumulator_hash =
            recursive_folding_data.verifier_inst->hash_through_transcript("-", *recursive_transcript);
        recursive_transcript->add_to_hash_buffer("accumulator_hash", accumulator_hash);

        RecursiveFoldingVerifier recursive_folding_verifier(
            &builder, recursive_folding_data.verifier_inst, recursive_folding_data.vk_and_hash, recursive_transcript);

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
     * @brief Tamper with folding proof by changing either the first coefficient of the perturbator, or the first
     * coefficient of the combiner quotient.
     *
     * @param folding_proof
     * @param mode
     */
    static void tamper_with_folding_proof(HonkProof& folding_proof, const ProofTamperingMode& mode)
    {
        switch (mode) {
        case ProofTamperingMode::None:
            break;
        case ProofTamperingMode::Perturbator:
            folding_proof[INDEX_FIRST_PERTURBATOR_COEFF] += NativeFF(10);
            break;
        case ProofTamperingMode::CombinerQuotient:
            folding_proof[INDEX_FIRST_COMBINER_QUOTIENT_COEFF] += NativeFF(100);
            break;
        }
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
            // Tamper with each row to ensure a non-trivial (non-skippable) value is effected
            for (auto& val : prover_inst->polynomials.w_l.coeffs()) {
                val += NativeFF(1);
            }
            run_oink();
            is_valid = check_accumulator_target_sum_manual(prover_inst);
            // Reset so that PG runs Oink on this instance
            prover_inst->is_complete = false;
            break;
        }

        bool expected = mode == InstanceTamperingMode::None;
        EXPECT_EQ(is_valid, expected);
    }

    /**
     * @brief Testing function for PG recursive verifier.
     *
     * @details PG is a folding scheme \f$R \times R^acc \rightarrow R^acc\f$, which means that it is complete (if
     * Prover and Verifier follow the protocol on a valid accumulator `acc` and a valid instance `inst`, then the
     * resulting accumulator is valid), and knowledge sound (if the resulting accumulator `acc_new` is valid, then a
     * valid accumulator and a valid instance can be extracted whose folding gives `acc_new`). To test that our
     * implementation is correct, we test the following paths:
     *  - Valid `acc`, valid `inst` fold to valid accumulator
     *  - Invalid `acc`, valid `inst` fold to invalid accumulator
     *  - Valid `acc`, invalid `inst` fold to invalid accumulator
     *  - Valid `acc`, valid `inst`, invalid folding proof result in an invalid accumulator
     *  - Valid `acc`, valid `inst`, tampered folded accumulator `acc_new` results in decider failure
     *
     * Invalid accumulator `acc` means that `acc` does not belong to \f$R^acc\f$. An accumulator is given by \f$((\phi,
     * \beta, e), \omega)\f$ and it is valid if $cm(\omega) = \phi$ and \f$\sum pow_i(\beta) f_i(\omega) = e\f$. To
     * check if an accumulator is valid we therefore check these two conditions.
     *
     * The structure of the tests is as follows:
     *  1. Generate test data: accumulator `acc` and instance `inst`
     *  2. Tamper with accumulator or instance
     *  3. Fold `acc` and `inst` to `acc_new`
     *  4. Tamper with folding proof
     *  5. Construct circuit `C` that verifies the folding proof and check that it is a valid circuit
     *  6. Verify that native and recursive folding agree
     *  7. Verify that native and recursive transcripts agree
     *  8. Check that \f$cm(\omega) = \phi$ and that \f$\sum pow_i(\beta) f_i(\omega) = e\f$ for `acc_new` if nothing
     *     has been tampered with
     *  9. Tamper with folded result `acc_new`
     *  10. Check that the decider accepts/rejects based on the tampering
     *
     */
    static void protogalaxy_testing(const AccumulatorTamperingMode& accumulator_mode,
                                    const InstanceTamperingMode& instance_mode,
                                    const AccumulatorTamperingMode& folded_accumulator_mode,
                                    const ProofTamperingMode& proof_mode)
    {
        bool is_accumulator_tampering_mode = (accumulator_mode != AccumulatorTamperingMode::None);
        bool is_instance_tampering_mode = (instance_mode != InstanceTamperingMode::None);
        bool is_proof_tampering_mode = (proof_mode != ProofTamperingMode::None);
        bool is_folded_accumulator_tampering_mode = (folded_accumulator_mode != AccumulatorTamperingMode::None);
        bool is_no_tampering_mode = !(is_accumulator_tampering_mode || is_instance_tampering_mode ||
                                      is_folded_accumulator_tampering_mode || is_proof_tampering_mode);

        // 1. Build test data
        TupleOfKeys keys;
        ProtogalaxyTestUtils::construct_accumulator_and_add_to_tuple(keys, 0, TraceSettings{ SMALL_TEST_STRUCTURE });

        NativeBuilder native_builder;
        create_function_circuit(native_builder, 10, 10);
        ProtogalaxyTestUtils::construct_instances_and_add_to_tuple(
            keys, native_builder, 1, TraceSettings{ SMALL_TEST_STRUCTURE });

        // 2. Tampering
        tamper_with_accumulator(
            ProtogalaxyTestUtils::get_folding_data(keys, 0), accumulator_mode, !is_accumulator_tampering_mode);
        tamper_with_instance(ProtogalaxyTestUtils::get_folding_data(keys, 1), instance_mode);

        // 3 .Fold
        auto [folded_accumulator, folding_proof] =
            ProtogalaxyTestUtils::fold(get<0>(keys), get<1>(keys), /*hash_accumulator=*/true);

        // 4. Tampering
        tamper_with_folding_proof(folding_proof, proof_mode);

        // 5. Construct the circuit that verifies the folding proof
        RecursiveBuilder builder;
        auto [folded_verifier_accumulator, recursive_transcript] =
            create_folding_circuit(builder, get<1>(keys), folding_proof);

        // Check circuit: not that it never fails as it simply performs a computation
        EXPECT_TRUE(CircuitChecker::check(builder)) << "Builder check failed. Error: " << builder.err();

        // 6. Native folding = Recursive folding
        auto [native_folded_verifier_accumulator, native_transcript] =
            ProtogalaxyTestUtils::verify_folding_proof(get<1>(keys), folding_proof, /*hash_accumulator=*/true);
        auto [compare_verifiers, msg_verifiers] =
            ProtogalaxyTestUtils::compare_accumulators(folded_verifier_accumulator, native_folded_verifier_accumulator);
        EXPECT_TRUE(compare_verifiers) << msg_verifiers;

        // 7. Verify that native and recursive transcripts match
        auto native_manifest = native_transcript->get_manifest();
        auto recursive_manifest = recursive_transcript->get_manifest();
        EXPECT_EQ(native_manifest.size(), recursive_manifest.size());
        BB_ASSERT_GT(native_manifest.size(), 0UL);
        for (size_t idx = 0; idx < native_manifest.size(); idx++) {
            EXPECT_EQ(recursive_manifest[idx], native_manifest[idx])
                << "Recursive Verifier/Verifier manifest discrepency in round " << idx;
        }

        // 8. Check that prover and verifier hold the same data if nothing has been tampered with
        // Note that as our PG prover folds assuming that the incoming instance is valid, at this point Prover and
        // Verifier still hold the same data. However, the decider will spot that the Prover has folded an invalid
        // instance while claiming it was valid.
        auto [compare_prover_verifier, msg_prover_verifier] =
            ProtogalaxyTestUtils::compare_accumulators(folded_accumulator, native_folded_verifier_accumulator);
        EXPECT_EQ(compare_prover_verifier, !(is_accumulator_tampering_mode || is_proof_tampering_mode))
            << msg_prover_verifier;

        // 9. Tamper with the accumulator
        // Note that checking whether the target sum of the accumulator is equal to the sum of the relation
        // contributions across the rows returns false if and only either the incoming instance was invalid, or if the
        // accumulator itself has been tampered with. This is because a PG prover always returns an accumulator for
        // which the target sum is equal to the sum of the relation contributions across the rows unless the incoming
        // instance is invalid (meaning the sum of the relation contributions across the rows is not zero).
        tamper_with_accumulator(NativeFoldingData{ folded_accumulator, native_folded_verifier_accumulator },
                                folded_accumulator_mode,
                                !(is_instance_tampering_mode || is_folded_accumulator_tampering_mode));

        // 10. Run the decider. We use the native folded instance because we have already checked that the native and
        // in-circuit computed one agree
        bool is_folded_accumulator_valid =
            ProtogalaxyTestUtils::run_decider(folded_accumulator, native_folded_verifier_accumulator);
        EXPECT_EQ(is_folded_accumulator_valid, is_no_tampering_mode);
    }
};

TEST_F(ProtogalaxyRecursiveTests, ValidFolding)
{
    protogalaxy_testing(AccumulatorTamperingMode::None,
                        InstanceTamperingMode::None,
                        AccumulatorTamperingMode::None,
                        ProofTamperingMode::None);
}

TEST_F(ProtogalaxyRecursiveTests, WiresIncomingAccumulator)
{
    BB_DISABLE_ASSERTS(); // Disable assert in PG prover
    protogalaxy_testing(AccumulatorTamperingMode::Wires,
                        InstanceTamperingMode::None,
                        AccumulatorTamperingMode::None,
                        ProofTamperingMode::None);
}

TEST_F(ProtogalaxyRecursiveTests, AlphasIncomingAccumulator)
{
    BB_DISABLE_ASSERTS(); // Disable assert in PG prover
    protogalaxy_testing(AccumulatorTamperingMode::Alphas,
                        InstanceTamperingMode::None,
                        AccumulatorTamperingMode::None,
                        ProofTamperingMode::None);
}

TEST_F(ProtogalaxyRecursiveTests, GateChallengesIncomingAccumulator)
{
    BB_DISABLE_ASSERTS(); // Disable assert in PG prover
    protogalaxy_testing(AccumulatorTamperingMode::GateChallenges,
                        InstanceTamperingMode::None,
                        AccumulatorTamperingMode::None,
                        ProofTamperingMode::None);
}

TEST_F(ProtogalaxyRecursiveTests, RelationParametersIncomingAccumulator)
{
    BB_DISABLE_ASSERTS(); // Disable assert in PG prover
    protogalaxy_testing(AccumulatorTamperingMode::RelationParameters,
                        InstanceTamperingMode::None,
                        AccumulatorTamperingMode::None,
                        ProofTamperingMode::None);
}

TEST_F(ProtogalaxyRecursiveTests, TargetSumIncomingAccumulator)
{
    BB_DISABLE_ASSERTS(); // Disable assert in PG prover
    protogalaxy_testing(AccumulatorTamperingMode::TargetSum,
                        InstanceTamperingMode::None,
                        AccumulatorTamperingMode::None,
                        ProofTamperingMode::None);
}

TEST_F(ProtogalaxyRecursiveTests, WiresIncomingInstance)
{
    protogalaxy_testing(AccumulatorTamperingMode::None,
                        InstanceTamperingMode::Wires,
                        AccumulatorTamperingMode::None,
                        ProofTamperingMode::None);
}

TEST_F(ProtogalaxyRecursiveTests, WiresFoldedAccumulator)
{
    protogalaxy_testing(AccumulatorTamperingMode::None,
                        InstanceTamperingMode::None,
                        AccumulatorTamperingMode::Wires,
                        ProofTamperingMode::None);
}

TEST_F(ProtogalaxyRecursiveTests, AlphasFoldedAccumulator)
{
    protogalaxy_testing(AccumulatorTamperingMode::None,
                        InstanceTamperingMode::None,
                        AccumulatorTamperingMode::Alphas,
                        ProofTamperingMode::None);
}

TEST_F(ProtogalaxyRecursiveTests, GateChallengesFoldedAccumulator)
{
    protogalaxy_testing(AccumulatorTamperingMode::None,
                        InstanceTamperingMode::None,
                        AccumulatorTamperingMode::GateChallenges,
                        ProofTamperingMode::None);
}

TEST_F(ProtogalaxyRecursiveTests, RelationParametersFoldedAccumulator)
{
    protogalaxy_testing(AccumulatorTamperingMode::None,
                        InstanceTamperingMode::None,
                        AccumulatorTamperingMode::RelationParameters,
                        ProofTamperingMode::None);
}

TEST_F(ProtogalaxyRecursiveTests, TargetSumFoldedAccumulator)
{
    protogalaxy_testing(AccumulatorTamperingMode::None,
                        InstanceTamperingMode::None,
                        AccumulatorTamperingMode::TargetSum,
                        ProofTamperingMode::None);
}

TEST_F(ProtogalaxyRecursiveTests, PerturbatorCoefficient)
{
    protogalaxy_testing(AccumulatorTamperingMode::None,
                        InstanceTamperingMode::None,
                        AccumulatorTamperingMode::None,
                        ProofTamperingMode::Perturbator);
}

TEST_F(ProtogalaxyRecursiveTests, CombinerQuotientCoefficient)
{
    protogalaxy_testing(AccumulatorTamperingMode::None,
                        InstanceTamperingMode::None,
                        AccumulatorTamperingMode::None,
                        ProofTamperingMode::CombinerQuotient);
}

TEST_F(ProtogalaxyRecursiveTests, FixedCircuitSize)
{
    BB_DISABLE_ASSERTS();

    auto compute_circuit_size = [](const size_t log_num_gates) -> std::pair<size_t, NativeBuilder> {
        TupleOfKeys keys;

        // First instance
        TupleOfKeys keys_to_be_accumulated;

        NativeBuilder native_builder_1;
        create_function_circuit(native_builder_1, log_num_gates, log_num_gates);
        ProtogalaxyTestUtils::construct_instances_and_add_to_tuple(
            keys_to_be_accumulated, native_builder_1, 0, TraceSettings{ SMALL_TEST_STRUCTURE });

        NativeBuilder native_builder_2;
        create_function_circuit(native_builder_2, log_num_gates, log_num_gates);
        ProtogalaxyTestUtils::construct_instances_and_add_to_tuple(
            keys_to_be_accumulated, native_builder_2, 1, TraceSettings{ SMALL_TEST_STRUCTURE });

        auto [prover_instance, verifier_instance] =
            ProtogalaxyTestUtils::fold_and_verify(get<0>(keys_to_be_accumulated), get<1>(keys_to_be_accumulated));

        get<0>(keys)[0] = prover_instance;
        get<1>(keys)[0] = verifier_instance;

        // Second instance
        NativeBuilder native_builder_3;
        create_function_circuit(native_builder_3); // This circuit must be fixed, otherwise the circuit depends on the
                                                   // size of the Oink proofs
        ProtogalaxyTestUtils::construct_instances_and_add_to_tuple(
            keys, native_builder_3, 1, TraceSettings{ SMALL_TEST_STRUCTURE });

        auto [folded_accumulator, folding_proof] =
            ProtogalaxyTestUtils::fold(get<0>(keys), get<1>(keys), /*hash_accumulator=*/true);

        RecursiveBuilder builder;
        [[maybe_unused]] auto _ = create_folding_circuit(builder, get<1>(keys), folding_proof);

        EXPECT_TRUE(CircuitChecker::check(builder));

        return { folding_proof.size(), builder };
    };

    auto [proof_size_1, circuit_1] = compute_circuit_size(11);
    auto [proof_size_2, circuit_2] = compute_circuit_size(12);

    EXPECT_EQ(proof_size_1, proof_size_2);
    EXPECT_EQ(circuit_1.get_estimated_num_finalized_gates(), circuit_2.get_estimated_num_finalized_gates());
    EXPECT_EQ(circuit_1.blocks, circuit_2.blocks);
}

} // namespace bb::stdlib::recursion::honk
