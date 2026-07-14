#include "barretenberg/hypernova/hypernova_prover.hpp"
#include "barretenberg/flavor/mega_app_flavor.hpp"
#include "barretenberg/flavor/mega_kernel_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "gtest/gtest.h"

#include <optional>

using namespace bb;

// The stateful folding prover is flavor-agnostic; accumulate_instance is templated on the instance flavor. Run the
// suite over both Chonk instance flavors (MegaKernelFlavor and MegaAppFlavor).
template <typename Flavor_> class HypernovaFoldingProverTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

  public:
    using Flavor = Flavor_;
    using Builder = Flavor::CircuitBuilder;
    using ProverInstance = ProverInstance_<Flavor>;
    using CommitmentKey = Flavor::CommitmentKey;
    using Transcript = HypernovaFoldingProver::Transcript;
    using Accumulator = HypernovaFoldingProver::Accumulator;

    static constexpr size_t LOG_NUM_GATES = 4;

    static std::shared_ptr<ProverInstance> generate_new_instance(size_t log_num_gates = LOG_NUM_GATES)
    {
        Builder builder;

        MockCircuits::add_arithmetic_gates(builder, log_num_gates);
        MockCircuits::add_arithmetic_gates_with_public_inputs(builder);
        MockCircuits::add_lookup_gates(builder);

        return std::make_shared<ProverInstance>(builder);
    }

    /**
     * @brief Check that an accumulator's claimed evaluations and commitments are consistent with its polynomials.
     */
    static bool validate_accumulator(Accumulator& accumulator)
    {
        auto ck = CommitmentKey(accumulator.dyadic_size);

        auto unshifted_polynomial = Polynomial(accumulator.non_shifted_polynomial);
        auto shifted_polynomial = Polynomial(accumulator.shifted_polynomial);
        unshifted_polynomial.increase_virtual_size(1 << static_cast<uint>(accumulator.challenge.size()));
        shifted_polynomial.increase_virtual_size(1 << static_cast<uint>(accumulator.challenge.size()));
        if (unshifted_polynomial.evaluate_mle(accumulator.challenge) != accumulator.non_shifted_evaluation) {
            info("Mismatch between batched unshifted evaluation and evaluation of the batched unshifted polynomial.");
            return false;
        }
        if (shifted_polynomial.evaluate_mle(accumulator.challenge, true) != accumulator.shifted_evaluation) {
            info("Mismatch between batched shifted evaluation and evaluation of the batched shifted polynomial.");
            return false;
        }
        if (ck.commit(accumulator.non_shifted_polynomial) != accumulator.non_shifted_commitment) {
            info("Mismatch between the commitment to the batched unshifted polynomial and the batched unshifted "
                 "commitment.");
            return false;
        }
        if (ck.commit(accumulator.shifted_polynomial) != accumulator.shifted_commitment) {
            info("Mismatch between the commitment to the batched shifted polynomial and the batched shifted "
                 "commitment.");
            return false;
        }
        return true;
    }

    /**
     * @brief Run a folding session: accumulate `num_instances` fresh instances on a new transcript, then finalize
     * against an optional previous accumulator. Returns the folded accumulator.
     */
    static Accumulator fold_session(size_t num_instances,
                                    std::optional<Accumulator> previous_accumulator = std::nullopt)
    {
        auto transcript = std::make_shared<Transcript>();
        HypernovaFoldingProver prover(transcript);
        for (size_t i = 0; i < num_instances; ++i) {
            prover.template accumulate_instance<Flavor>(generate_new_instance(LOG_NUM_GATES + i));
        }
        auto [_proof, accumulator] = prover.finalize(std::move(previous_accumulator));
        return std::move(accumulator);
    }
};

using ProverTestFlavors = ::testing::Types<MegaKernelFlavor, MegaAppFlavor>;
TYPED_TEST_SUITE(HypernovaFoldingProverTests, ProverTestFlavors);

// A single instance with no previous accumulator: finalize returns the lone claim (no batching).
TYPED_TEST(HypernovaFoldingProverTests, SingleInstance)
{
    auto accumulator = TestFixture::fold_session(/*num_instances=*/1);
    EXPECT_TRUE(TestFixture::validate_accumulator(accumulator));
}

// Variable-width folding (no previous accumulator): every width yields a consistent accumulator.
TYPED_TEST(HypernovaFoldingProverTests, FoldVariableWidth)
{
    for (size_t num_instances = 2; num_instances <= CHONK_MAX_CLAIMS_PER_KERNEL; ++num_instances) {
        auto accumulator = TestFixture::fold_session(num_instances);
        EXPECT_TRUE(TestFixture::validate_accumulator(accumulator)) << "width " << num_instances;
    }
}

// Folding starting from a (valid) previous accumulator yields a consistent accumulator.
TYPED_TEST(HypernovaFoldingProverTests, FoldWithPreviousAccumulator)
{
    for (size_t num_instances = 2; num_instances < CHONK_MAX_CLAIMS_PER_KERNEL; ++num_instances) {
        auto previous_accumulator = TestFixture::fold_session(/*num_instances=*/1);
        auto accumulator = TestFixture::fold_session(num_instances, std::move(previous_accumulator));
        EXPECT_TRUE(TestFixture::validate_accumulator(accumulator)) << "width " << num_instances;
    }
}

// Folding starting from a tampered previous accumulator yields an inconsistent accumulator (the polynomial no longer
// opens to the claimed evaluation/commitment). This is the "previous invalid accumulator" failure mode.
TYPED_TEST(HypernovaFoldingProverTests, TamperPreviousAccumulator)
{
    auto previous_accumulator = TestFixture::fold_session(/*num_instances=*/1);
    previous_accumulator.non_shifted_polynomial.at(0) = HypernovaFoldingProver::FF::random_element();
    auto accumulator = TestFixture::fold_session(/*num_instances=*/2, std::move(previous_accumulator));
    EXPECT_FALSE(TestFixture::validate_accumulator(accumulator));
}
