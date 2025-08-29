#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

#include <gtest/gtest.h>

using namespace bb;

template <typename Flavor> class Poseidon2FailureTests : public ::testing::Test {
  public:
    using DeciderProvingKey = DeciderProvingKey_<Flavor>;
    using VerificationKey = Flavor::VerificationKey;
    using SumcheckProver = SumcheckProver<Flavor>;
    using SumcheckVerifier = SumcheckVerifier<Flavor>;
    using FF = Flavor::FF;
    using Builder = Flavor::CircuitBuilder;
    using Transcript = Flavor::Transcript;
    using SubrelationSeparators = Flavor::SubrelationSeparators;
    using RelationParameters = RelationParameters<FF>;

    void modify_polynomial(auto& selector)
    {
        size_t start_idx = selector.start_index();
        size_t end_idx = selector.end_index();

        for (size_t idx = start_idx; idx < end_idx; idx++) {
            if (selector.at(idx) == 1) {
                selector.at(idx) = 0;
                continue;
            }
        }
    }

    void hash_input(Builder builder)
    {
        stdlib::field_t<Builder> random_input(stdlib::witness_t<Builder>(&builder, fr::random_element()));
        [[maybe_unused]] auto hash = stdlib::poseidon2<Builder>::hash({ random_input });
    }

    void prove_and_verify(const std::shared_ptr<DeciderProvingKey>& proving_key, bool expected_result)
    {
        const size_t virtual_log_n = Flavor::VIRTUAL_LOG_N;

        SubrelationSeparators subrelation_separators{};
        for (auto& alpha : subrelation_separators) {
            alpha = FF::random_element();
        }

        std::vector<FF> gate_challenges(virtual_log_n);

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
        EXPECT_EQ(result.round_checks[0], false);
        EXPECT_EQ(result.round_checks[1], true);
    };

  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

#ifdef STARKNET_GARAGA_FLAVORS
using FlavorTypes = testing::Types<UltraFlavor, UltraStarknetFlavor>;
#else
using FlavorTypes = testing::Types<UltraFlavor>;
#endif

TYPED_TEST_SUITE(Poseidon2FailureTests, FlavorTypes);

TYPED_TEST(Poseidon2FailureTests, WrongSelectorValues)
{
    using Flavor = TypeParam;
    using Builder = Flavor::CircuitBuilder;

    Builder builder{};

    TestFixture::hash_input(builder);

    auto proving_key = std::make_shared<DeciderProvingKey_<Flavor>>(builder);

    TestFixture::modify_polynomial(proving_key->polynomials.q_poseidon2_external);

    TestFixture::prove_and_verify(proving_key, false);
}

TYPED_TEST(Poseidon2FailureTests, WrongWitnessValues)
{
    // auto circuit_builder = UltraCircuitBuilder();
}

TYPED_TEST(Poseidon2FailureTests, TamperingWithDomainSeparation)
{
    // auto builder = UltraCircuitBuilder();
}
