#include "barretenberg/stdlib/hypernova/hypernova_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/hypernova/hypernova_prover.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "gtest/gtest.h"

using namespace bb::stdlib::recursion::honk;

// TODO(https://github.com/AztecProtocol/barretenberg/issues/1553): improve testing
class HypernovaFoldingVerifierTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

  public:
    using Builder = HypernovaFoldingVerifier::Builder;
    using Flavor = HypernovaFoldingVerifier::Flavor;
    using NativeFlavor = Flavor::NativeFlavor;
    using ProverInstance = bb::ProverInstance_<NativeFlavor>;
    using NativeFF = NativeFlavor::FF;
    using NativeProverAccumulator = bb::HypernovaFoldingProver::Accumulator;
    using NativeVerifierAccumulator = bb::MultilinearBatchingVerifierClaim<Flavor::Curve::NativeCurve>;
    using NativeVerificationKey = bb::HypernovaFoldingProver::VerificationKey;
    using NativeTranscript = bb::HypernovaFoldingProver::Transcript;
    using VerifierInstance = HypernovaFoldingVerifier::VerifierInstance;
    using Transcript = HypernovaFoldingVerifier::Transcript;
    using Proof = HypernovaFoldingVerifier::Proof;

    enum class TamperingMode : uint8_t {
        None,
        Instance,
    };

    static std::shared_ptr<ProverInstance> generate_new_instance(size_t log_num_gates = 4)
    {
        Builder builder;

        bb::MockCircuits::add_arithmetic_gates(builder, log_num_gates);
        bb::MockCircuits::add_arithmetic_gates_with_public_inputs(builder);
        bb::MockCircuits::add_lookup_gates(builder);

        auto instance = std::make_shared<ProverInstance>(builder);

        return instance;
    }

    static bool compare_prover_verifier_accumulators(const NativeProverAccumulator& lhs,
                                                     const NativeVerifierAccumulator& rhs)
    {
        for (size_t idx = 0; auto [challenge_lhs, challenge_rhs] : zip_view(lhs.challenge, rhs.challenge)) {
            if (challenge_lhs != challenge_rhs) {
                info("Mismatch in the challenges at index ", idx);
                return false;
            }
        }
        if (lhs.non_shifted_commitment != rhs.non_shifted_commitment) {
            info("Mismatch in the unshifted commitments");
            return false;
        }
        if (lhs.shifted_commitment != rhs.shifted_commitment) {
            info("Mismatch in the shifted commitments");
            return false;
        }
        if (lhs.non_shifted_evaluation != rhs.non_shifted_evaluation) {
            info("Mismatch in the unshifted evaluations");
            return false;
        }
        if (lhs.shifted_evaluation != rhs.shifted_evaluation) {
            info("Mismatch in the shifted evaluations");
            return false;
        }
        return true;
    }

    static void tampering(std::shared_ptr<ProverInstance>& instance, const TamperingMode& mode)
    {
        switch (mode) {
        case TamperingMode::None:
            break;
        case TamperingMode::Instance:
            // Tamper with the instance by changing w_l. This should invalidate the first sumcheck
            instance->polynomials.w_l.at(1) = NativeFF::random_element();
            break;
        }
    };

    static void test_folding(const TamperingMode& mode)
    {
        // Generate accumulator
        auto instance = generate_new_instance();
        auto transcript = std::make_shared<NativeTranscript>();

        bb::HypernovaFoldingProver prover(transcript);
        auto accumulator = prover.instance_to_accumulator(instance);

        // Folding
        auto incoming_instance = generate_new_instance(5);
        tampering(incoming_instance, mode);
        auto incoming_verifier_instance = std::make_shared<NativeVerificationKey>(incoming_instance->get_precomputed());

        auto folding_transcript = std::make_shared<NativeTranscript>();
        bb::HypernovaFoldingProver folding_prover(folding_transcript);
        auto [folding_proof, folded_accumulator] = folding_prover.fold(accumulator, incoming_instance);

        // Recursively verify the folding
        Builder builder;

        auto stdlib_incoming_instance = std::make_shared<VerifierInstance>(&builder, incoming_verifier_instance);
        auto verifier_transcript = std::make_shared<Transcript>();
        HypernovaFoldingVerifier verifier(verifier_transcript);
        Proof proof(builder, folding_proof);
        auto [first_sumcheck, second_sumcheck, folded_verifier_accumulator] =
            verifier.verify_folding_proof(builder, stdlib_incoming_instance, proof);

        // If the instance has been tampered with, then the first sumcheck should fail (hence the circuit is not
        // satisfied), but the second should pass
        EXPECT_EQ(bb::CircuitChecker::check(builder), mode == TamperingMode::None);
        EXPECT_EQ(first_sumcheck, mode == TamperingMode::None);
        EXPECT_TRUE(second_sumcheck);
        EXPECT_TRUE(compare_prover_verifier_accumulators(folded_accumulator, folded_verifier_accumulator.get_value()));
    }
};

TEST_F(HypernovaFoldingVerifierTests, Fold)
{
    test_folding(TamperingMode::None);
}

TEST_F(HypernovaFoldingVerifierTests, TamperInstance)
{
    BB_DISABLE_ASSERTS();
    test_folding(TamperingMode::Instance);
}
