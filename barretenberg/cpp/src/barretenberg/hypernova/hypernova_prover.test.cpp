#include "barretenberg/hypernova/hypernova_prover.hpp"
#include "barretenberg/flavor/mega_app_flavor.hpp"
#include "barretenberg/flavor/mega_kernel_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "gtest/gtest.h"

using namespace bb;

// TODO(https://github.com/AztecProtocol/barretenberg/issues/1553): improve testing
// The Hypernova prover methods are templated on InstanceFlavor, so run the suite over both Chonk
// instance flavors (MegaKernelFlavor and MegaAppFlavor).
template <typename Flavor_> class HypernovaFoldingProverTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

  public:
    using Flavor = Flavor_;
    using Builder = Flavor::CircuitBuilder;
    using ProverInstance = ProverInstance_<Flavor>;
    using CommitmentKey = Flavor::CommitmentKey;
    using Transcript = HypernovaFoldingProver::Transcript;

    enum class TamperingMode : uint8_t { None, Accumulator };

    static std::shared_ptr<ProverInstance> generate_new_instance(size_t log_num_gates = 4)
    {
        Builder builder;

        MockCircuits::add_arithmetic_gates(builder, log_num_gates);
        MockCircuits::add_arithmetic_gates_with_public_inputs(builder);
        MockCircuits::add_lookup_gates(builder);

        auto instance = std::make_shared<ProverInstance>(builder);

        return instance;
    }

    static bool validate_accumulator(HypernovaFoldingProver::Accumulator& accumulator)
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

    static void tampering(HypernovaFoldingProver::Accumulator& accumulator, const TamperingMode& mode)
    {
        switch (mode) {
        case TamperingMode::None:
            break;
        case TamperingMode::Accumulator:
            // Tamper with the accumulator by changing the unshifted polynomial
            // Note that changing the challenge would not produce an invalid accumulator as the validity of the
            // evaluations for an accumulator is checked by the Sumcheck performed to turn an instance into an
            // accumulators
            accumulator.non_shifted_polynomial.at(0) = HypernovaFoldingProver::FF::random_element();
            break;
        }
    };

    static HypernovaFoldingProver::Accumulator test_folding(const TamperingMode& mode)
    {
        // Generate accumulator
        auto instance = generate_new_instance();
        auto transcript = std::make_shared<Transcript>();

        HypernovaFoldingProver prover(transcript);
        auto accumulator = prover.instance_to_accumulator(instance);
        tampering(accumulator, mode);

        // Folding
        auto incoming_instance = generate_new_instance(5);

        auto folding_transcript = std::make_shared<Transcript>();
        HypernovaFoldingProver folding_prover(folding_transcript);
        auto [_, folded_accumulator] = folding_prover.fold(std::move(accumulator), incoming_instance);

        return folded_accumulator;
    }
};

using ProverTestFlavors = ::testing::Types<MegaKernelFlavor, MegaAppFlavor>;
TYPED_TEST_SUITE(HypernovaFoldingProverTests, ProverTestFlavors);

TYPED_TEST(HypernovaFoldingProverTests, InstanceToAccumulator)
{
    auto instance = TestFixture::generate_new_instance();
    auto transcript = std::make_shared<HypernovaFoldingProver::Transcript>();

    HypernovaFoldingProver prover(transcript);
    auto accumulator = prover.instance_to_accumulator(instance);

    EXPECT_TRUE(TestFixture::validate_accumulator(accumulator));
}

TYPED_TEST(HypernovaFoldingProverTests, Fold)
{
    auto folded_accumulator = TestFixture::test_folding(TestFixture::TamperingMode::None);
    EXPECT_TRUE(TestFixture::validate_accumulator(folded_accumulator));
}

TYPED_TEST(HypernovaFoldingProverTests, TamperAccumulator)
{
    auto folded_accumulator = TestFixture::test_folding(TestFixture::TamperingMode::Accumulator);
    EXPECT_FALSE(TestFixture::validate_accumulator(folded_accumulator));
}
