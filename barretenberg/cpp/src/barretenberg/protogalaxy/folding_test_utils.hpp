// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/polynomials/gate_separator.hpp"
#include "barretenberg/protogalaxy/protogalaxy_prover.hpp"
#include "barretenberg/protogalaxy/protogalaxy_prover_internal.hpp"
#include "barretenberg/protogalaxy/protogalaxy_verifier.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/ultra_honk/decider_prover.hpp"
#include "barretenberg/ultra_honk/decider_verifier.hpp"

namespace bb {

// Purely static class containing utility methods for protogalaxy testing
template <class Flavor> class ProtogalaxyTestUtilities {
  public:
    using Builder = Flavor::CircuitBuilder;
    using Curve = stdlib::bn254<Builder>;
    using ProverInstance = ProverInstance_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;
    using VerifierInstance = VerifierInstance_<Flavor>;
    using ProverInstances = std::array<std::shared_ptr<ProverInstance>, NUM_INSTANCES>;
    using VerifierInstances = std::array<std::shared_ptr<VerifierInstance>, NUM_INSTANCES>;
    using TupleOfKeys = std::tuple<ProverInstances, VerifierInstances>;
    using FoldingData = std::tuple<std::shared_ptr<ProverInstance>, std::shared_ptr<VerifierInstance>>;
    using FoldingProver = ProtogalaxyProver_<Flavor>;
    using FoldingVerifier = ProtogalaxyVerifier_<VerifierInstance>;
    using DeciderProver = DeciderProver_<Flavor>;
    using DeciderVerifier = DeciderVerifier_<Flavor>;
    using FoldingVerificationResult =
        std::tuple<std::shared_ptr<VerifierInstance>, std::shared_ptr<typename FoldingVerifier::Transcript>>;

    /**
     * @brief Create a circuit with the specified number of arithmetic gates and arithmetic gates with public inputs
     */
    static void create_function_circuit(Builder& builder,
                                        const size_t& log_num_gates = 9,
                                        const size_t& log_num_gates_with_public_inputs = 9)
    {
        using Fr = typename Curve::ScalarField;
        using Fq = stdlib::bigfield<Builder, typename Curve::BaseFieldNative::Params>;
        using FrNative = typename Curve::ScalarFieldNative;

        // Create 2^log_n many add gates based on input log num gates
        MockCircuits::add_arithmetic_gates(builder, 1 << log_num_gates);

        // Create 2^log_n many add gates with public inputs based on input log num gates
        MockCircuits::add_arithmetic_gates_with_public_inputs(builder, 1 << log_num_gates_with_public_inputs);

        // Create lookup gates
        MockCircuits::add_lookup_gates(builder);

        // Create RAM gates
        MockCircuits::add_RAM_gates(builder);

        if constexpr (IsMegaFlavor<Flavor>) {
            // Create ecc gates
            GoblinMockCircuits::add_some_ecc_op_gates(builder);
        }

        // Arbitrary non-trivial arithmetic logic
        Fr a = Fr::from_witness(&builder, FrNative::random_element(&engine));
        Fr b = Fr::from_witness(&builder, FrNative::random_element(&engine));
        Fr c = Fr::from_witness(&builder, FrNative::random_element(&engine));

        for (size_t i = 0; i < 32; ++i) {
            a = (a * b) + b + a;
            a = a.madd(b, c);
        }

        // Bigfield arithmetic
        FrNative bigfield_data = FrNative::random_element(&engine);
        FrNative bigfield_data_a{ bigfield_data.data[0], bigfield_data.data[1], 0, 0 };
        FrNative bigfield_data_b{ bigfield_data.data[2], bigfield_data.data[3], 0, 0 };

        Fq big_a(Fr::from_witness(&builder, bigfield_data_a.to_montgomery_form()), Fr::from_witness(&builder, 0));
        Fq big_b(Fr::from_witness(&builder, bigfield_data_b.to_montgomery_form()), Fr::from_witness(&builder, 0));

        [[maybe_unused]] Fq result = big_a * big_b;

        // Add default IO
        stdlib::recursion::honk::DefaultIO<Builder>::add_default(builder);
    };

    /**
     * @brief Construct Prover and Verifier instances for a provided circuit and add to tuple
     */
    static void construct_instances_and_add_to_tuple(TupleOfKeys& keys,
                                                     Builder& builder,
                                                     size_t idx = 0,
                                                     TraceSettings trace_settings = TraceSettings{})
    {

        auto prover_instance = std::make_shared<ProverInstance>(builder, trace_settings);
        auto verification_key = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
        auto verifier_instances = std::make_shared<VerifierInstance>(verification_key);
        get<0>(keys)[idx] = prover_instance;
        get<1>(keys)[idx] = verifier_instances;
    }

    /**
     * @brief Construct Prover and Verifier accumulators and add to tuple
     */
    static void construct_accumulator_and_add_to_tuple(TupleOfKeys& keys,
                                                       size_t idx = 0,
                                                       TraceSettings trace_settings = TraceSettings{})
    {
        TupleOfKeys instances = construct_instances(2, trace_settings, true);
        FoldingData accumulators = fold_and_verify(get<0>(instances), get<1>(instances));

        get<0>(keys)[idx] = get<0>(accumulators);
        get<1>(keys)[idx] = get<1>(accumulators);
    }

    /**
     * @brief Construct a given number of Prover and Verifier instances
     */
    static TupleOfKeys construct_instances(size_t num_keys,
                                           TraceSettings trace_settings = TraceSettings{},
                                           bool circuits_of_different_size = false)
    {
        std::vector<Builder> builders(num_keys);
        parallel_for([&builders, &num_keys, &circuits_of_different_size](const ThreadChunk& chunk) {
            for (size_t idx : chunk.range(num_keys)) {
                size_t log_num_gates = circuits_of_different_size ? 9 + (idx & 1) : 9;
                Builder builder;
                create_function_circuit(builder, log_num_gates, log_num_gates);
                builders[idx] = std::move(builder);
            }
        });

        // The following loop cannot be parallelized because the construction of a ProverInstance already has a
        // parallel_for call and nested parallel_for calls are not allowed
        TupleOfKeys keys;
        for (size_t idx = 0; idx < num_keys; idx++) {
            construct_instances_and_add_to_tuple(keys, builders[idx], idx, trace_settings);
        }
        return keys;
    }

    /**
     * @brief Get folding data at index idx in the tuple of keys
     */
    static FoldingData get_folding_data(const TupleOfKeys& keys, size_t idx)
    {
        return FoldingData(get<0>(keys)[idx], get<1>(keys)[idx]);
    }

    /**
     * @brief  Fold two prover instances. Return folded accumulator and folding proof.
     */
    static FoldingResult<Flavor> fold(const ProverInstances& prover_instances,
                                      const VerifierInstances& verification_keys,
                                      bool hash_accumulator = false,
                                      ExecutionTraceUsageTracker trace_usage_tracker = ExecutionTraceUsageTracker{})
    {
        auto prover_transcript = std::make_shared<typename FoldingProver::Transcript>();
        prover_transcript->enable_manifest();
        if (hash_accumulator) {
            // We allow this option because otherwise in a recursive setting the folding verifier interacts with
            // values that it has never seen before (because Oink is not run on an accumulator). By hashing the
            // verifier accumulator, we ensure its origin is properly tracked
            BB_ASSERT_EQ(get<0>(verification_keys)->is_complete, true);
            auto accumulator_hash = get<0>(verification_keys)->hash_through_transcript("-", *prover_transcript);
            prover_transcript->add_to_hash_buffer("accumulator_hash", accumulator_hash);
        }
        FoldingProver folding_prover(prover_instances, verification_keys, prover_transcript, trace_usage_tracker);

        return folding_prover.prove();
    }

    /**
     * @brief Verify a folding proof. Return the folded accumulator and the verifier transcript.
     */
    static FoldingVerificationResult verify_folding_proof(const VerifierInstances& verification_keys,
                                                          const HonkProof& folding_proof,
                                                          bool hash_accumulator = false)
    {
        auto verifier_transcript = std::make_shared<typename FoldingVerifier::Transcript>();
        verifier_transcript->enable_manifest();
        if (hash_accumulator) {
            // We allow this option because otherwise in a recursive setting the folding verifier interacts with
            // values that it has never seen before (because Oink is not run on an accumulator). By hashing the
            // verifier accumulator, we ensure its origin is properly tracked
            auto accumulator_hash = get<0>(verification_keys)->hash_through_transcript("-", *verifier_transcript);
            verifier_transcript->add_to_hash_buffer("accumulator_hash", accumulator_hash);
        }
        FoldingVerifier folding_verifier(verification_keys, verifier_transcript);
        auto verifier_accumulator = folding_verifier.verify_folding_proof(folding_proof);

        return { verifier_accumulator, verifier_transcript };
    }

    /**
     * @brief Fold two prover instances and generate folded verifier by running the PG verifier
     */
    static FoldingData fold_and_verify(const ProverInstances& prover_instances,
                                       const VerifierInstances& verification_keys,
                                       ExecutionTraceUsageTracker trace_usage_tracker = ExecutionTraceUsageTracker{},
                                       bool hash_accumulator = false)
    {
        auto [prover_accumulator, folding_proof] =
            fold(prover_instances, verification_keys, hash_accumulator, trace_usage_tracker);

        auto [verifier_accumulator, _] = verify_folding_proof(verification_keys, folding_proof, hash_accumulator);

        return FoldingData{ prover_accumulator, verifier_accumulator };
    }

    /**
     * @brief Run the decider on the given accumulator
     */
    static bool run_decider(const std::shared_ptr<ProverInstance>& prover_accumulator,
                            const std::shared_ptr<VerifierInstance>& verifier_accumulator)
    {
        DeciderProver decider_prover(prover_accumulator);
        DeciderVerifier decider_verifier(verifier_accumulator);
        decider_prover.construct_proof();
        HonkProof decider_proof = decider_prover.export_proof();
        auto decider_output = decider_verifier.verify_proof(decider_proof);
        bool result = decider_output.check();
        return result;
    }

    /**
     * @brief Compare two accumulators. Return the result of the comparison and error message.
     */
    static std::pair<bool, std::string> compare_accumulators(const std::shared_ptr<VerifierInstance>& lhs,
                                                             const std::shared_ptr<VerifierInstance>& rhs)
    {
        bool equal = true;
        std::string msg;

        auto compare_iterators = [&equal, &msg]<typename T>(const T& lhs, const T& rhs, const std::string& label) {
            if (lhs.size() != rhs.size()) {
                equal = false;
                msg += "\nMistmatch in the sizes of the ";
                msg += label;
            }
            for (size_t idx = 0; idx < lhs.size(); idx++) {
                if (lhs[idx] != rhs[idx]) {
                    equal = false;
                    msg += "\nMismatch in the ";
                    msg += label;
                    msg += " at index ";
                    msg += std::to_string(idx);
                }
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
        if (lhs->target_sum != rhs->target_sum) {
            equal = false;
            msg += "\nMismatch in target sum";
        }

        return { equal, msg };
    }

    /**
     * @brief Compare a Prover accumulator and a Verifier accumulator. Return the result of the comparison and error
     * message.
     */
    static std::pair<bool, std::string> compare_accumulators(const std::shared_ptr<ProverInstance>& lhs,
                                                             const std::shared_ptr<VerifierInstance>& rhs)
    {
        BB_ASSERT_EQ(lhs->is_complete, rhs->is_complete);
        BB_ASSERT_EQ(lhs->is_complete, true);

        auto lhs_vk = std::make_shared<VerificationKey>(lhs->get_precomputed());
        auto lhs_verifier_instance = std::make_shared<VerifierInstance>(lhs_vk);
        lhs_verifier_instance->is_complete = lhs->is_complete;

        lhs->commitment_key = CommitmentKey<typename Flavor::Curve>(lhs->get_precomputed().metadata.dyadic_size);
        for (auto [poly, comm] :
             zip_view(lhs->polynomials.get_witness(), lhs_verifier_instance->witness_commitments.get_all())) {
            comm = lhs->commitment_key.commit(poly);
        }
        lhs_verifier_instance->alphas = lhs->alphas;
        for (auto [verifier, prover] : zip_view(lhs_verifier_instance->relation_parameters.get_to_fold(),
                                                lhs->relation_parameters.get_to_fold())) {
            verifier = prover;
        };
        lhs_verifier_instance->gate_challenges = lhs->gate_challenges;
        lhs_verifier_instance->target_sum = lhs->target_sum;

        return compare_accumulators(lhs_verifier_instance, rhs);
    }
};

/**
 * @brief Utility to manually compute the target sum of an accumulator.
 *
 * @details As we create a ProtogalaxyProverInternal object with an empty execution trace tracker and no
 * active_ranges set, compute_row_evaluations will operate on all rows.
 */
template <typename Flavor>
static Flavor::FF compute_accumulator_target_sum_manual(const std::shared_ptr<ProverInstance_<Flavor>>& accumulator)
{
    BB_ASSERT_EQ(
        accumulator->is_complete, true, "Computing the target sum of an incomplete accumulator, indefinite behaviour.");

    using PGInternal = ProtogalaxyProverInternal<ProverInstance_<Flavor>>;

    const size_t accumulator_size = accumulator->dyadic_size();
    PGInternal pg_internal;
    const auto expected_honk_evals = pg_internal.compute_row_evaluations(
        accumulator->polynomials, accumulator->alphas, accumulator->relation_parameters);
    // Construct pow(\vec{betas*}) as in the paper
    GateSeparatorPolynomial expected_gate_separators(accumulator->gate_challenges, accumulator->gate_challenges.size());

    // Compute the corresponding target sum and create a dummy accumulator
    typename Flavor::FF expected_target_sum{ 0 };
    for (size_t idx = 0; idx < accumulator_size; idx++) {
        expected_target_sum += expected_honk_evals[idx] * expected_gate_separators[idx];
    }
    return expected_target_sum;
}

/**
 * @brief Utility to manually compute the target sum of an accumulator and compare it to the one produced in
 * Protogalxy to attest correctness.
 */
template <typename Flavor>
static bool check_accumulator_target_sum_manual(const std::shared_ptr<ProverInstance_<Flavor>>& accumulator)
{
    return accumulator->target_sum == compute_accumulator_target_sum_manual(accumulator);
}
} // namespace bb
