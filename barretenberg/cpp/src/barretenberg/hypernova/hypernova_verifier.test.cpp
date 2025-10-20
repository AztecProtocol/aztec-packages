#include "barretenberg/hypernova/hypernova_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/hypernova/hypernova_prover.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "gtest/gtest.h"

using namespace bb;

// TODO(https://github.com/AztecProtocol/barretenberg/issues/1553): improve testing
class HypernovaFoldingVerifierTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

  public:
    // Recursive verifier
    using RecursiveHypernovaVerifier = HypernovaFoldingVerifier<bb::MegaRecursiveFlavor_<bb::MegaCircuitBuilder>>;
    using RecursiveFlavor = RecursiveHypernovaVerifier::Flavor;
    using RecursiveVerifierInstance = RecursiveHypernovaVerifier::VerifierInstance;
    using Builder = RecursiveFlavor::CircuitBuilder;
    using RecursiveTranscript = RecursiveHypernovaVerifier::Transcript;
    using RecursiveProof = RecursiveHypernovaVerifier::Proof;

    // Native verifier
    using NativeHypernovaVerifier = HypernovaFoldingVerifier<bb::MegaFlavor>;
    using NativeFlavor = NativeHypernovaVerifier::Flavor;
    using NativeFF = NativeFlavor::FF;
    using NativeVerifierAccumulator = NativeHypernovaVerifier::Accumulator;
    using NativeVerificationKey = NativeFlavor::VerificationKey;
    using NativeVerifierInstance = NativeHypernovaVerifier::VerifierInstance;
    using NativeTranscript = NativeHypernovaVerifier::Transcript;

    // Prover
    using HypernovaFoldingProver = bb::HypernovaFoldingProver;
    using NativeProverAccumulator = HypernovaFoldingProver::Accumulator;
    using ProverInstance = HypernovaFoldingProver::ProverInstance;

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
        auto incoming_vk = std::make_shared<NativeVerificationKey>(incoming_instance->get_precomputed());
        auto incoming_verifier_instance = std::make_shared<NativeVerifierInstance>(incoming_vk);

        auto folding_transcript = std::make_shared<NativeTranscript>();
        HypernovaFoldingProver folding_prover(folding_transcript);
        auto [folding_proof, folded_accumulator] = folding_prover.fold(accumulator, incoming_instance);

        // Natively verify the folding
        auto native_verifier_transcript = std::make_shared<NativeTranscript>();
        NativeHypernovaVerifier native_verifier(native_verifier_transcript);
        auto [first_sumcheck_native, second_sumcheck_native, folded_verifier_accumulator_native] =
            native_verifier.verify_folding_proof(incoming_verifier_instance, folding_proof);

        // Recursively verify the folding
        Builder builder;

        auto stdlib_incoming_instance =
            std::make_shared<RecursiveVerifierInstance>(&builder, incoming_verifier_instance);
        auto recursive_verifier_transcript = std::make_shared<RecursiveTranscript>();
        RecursiveHypernovaVerifier recursive_verifier(recursive_verifier_transcript);
        RecursiveProof proof(builder, folding_proof);
        auto [first_sumcheck_recursive, second_sumcheck_recursive, folded_verifier_accumulator] =
            recursive_verifier.verify_folding_proof(stdlib_incoming_instance, proof);

        // If the instance has been tampered with, then the first sumcheck should fail (hence the circuit is not
        // satisfied), but the second should pass
        EXPECT_EQ(bb::CircuitChecker::check(builder), mode == TamperingMode::None);
        EXPECT_EQ(first_sumcheck_recursive, mode == TamperingMode::None);
        EXPECT_EQ(first_sumcheck_recursive, first_sumcheck_native);
        EXPECT_TRUE(second_sumcheck_recursive);
        EXPECT_EQ(second_sumcheck_recursive, second_sumcheck_native);
        EXPECT_TRUE(compare_prover_verifier_accumulators(
            folded_accumulator, folded_verifier_accumulator.get_value<NativeVerifierAccumulator>()));
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
