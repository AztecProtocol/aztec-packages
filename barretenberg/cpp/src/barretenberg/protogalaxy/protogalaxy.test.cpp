#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/polynomials/gate_separator.hpp"
#include "barretenberg/protogalaxy/folding_test_utils.hpp"
#include "barretenberg/protogalaxy/protogalaxy_prover.hpp"
#include "barretenberg/protogalaxy/protogalaxy_prover_internal.hpp"
#include "barretenberg/protogalaxy/protogalaxy_verifier.hpp"
#include "barretenberg/protogalaxy/prover_verifier_shared.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/ultra_honk/decider_prover.hpp"
#include "barretenberg/ultra_honk/decider_verifier.hpp"

#include <gtest/gtest.h>

using namespace bb;

namespace {

auto& engine = numeric::get_debug_randomness();

template <typename Flavor> class ProtogalaxyTests : public testing::Test {
  public:
    using VerificationKey = typename Flavor::VerificationKey;
    using DeciderProvingKey = DeciderProvingKey_<Flavor>;
    using DeciderProvingKeys = DeciderProvingKeys_<Flavor, 2>;
    using DeciderVerificationKey = DeciderVerificationKey_<Flavor>;
    using DeciderVerificationKeys = DeciderVerificationKeys_<Flavor, 2>;
    using ProtogalaxyProver = ProtogalaxyProver_<DeciderProvingKeys>;
    using FF = typename Flavor::FF;
    using Affine = typename Flavor::Commitment;
    using Projective = typename Flavor::GroupElement;
    using Builder = typename Flavor::CircuitBuilder;
    using Polynomial = typename Flavor::Polynomial;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using RelationParameters = bb::RelationParameters<FF>;
    using WitnessCommitments = typename Flavor::WitnessCommitments;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using GateSeparatorPolynomial = bb::GateSeparatorPolynomial<FF>;
    using DeciderProver = DeciderProver_<Flavor>;
    using DeciderVerifier = DeciderVerifier_<Flavor>;
    using FoldingProver = ProtogalaxyProver_<DeciderProvingKeys>;
    using FoldingVerifier = ProtogalaxyVerifier_<DeciderVerificationKeys>;
    using PGInternal = ProtogalaxyProverInternal<DeciderProvingKeys>;

    using TupleOfKeys = std::tuple<std::vector<std::shared_ptr<DeciderProvingKey>>,
                                   std::vector<std::shared_ptr<DeciderVerificationKey>>>;

    static void SetUpTestSuite() { bb::srs::init_crs_factory(bb::srs::get_ignition_crs_path()); }

    static void construct_circuit(Builder& builder)
    {
        MockCircuits::add_arithmetic_gates(builder);
        if constexpr (IsMegaFlavor<Flavor>) {
            GoblinMockCircuits::add_some_ecc_op_gates(builder);
        }
    }

    // Construct decider keys for a provided circuit and add to tuple
    static void construct_keys(TupleOfKeys& keys, Builder& builder, TraceSettings trace_settings = TraceSettings{})
    {

        auto decider_proving_key = std::make_shared<DeciderProvingKey>(builder, trace_settings);
        auto verification_key = std::make_shared<VerificationKey>(decider_proving_key->proving_key);
        auto decider_verification_keys = std::make_shared<DeciderVerificationKey>(verification_key);
        get<0>(keys).emplace_back(decider_proving_key);
        get<1>(keys).emplace_back(decider_verification_keys);
    }

    // Construct a given numer of decider key pairs
    static TupleOfKeys construct_keys(size_t num_keys, TraceSettings trace_settings = TraceSettings{})
    {
        TupleOfKeys keys;
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/938): Parallelize this loop
        for (size_t idx = 0; idx < num_keys; idx++) {
            auto builder = typename Flavor::CircuitBuilder();
            construct_circuit(builder);

            construct_keys(keys, builder, trace_settings);
        }
        return keys;
    }

    static std::tuple<std::shared_ptr<DeciderProvingKey>, std::shared_ptr<DeciderVerificationKey>> fold_and_verify(
        const std::vector<std::shared_ptr<DeciderProvingKey>>& proving_keys,
        const std::vector<std::shared_ptr<DeciderVerificationKey>>& verification_keys,
        ExecutionTraceUsageTracker trace_usage_tracker = ExecutionTraceUsageTracker{})
    {
        FoldingProver folding_prover(proving_keys, trace_usage_tracker);
        FoldingVerifier folding_verifier(verification_keys);

        auto [prover_accumulator, folding_proof] = folding_prover.prove();
        auto verifier_accumulator = folding_verifier.verify_folding_proof(folding_proof);
        return { prover_accumulator, verifier_accumulator };
    }

    static void decide_and_verify(const std::shared_ptr<DeciderProvingKey>& prover_accumulator,
                                  const std::shared_ptr<DeciderVerificationKey>& verifier_accumulator,
                                  bool expected_result)
    {
        DeciderProver decider_prover(prover_accumulator);
        DeciderVerifier decider_verifier(verifier_accumulator);
        HonkProof decider_proof = decider_prover.construct_proof();
        bool verified = decider_verifier.verify_proof(decider_proof);
        EXPECT_EQ(verified, expected_result);
    }

    /**
     * @brief For a valid circuit, ensures that computing the value of the full UH/MegaHonk relation at each row in its
     * execution trace (with the contribution of the linearly dependent one added tot he first row, in case of
     * Goblin) will be 0.
     *
     */
    static void test_full_honk_evaluations_valid_circuit()
    {
        auto builder = typename Flavor::CircuitBuilder();
        construct_circuit(builder);

        auto decider_pk = std::make_shared<DeciderProvingKey>(builder);

        decider_pk->relation_parameters.eta = FF::random_element();
        decider_pk->relation_parameters.eta_two = FF::random_element();
        decider_pk->relation_parameters.eta_three = FF::random_element();
        decider_pk->relation_parameters.beta = FF::random_element();
        decider_pk->relation_parameters.gamma = FF::random_element();

        decider_pk->proving_key.add_ram_rom_memory_records_to_wire_4(decider_pk->relation_parameters.eta,
                                                                     decider_pk->relation_parameters.eta_two,
                                                                     decider_pk->relation_parameters.eta_three);
        decider_pk->proving_key.compute_logderivative_inverses(decider_pk->relation_parameters);
        decider_pk->proving_key.compute_grand_product_polynomial(decider_pk->relation_parameters,
                                                                 decider_pk->final_active_wire_idx + 1);

        for (auto& alpha : decider_pk->alphas) {
            alpha = FF::random_element();
        }
        PGInternal pg_internal;
        auto full_honk_evals = pg_internal.compute_row_evaluations(
            decider_pk->proving_key.polynomials, decider_pk->alphas, decider_pk->relation_parameters);

        // Evaluations should be 0 for valid circuit
        for (const auto& eval : full_honk_evals.coeffs()) {
            EXPECT_EQ(eval, FF(0));
        }
    }

    /**
     * @brief Check the coefficients of the perturbator computed from dummy \vec{β}, \vec{δ} and f_i(ω) will be the
     * same as if computed manually.
     *
     */
    static void test_pertubator_coefficients()
    {
        std::vector<FF> betas = { FF(5), FF(8), FF(11) };
        std::vector<FF> deltas = { FF(2), FF(4), FF(8) };
        std::vector<FF> full_honk_evaluations = { FF(1), FF(1), FF(1), FF(1), FF(1), FF(1), FF(1), FF(1) };
        [[maybe_unused]] Polynomial honk_evaluations_poly(full_honk_evaluations.size());
        for (auto [poly_val, val] : zip_view(honk_evaluations_poly.coeffs(), full_honk_evaluations)) {
            poly_val = val;
        }
        auto perturbator = PGInternal::construct_perturbator_coefficients(betas, deltas, honk_evaluations_poly);
        std::vector<FF> expected_values = { FF(648), FF(936), FF(432), FF(64) };
        EXPECT_EQ(perturbator.size(), 4); // log(size) + 1
        for (size_t i = 0; i < perturbator.size(); i++) {
            EXPECT_EQ(perturbator[i], expected_values[i]);
        }
    }

    /**
     * @brief Create a dummy accumulator and ensure coefficient 0 of the computed perturbator is the same as the
     * accumulator's target sum.
     *
     */
    static void test_pertubator_polynomial()
    {
        using RelationSeparator = typename Flavor::RelationSeparator;
        const size_t log_size(3);
        const size_t size(1 << log_size);
        // Construct fully random prover polynomials
        ProverPolynomials full_polynomials;
        for (auto& poly : full_polynomials.get_all()) {
            poly = bb::Polynomial<FF>::random(size);
        }

        auto relation_parameters = bb::RelationParameters<FF>::get_random();
        RelationSeparator alphas;
        for (auto& alpha : alphas) {
            alpha = FF::random_element();
        }

        PGInternal pg_internal;
        auto full_honk_evals = pg_internal.compute_row_evaluations(full_polynomials, alphas, relation_parameters);
        std::vector<FF> betas(log_size);
        for (size_t idx = 0; idx < log_size; idx++) {
            betas[idx] = FF::random_element();
        }

        // Construct pow(\vec{betas}) as in the paper
        bb::GateSeparatorPolynomial gate_separators(betas, log_size);

        // Compute the corresponding target sum and create a dummy accumulator
        auto target_sum = FF(0);
        for (size_t i = 0; i < size; i++) {
            target_sum += full_honk_evals[i] * gate_separators[i];
        }

        auto accumulator = std::make_shared<DeciderProvingKey>();
        accumulator->proving_key.polynomials = std::move(full_polynomials);
        accumulator->proving_key.log_circuit_size = log_size;
        accumulator->gate_challenges = betas;
        accumulator->target_sum = target_sum;
        accumulator->relation_parameters = relation_parameters;
        accumulator->alphas = alphas;

        auto deltas = compute_round_challenge_pows(log_size, FF::random_element());
        auto perturbator = pg_internal.compute_perturbator(accumulator, deltas);

        // Ensure the constant coefficient of the perturbator is equal to the target sum as indicated by the paper
        EXPECT_EQ(perturbator[0], target_sum);
    }

    /**
     * @brief Manually compute the expected evaluations of the combiner quotient, given evaluations of the combiner
     * and check them against the evaluations returned by the function.
     *
     */
    static void test_combiner_quotient()
    {
        auto perturbator_evaluation = FF(2); // F(\alpha) in the paper
        auto combiner = bb::Univariate<FF, 12>(std::array<FF, 12>{ 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31 });
        auto combiner_quotient = PGInternal::compute_combiner_quotient(perturbator_evaluation, combiner);

        // K(i) = (G(i) - ( L_0(i) * F(\alpha)) / Z(i), i = {2,.., 13} for DeciderProvingKeys::NUM = 2
        // K(i) = (G(i) - (1 - i) * F(\alpha)) / i * (i - 1)
        auto expected_evals = bb::Univariate<FF, 12, 2>(std::array<FF, 10>{
            (FF(22) - (FF(1) - FF(2)) * perturbator_evaluation) / (FF(2) * FF(2 - 1)),
            (FF(23) - (FF(1) - FF(3)) * perturbator_evaluation) / (FF(3) * FF(3 - 1)),
            (FF(24) - (FF(1) - FF(4)) * perturbator_evaluation) / (FF(4) * FF(4 - 1)),
            (FF(25) - (FF(1) - FF(5)) * perturbator_evaluation) / (FF(5) * FF(5 - 1)),
            (FF(26) - (FF(1) - FF(6)) * perturbator_evaluation) / (FF(6) * FF(6 - 1)),
            (FF(27) - (FF(1) - FF(7)) * perturbator_evaluation) / (FF(7) * FF(7 - 1)),
            (FF(28) - (FF(1) - FF(8)) * perturbator_evaluation) / (FF(8) * FF(8 - 1)),
            (FF(29) - (FF(1) - FF(9)) * perturbator_evaluation) / (FF(9) * FF(9 - 1)),
            (FF(30) - (FF(1) - FF(10)) * perturbator_evaluation) / (FF(10) * FF(10 - 1)),
            (FF(31) - (FF(1) - FF(11)) * perturbator_evaluation) / (FF(11) * FF(11 - 1)),
        });

        for (size_t idx = 2; idx < 7; idx++) {
            EXPECT_EQ(combiner_quotient.value_at(idx), expected_evals.value_at(idx));
        }
    }

    /**
     * @brief For two dummy decider proving keys with their relation parameter η set, check that combining them in a
     * univariate, barycentrially extended to the desired number of evaluations, is performed correctly.
     *
     */
    static void test_compute_extended_relation_parameters()
    {
        Builder builder1;
        auto pk_1 = std::make_shared<DeciderProvingKey>(builder1);
        pk_1->relation_parameters.eta = 1;

        Builder builder2;
        builder2.add_variable(3);
        auto pk_2 = std::make_shared<DeciderProvingKey>(builder2);
        pk_2->relation_parameters.eta = 3;

        DeciderProvingKeys pks{ { pk_1, pk_2 } };
        auto relation_parameters_no_optimistic_skipping = PGInternal::template compute_extended_relation_parameters<
            typename PGInternal::UnivariateRelationParametersNoOptimisticSkipping>(pks);
        auto relation_parameters = PGInternal::template compute_extended_relation_parameters<
            typename FoldingProver::UnivariateRelationParameters>(pks);

        bb::Univariate<FF, 11> expected_eta{ { 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21 } };
        EXPECT_EQ(relation_parameters_no_optimistic_skipping.eta, expected_eta);
        // Optimised relation parameters are the same, we just don't compute any values for non-used indices when
        // deriving values from them
        for (size_t i = 0; i < 11; i++) {
            EXPECT_EQ(relation_parameters.eta.evaluations[i], expected_eta.evaluations[i]);
        }
    }

    /**
     * @brief Given two dummy decider proving_keys with the batching challenges alphas set (one for each subrelation)
     * ensure combining them in a univariate of desired length works as expected.
     */
    static void test_compute_and_extend_alphas()
    {
        Builder builder1;
        auto pk_1 = std::make_shared<DeciderProvingKey>(builder1);
        pk_1->alphas.fill(2);

        Builder builder2;
        builder2.add_variable(3);
        auto pk_2 = std::make_shared<DeciderProvingKey>(builder2);
        pk_2->alphas.fill(4);

        DeciderProvingKeys pks{ { pk_1, pk_2 } };
        auto alphas = PGInternal::compute_and_extend_alphas(pks);

        bb::Univariate<FF, 12> expected_alphas{ { 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24 } };
        for (const auto& alpha : alphas) {
            EXPECT_EQ(alpha, expected_alphas);
        }
    }

    /**
     * @brief Testing one valid round of folding (plus decider) for two inhomogeneous circuits
     * @details For robustness we fold circuits with different numbers/types of gates (but the same dyadic size)
     *
     */
    static void test_protogalaxy_inhomogeneous()
    {
        auto check_fold_and_decide = [](Builder& circuit_1, Builder& circuit_2) {
            // Construct decider key pairs for each
            TupleOfKeys keys;
            construct_keys(keys, circuit_1);
            construct_keys(keys, circuit_2);

            // Perform prover and verifier folding
            auto [prover_accumulator, verifier_accumulator] = fold_and_verify(get<0>(keys), get<1>(keys));
            EXPECT_TRUE(check_accumulator_target_sum_manual(prover_accumulator));

            // Run decider
            decide_and_verify(prover_accumulator, verifier_accumulator, true);
        };

        // One circuit has more arithmetic gates
        {
            // Construct two equivalent circuits
            Builder builder1;
            Builder builder2;
            construct_circuit(builder1);
            construct_circuit(builder2);

            // Add some arithmetic gates
            bb::MockCircuits::add_arithmetic_gates(builder1, /*num_gates=*/4);

            check_fold_and_decide(builder1, builder2);
        }

        // One circuit has more arithmetic gates with public inputs
        {
            // Construct two equivalent circuits
            Builder builder1;
            Builder builder2;
            construct_circuit(builder1);
            construct_circuit(builder2);

            // Add some arithmetic gates with public inputs to the first circuit
            bb::MockCircuits::add_arithmetic_gates_with_public_inputs(builder1, /*num_gates=*/4);

            check_fold_and_decide(builder1, builder2);
        }

        // One circuit has more lookup gates
        {
            // Construct two equivalent circuits
            Builder builder1;
            Builder builder2;
            construct_circuit(builder1);
            construct_circuit(builder2);

            // Add a different number of lookup gates to each circuit
            bb::MockCircuits::add_lookup_gates(builder1, /*num_iterations=*/2); // 12 gates plus 4096 table
            bb::MockCircuits::add_lookup_gates(builder2, /*num_iterations=*/1); // 6 gates plus 4096 table

            check_fold_and_decide(builder1, builder2);
        }
    }

    /**
     * @brief Ensure failure for a bad lookup gate in one of the circuits being folded
     *
     */
    static void test_protogalaxy_bad_lookup_failure()
    {
        // Construct two equivalent circuits
        Builder builder1;
        Builder builder2;
        construct_circuit(builder1);
        construct_circuit(builder2);

        // Add a different number of lookup gates to each circuit
        bb::MockCircuits::add_lookup_gates(builder1, /*num_iterations=*/2); // 12 gates plus 4096 table
        bb::MockCircuits::add_lookup_gates(builder2, /*num_iterations=*/1); // 6 gates plus 4096 table

        // Erroneously set a non-zero wire value to zero in one of the lookup gates
        for (auto& wire_3_witness_idx : builder1.blocks.lookup.w_o()) {
            if (wire_3_witness_idx != builder1.zero_idx) {
                wire_3_witness_idx = builder1.zero_idx;
                break;
            }
        }

        // Construct the key pairs for each
        TupleOfKeys keys;
        construct_keys(keys, builder1);
        construct_keys(keys, builder2);

        // Perform prover and verifier folding
        auto [prover_accumulator, verifier_accumulator] = fold_and_verify(get<0>(keys), get<1>(keys));

        // Expect failure in manual target sum check and decider
        EXPECT_FALSE(check_accumulator_target_sum_manual(prover_accumulator));
        decide_and_verify(prover_accumulator, verifier_accumulator, false);
    }

    /**
     * @brief Testing two valid rounds of folding followed by the decider.
     *
     */
    static void test_full_protogalaxy()
    {
        TupleOfKeys insts = construct_keys(2);
        auto [prover_accumulator, verifier_accumulator] = fold_and_verify(get<0>(insts), get<1>(insts));
        EXPECT_TRUE(check_accumulator_target_sum_manual(prover_accumulator));

        TupleOfKeys insts_2 = construct_keys(1); // just one key pair
        auto [prover_accumulator_2, verifier_accumulator_2] =
            fold_and_verify({ prover_accumulator, get<0>(insts_2)[0] }, { verifier_accumulator, get<1>(insts_2)[0] });
        EXPECT_TRUE(check_accumulator_target_sum_manual(prover_accumulator_2));

        decide_and_verify(prover_accumulator_2, verifier_accumulator_2, true);
    }

    /**
     * @brief Testing two valid rounds of folding followed by the decider for a structured trace.
     *
     */
    static void test_full_protogalaxy_structured_trace()
    {
        TraceSettings trace_settings{ SMALL_TEST_STRUCTURE_FOR_OVERFLOWS };
        TupleOfKeys keys_1 = construct_keys(2, trace_settings);

        auto [prover_accumulator, verifier_accumulator] = fold_and_verify(get<0>(keys_1), get<1>(keys_1));
        EXPECT_TRUE(check_accumulator_target_sum_manual(prover_accumulator));

        TupleOfKeys keys_2 = construct_keys(1, trace_settings); // just one key pair

        auto [prover_accumulator_2, verifier_accumulator_2] =
            fold_and_verify({ prover_accumulator, get<0>(keys_2)[0] }, { verifier_accumulator, get<1>(keys_2)[0] });
        EXPECT_TRUE(check_accumulator_target_sum_manual(prover_accumulator_2));
        info(prover_accumulator_2->proving_key.circuit_size);
        decide_and_verify(prover_accumulator_2, verifier_accumulator_2, true);
    }

    /**
     * @brief Testing folding a larger circuit into a smaller one by increasing the virtual size of the first.
     * @details Fold two circuits using a structured trace, where the second overflows the trace such that the dyadic
     * size is doubled. The virtual size of the polynomials in the first key is increased internally in the PG prover to
     * match the size of the second.
     *
     */
    static void test_fold_with_virtual_size_expansion()
    {
        uint32_t overflow_capacity = 0; // consider the case where the overflow is not known until runtime
        TraceSettings trace_settings{ SMALL_TEST_STRUCTURE_FOR_OVERFLOWS, overflow_capacity };
        ExecutionTraceUsageTracker trace_usage_tracker = ExecutionTraceUsageTracker(trace_settings);

        std::vector<std::shared_ptr<DeciderProvingKey>> decider_pks;
        std::vector<std::shared_ptr<DeciderVerificationKey>> decider_vks;

        // define parameters for two circuits; the first fits within the structured trace, the second overflows
        const std::vector<size_t> log2_num_gates = { 14, 18 };
        for (size_t i = 0; i < 2; ++i) {
            MegaCircuitBuilder builder;

            MockCircuits::add_arithmetic_gates(builder, 1 << log2_num_gates[i]);

            auto decider_proving_key = std::make_shared<DeciderProvingKey>(builder, trace_settings);
            trace_usage_tracker.update(builder);
            auto verification_key = std::make_shared<VerificationKey>(decider_proving_key->proving_key);
            auto decider_verification_key = std::make_shared<DeciderVerificationKey>(verification_key);
            decider_pks.push_back(decider_proving_key);
            decider_vks.push_back(decider_verification_key);
        }

        // Ensure the dyadic size of the first key is strictly less than that of the second
        EXPECT_TRUE(decider_pks[0]->proving_key.circuit_size < decider_pks[1]->proving_key.circuit_size);

        // The size discrepency should be automatically handled by the PG prover via a virtual size increase
        const auto [prover_accumulator, verifier_accumulator] =
            fold_and_verify(decider_pks, decider_vks, trace_usage_tracker);
        EXPECT_TRUE(check_accumulator_target_sum_manual(prover_accumulator));
        decide_and_verify(prover_accumulator, verifier_accumulator, true);
    }

    /**
     * @brief Testing two valid rounds of folding followed by the decider for a structured trace.
     * @details Here we're interested in folding inhomogeneous circuits, i.e. circuits with different numbers of
     * constraints, which should be automatically handled by the structured trace
     *
     */
    static void test_full_protogalaxy_structured_trace_inhomogeneous_circuits()
    {
        TraceSettings trace_settings{ SMALL_TEST_STRUCTURE };

        // Construct three circuits to be folded, each with a different number of constraints
        Builder builder1;
        Builder builder2;
        Builder builder3;
        construct_circuit(builder1);
        construct_circuit(builder2);
        construct_circuit(builder3);

        // Create inhomogenous circuits by adding a different number of add gates to each
        MockCircuits::add_arithmetic_gates(builder1, 10);
        MockCircuits::add_arithmetic_gates(builder2, 100);
        MockCircuits::add_arithmetic_gates(builder3, 1000);

        // Construct the decider key pairs for the first two circuits
        TupleOfKeys keys_1;
        construct_keys(keys_1, builder1, trace_settings);
        construct_keys(keys_1, builder2, trace_settings);

        // Fold the first two pairs
        auto [prover_accumulator, verifier_accumulator] = fold_and_verify(get<0>(keys_1), get<1>(keys_1));
        EXPECT_TRUE(check_accumulator_target_sum_manual(prover_accumulator));

        // Construct the decider key pair for the third circuit
        TupleOfKeys keys_2;
        construct_keys(keys_2, builder3, trace_settings);

        // Fold 3rd pair of keys into their respective accumulators
        auto [prover_accumulator_2, verifier_accumulator_2] =
            fold_and_verify({ prover_accumulator, get<0>(keys_2)[0] }, { verifier_accumulator, get<1>(keys_2)[0] });
        EXPECT_TRUE(check_accumulator_target_sum_manual(prover_accumulator_2));
        info(prover_accumulator_2->proving_key.circuit_size);

        // Decide on final accumulator
        decide_and_verify(prover_accumulator_2, verifier_accumulator_2, true);
    }

    /**
     * @brief Ensure tampering a commitment and then calling the decider causes the decider verification to fail.
     *
     */
    static void test_tampered_commitment()
    {
        TupleOfKeys insts = construct_keys(2);
        auto [prover_accumulator, verifier_accumulator] = fold_and_verify(get<0>(insts), get<1>(insts));
        EXPECT_TRUE(check_accumulator_target_sum_manual(prover_accumulator));

        // Tamper with a commitment
        verifier_accumulator->witness_commitments.w_l = Projective(Affine::random_element());

        TupleOfKeys insts_2 = construct_keys(1); // just one decider key pair
        auto [prover_accumulator_2, verifier_accumulator_2] =
            fold_and_verify({ prover_accumulator, get<0>(insts_2)[0] }, { verifier_accumulator, get<1>(insts_2)[0] });
        EXPECT_TRUE(check_accumulator_target_sum_manual(prover_accumulator_2));

        decide_and_verify(prover_accumulator_2, verifier_accumulator_2, false);
    }

    /**
     * @brief Ensure tampering an accumulator and then calling fold again causes the target sums in the prover and
     * verifier accumulators to be different and decider verification to fail.
     *
     */
    static void test_tampered_accumulator_polynomial()
    {
        TupleOfKeys insts = construct_keys(2);
        auto [prover_accumulator, verifier_accumulator] = fold_and_verify(get<0>(insts), get<1>(insts));
        EXPECT_TRUE(check_accumulator_target_sum_manual(prover_accumulator));

        // Tamper with an accumulator polynomial
        for (size_t i = 0; i < prover_accumulator->proving_key.circuit_size; ++i) {
            if (prover_accumulator->proving_key.polynomials.q_arith[i] != 0) {
                prover_accumulator->proving_key.polynomials.w_l.at(i) += 1;
                break;
            }
        }
        EXPECT_FALSE(check_accumulator_target_sum_manual(prover_accumulator));

        TupleOfKeys insts_2 = construct_keys(1); // just one decider key pair
        auto [prover_accumulator_2, verifier_accumulator_2] =
            fold_and_verify({ prover_accumulator, get<0>(insts_2)[0] }, { verifier_accumulator, get<1>(insts_2)[0] });

        EXPECT_EQ(prover_accumulator_2->target_sum == verifier_accumulator_2->target_sum, false);
        decide_and_verify(prover_accumulator_2, verifier_accumulator_2, false);
    }

    template <size_t k> static void test_fold_k_key_pairs()
    {
        constexpr size_t total_insts = k + 1;
        TupleOfKeys insts = construct_keys(total_insts);

        ProtogalaxyProver_<DeciderProvingKeys_<Flavor, total_insts>> folding_prover(get<0>(insts));
        ProtogalaxyVerifier_<DeciderVerificationKeys_<Flavor, total_insts>> folding_verifier(get<1>(insts));

        auto [prover_accumulator, folding_proof] = folding_prover.prove();
        auto verifier_accumulator = folding_verifier.verify_folding_proof(folding_proof);
        EXPECT_TRUE(check_accumulator_target_sum_manual(prover_accumulator));
        decide_and_verify(prover_accumulator, verifier_accumulator, true);
    }
};
} // namespace

using FlavorTypes = testing::Types<MegaFlavor>;
TYPED_TEST_SUITE(ProtogalaxyTests, FlavorTypes);

TYPED_TEST(ProtogalaxyTests, PerturbatorCoefficients)
{
    TestFixture::test_pertubator_coefficients();
}

TYPED_TEST(ProtogalaxyTests, FullHonkEvaluationsValidCircuit)
{
    TestFixture::test_full_honk_evaluations_valid_circuit();
}

TYPED_TEST(ProtogalaxyTests, PerturbatorPolynomial)
{
    TestFixture::test_pertubator_polynomial();
}

TYPED_TEST(ProtogalaxyTests, CombinerQuotient)
{
    TestFixture::test_combiner_quotient();
}

TYPED_TEST(ProtogalaxyTests, CombineRelationParameters)
{
    TestFixture::test_compute_extended_relation_parameters();
}

TYPED_TEST(ProtogalaxyTests, CombineAlphas)
{
    TestFixture::test_compute_and_extend_alphas();
}

TYPED_TEST(ProtogalaxyTests, ProtogalaxyInhomogeneous)
{
    TestFixture::test_protogalaxy_inhomogeneous();
}

TYPED_TEST(ProtogalaxyTests, FullProtogalaxyTest)
{
    TestFixture::test_full_protogalaxy();
}

TYPED_TEST(ProtogalaxyTests, FullProtogalaxyStructuredTrace)
{
    TestFixture::test_full_protogalaxy_structured_trace();
}

TYPED_TEST(ProtogalaxyTests, VirtualSizeExpansion)
{
    TestFixture::test_fold_with_virtual_size_expansion();
}

TYPED_TEST(ProtogalaxyTests, FullProtogalaxyStructuredTraceInhomogeneous)
{
    TestFixture::test_full_protogalaxy_structured_trace_inhomogeneous_circuits();
}

TYPED_TEST(ProtogalaxyTests, TamperedCommitment)
{
    TestFixture::test_tampered_commitment();
}

TYPED_TEST(ProtogalaxyTests, TamperedAccumulatorPolynomial)
{
    TestFixture::test_tampered_accumulator_polynomial();
}

TYPED_TEST(ProtogalaxyTests, BadLookupFailure)
{
    TestFixture::test_protogalaxy_bad_lookup_failure();
}

// We only fold one incoming decider key pair since this is all we plan to use, and compiling for higher values of k is
// a significant compilation time cost.
TYPED_TEST(ProtogalaxyTests, Fold1)
{
    TestFixture::template test_fold_k_key_pairs<1>();
}