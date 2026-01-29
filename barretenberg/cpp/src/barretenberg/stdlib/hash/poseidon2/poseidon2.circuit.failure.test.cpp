#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/witness_computation.hpp"

#include <gtest/gtest.h>

using namespace bb;

class Poseidon2FailureTests : public ::testing::Test {
  public:
    using Flavor = UltraFlavor;
    using ProverInstance = ProverInstance_<Flavor>;
    using SumcheckProver = bb::SumcheckProver<Flavor>;
    using SumcheckVerifier = bb::SumcheckVerifier<Flavor>;
    using FF = Flavor::FF;
    using Builder = Flavor::CircuitBuilder;
    using Transcript = Flavor::Transcript;
    using SubrelationSeparator = Flavor::SubrelationSeparator;
    using RelationParameters = bb::RelationParameters<FF>;

    void modify_witness(const auto& selector, auto& witness)
    {
        size_t start_idx = selector.start_index();
        size_t end_idx = selector.end_index();

        size_t selector_enabled_idx{ 0 };
        // Find the first row index where the selector is enabled.
        for (size_t idx = start_idx; idx < end_idx; idx++) {
            if (selector.at(idx) == 1) {
                selector_enabled_idx = idx;
                break;
            }
        }
        // Modify the witness
        witness.at(selector_enabled_idx) += 1;
    }
    void tamper_with_shifts(const auto& selector, auto& witness, bool external)
    {
        size_t start_idx = selector.start_index();
        size_t end_idx = selector.end_index();

        size_t selector_enabled_idx{ 0 };

        for (size_t idx = start_idx; idx < end_idx; idx++) {
            if (selector.at(idx) == 1) {
                selector_enabled_idx = idx;
                break;
            }
        }
        const size_t round_size = external ? 4 : 56;
        size_t shift_idx = selector_enabled_idx + round_size;
        // The selector must be zero at the row corresponding to the shift.
        EXPECT_EQ(selector.at(shift_idx), 0);
        // Modify the witness value. As Poseidon2ExternalRelation is comparing this value to the result of applying the
        // S-box and M_E to the previous row, this must lead to a sumcheck failure.
        witness.at(shift_idx) += 1;
    }

    void hash_single_input(Builder& builder)
    {
        stdlib::field_t<Builder> random_input(stdlib::witness_t<Builder>(&builder, fr::random_element()));
        random_input.fix_witness();
        [[maybe_unused]] auto hash = stdlib::poseidon2<Builder>::hash({ random_input });
    }

    void prove_and_verify(std::shared_ptr<ProverInstance>& prover_instance, bool expected_result)
    {
        const size_t virtual_log_n = Flavor::VIRTUAL_LOG_N;

        // Complete the prover instance (compute selectors, relation parameters, etc.)
        WitnessComputation<Flavor>::complete_prover_instance_for_test(prover_instance);

        auto prover_transcript = Transcript::test_prover_init_empty();

        // Generate challenges via transcript for Fiat-Shamir
        SubrelationSeparator subrelation_separator = prover_transcript->template get_challenge<FF>("Sumcheck:alpha");

        std::vector<FF> gate_challenges(virtual_log_n);
        for (size_t idx = 0; idx < virtual_log_n; idx++) {
            gate_challenges[idx] =
                prover_transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
        }

        // Set gate challenges on prover instance
        prover_instance->gate_challenges = gate_challenges;

        SumcheckProver sumcheck_prover(prover_instance->dyadic_size(),
                                       prover_instance->polynomials,
                                       prover_transcript,
                                       subrelation_separator,
                                       gate_challenges,
                                       prover_instance->relation_parameters,
                                       virtual_log_n);
        auto proof = sumcheck_prover.prove();

        auto verifier_transcript = Transcript::test_verifier_init_empty(prover_transcript);

        SubrelationSeparator verifier_subrelation_separator =
            verifier_transcript->template get_challenge<FF>("Sumcheck:alpha");
        std::vector<FF> verifier_gate_challenges(virtual_log_n);
        for (size_t idx = 0; idx < virtual_log_n; idx++) {
            verifier_gate_challenges[idx] =
                verifier_transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
        }

        // Run sumcheck verifier
        SumcheckVerifier verifier(verifier_transcript, verifier_subrelation_separator, virtual_log_n);
        auto result = verifier.verify(
            prover_instance->relation_parameters, verifier_gate_challenges, std::vector<FF>(virtual_log_n, 1));
        EXPECT_EQ(result.verified, expected_result);
    };
};

TEST_F(Poseidon2FailureTests, ValidCircuitVerifies)
{
    Builder builder;

    // Construct a circuit that hashes a single witness field element.
    hash_single_input(builder);

    // Convert circuit to polynomials.
    auto prover_instance = std::make_shared<ProverInstance_<Flavor>>(builder);

    // Run sumcheck on the UNMODIFIED valid data - this should pass
    prove_and_verify(prover_instance, true);
}

TEST_F(Poseidon2FailureTests, WrongWitnessValues)
{
    Builder builder;

    hash_single_input(builder);

    auto prover_instance = std::make_shared<ProverInstance_<Flavor>>(builder);
    {
        modify_witness(prover_instance->polynomials.q_poseidon2_external, prover_instance->polynomials.w_l);
        prove_and_verify(prover_instance, false);
    }
    {
        modify_witness(prover_instance->polynomials.q_poseidon2_internal, prover_instance->polynomials.w_r);
        prove_and_verify(prover_instance, false);
    }
}

TEST_F(Poseidon2FailureTests, TamperingWithShifts)
{
    Builder builder;

    hash_single_input(builder);

    auto prover_instance = std::make_shared<ProverInstance_<Flavor>>(builder);
    {
        bool external_round = true;
        tamper_with_shifts(
            prover_instance->polynomials.q_poseidon2_external, prover_instance->polynomials.w_l, external_round);
        prove_and_verify(prover_instance, false);
    }

    {
        bool external_round = false;
        tamper_with_shifts(
            prover_instance->polynomials.q_poseidon2_internal, prover_instance->polynomials.w_l, external_round);
        prove_and_verify(prover_instance, false);
    }
}
