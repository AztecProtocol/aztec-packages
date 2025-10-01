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
#include "barretenberg/stdlib/hash/blake3s/blake3s.hpp"
#include "barretenberg/stdlib/hash/pedersen/pedersen.hpp"
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
    static void construct_tuple_of_keys(TupleOfKeys& keys,
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
     * @brief Construct a given number of Prover and Verifier instances
     */
    static TupleOfKeys construct_keys(size_t num_keys, TraceSettings trace_settings = TraceSettings{})
    {
        TupleOfKeys keys;
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/938): Parallelize this loop
        for (size_t idx = 0; idx < num_keys; idx++) {
            auto builder = typename Flavor::CircuitBuilder();
            create_function_circuit(builder);

            construct_tuple_of_keys(keys, builder, idx, trace_settings);
        }
        return keys;
    }

    /**
     * @brief Fold two prover instances and generate folded verifier by running the PG verifier
     */
    static FoldingData fold_and_verify(const ProverInstances& prover_instances,
                                       const VerifierInstances& verification_keys,
                                       ExecutionTraceUsageTracker trace_usage_tracker = ExecutionTraceUsageTracker{})
    {
        FoldingProver folding_prover(prover_instances,
                                     verification_keys,
                                     std::make_shared<typename FoldingProver::Transcript>(),
                                     trace_usage_tracker);
        FoldingVerifier folding_verifier(verification_keys, std::make_shared<typename FoldingVerifier::Transcript>());

        auto [prover_accumulator, folding_proof] = folding_prover.prove();
        auto verifier_accumulator = folding_verifier.verify_folding_proof(folding_proof);
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
};

/**
 * @brief Utility to manually compute the target sum of an accumulator.
 *
 * @details As we create a ProtogalaxyProverInternal object with an empty execution trace tracker and no active_ranges
 * set, compute_row_evaluations will operate on all rows.
 */
template <typename Flavor>
static Flavor::FF compute_accumulator_target_sum_manual(const std::shared_ptr<ProverInstance_<Flavor>>& accumulator)
{
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
 * @brief Utility to manually compute the target sum of an accumulator and compare it to the one produced in Protogalxy
 * to attest correctness.
 */
template <typename Flavor>
static bool check_accumulator_target_sum_manual(const std::shared_ptr<ProverInstance_<Flavor>>& accumulator)
{
    return accumulator->target_sum == compute_accumulator_target_sum_manual(accumulator);
}
} // namespace bb
