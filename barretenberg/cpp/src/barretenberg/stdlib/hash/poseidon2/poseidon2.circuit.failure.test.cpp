#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

#include <gtest/gtest.h>

using namespace bb;

class Poseidon2FailureTests : public ::testing::Test {
  public:
    using Flavor = UltraFlavor;
    using DeciderProvingKey = DeciderProvingKey_<Flavor>;
    using SumcheckProver = SumcheckProver<Flavor>;
    using SumcheckVerifier = SumcheckVerifier<Flavor>;
    using FF = Flavor::FF;
    using Builder = Flavor::CircuitBuilder;
    using Transcript = Flavor::Transcript;
    using SubrelationSeparators = Flavor::SubrelationSeparators;
    using RelationParameters = RelationParameters<FF>;

    void modify_selector(auto& selector)
    {
        size_t start_idx = selector.start_index();
        size_t end_idx = selector.end_index();

        // Flip the first non-zero selector value.
        for (size_t idx = start_idx; idx < end_idx; idx++) {
            if (selector.at(idx) == 1) {
                selector.at(idx) = 0;
                break;
            }
        }
    }

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

    void prove_and_verify(const std::shared_ptr<DeciderProvingKey>& proving_key, bool expected_result)
    {
        const size_t virtual_log_n = Flavor::VIRTUAL_LOG_N;

        // Random subrelation separators are needed here to make sure that the sumcheck is failing because of the wrong
        // Poseidon2 selector/witness values.
        SubrelationSeparators subrelation_separators{};
        for (auto& alpha : subrelation_separators) {
            alpha = FF::random_element();
        }

        std::vector<FF> gate_challenges(virtual_log_n);

        // Random gate challenges ensure that relations are satisfied at every point of the hypercube
        for (auto& beta : gate_challenges) {
            beta = FF::random_element();
        }

        RelationParameters relation_parameters;

        for (auto& rel_param : relation_parameters.get_to_fold()) {
            rel_param = FF::random_element();
        }
        auto prover_transcript = std::make_shared<Transcript>();

        SumcheckProver sumcheck_prover(proving_key->dyadic_size(),
                                       proving_key->polynomials,
                                       prover_transcript,
                                       subrelation_separators,
                                       gate_challenges,
                                       relation_parameters,
                                       virtual_log_n);
        auto proof = sumcheck_prover.prove();

        auto verifier_transcript = std::make_shared<Transcript>();
        verifier_transcript->load_proof(prover_transcript->export_proof());

        SumcheckVerifier verifier(verifier_transcript, subrelation_separators, virtual_log_n);
        auto result = verifier.verify(relation_parameters, gate_challenges, std::vector<FF>(virtual_log_n, 1));
        EXPECT_EQ(result.verified, expected_result);
    };
};

TEST_F(Poseidon2FailureTests, WrongSelectorValues)
{
    Builder builder;

    // Construct a circuit that hashes a single witness field element.
    hash_single_input(builder);

    // Convert circuit to polynomials.
    auto proving_key = std::make_shared<DeciderProvingKey_<Flavor>>(builder);
    {
        // Disable Poseidon2 External selector in the first active row
        modify_selector(proving_key->polynomials.q_poseidon2_external);

        // Run sumcheck on the invalidated data
        prove_and_verify(proving_key, false);
    }
    {
        // Disable Poseidon2 Internal selector in the first active row
        modify_selector(proving_key->polynomials.q_poseidon2_internal);

        // Run sumcheck on the invalidated data
        prove_and_verify(proving_key, false);
    }
}

TEST_F(Poseidon2FailureTests, WrongWitnessValues)
{
    Builder builder;

    hash_single_input(builder);

    auto proving_key = std::make_shared<DeciderProvingKey_<Flavor>>(builder);
    {
        modify_witness(proving_key->polynomials.q_poseidon2_external, proving_key->polynomials.w_l);
        prove_and_verify(proving_key, false);
    }
    {
        modify_witness(proving_key->polynomials.q_poseidon2_internal, proving_key->polynomials.w_r);
        prove_and_verify(proving_key, false);
    }
}

TEST_F(Poseidon2FailureTests, TamperingWithShifts)
{
    Builder builder;

    hash_single_input(builder);

    auto proving_key = std::make_shared<DeciderProvingKey_<Flavor>>(builder);
    {
        bool external_round = true;
        tamper_with_shifts(proving_key->polynomials.q_poseidon2_external, proving_key->polynomials.w_l, external_round);
        prove_and_verify(proving_key, false);
    }

    {
        bool external_round = false;
        tamper_with_shifts(proving_key->polynomials.q_poseidon2_internal, proving_key->polynomials.w_l, external_round);
        prove_and_verify(proving_key, false);
    }
}
