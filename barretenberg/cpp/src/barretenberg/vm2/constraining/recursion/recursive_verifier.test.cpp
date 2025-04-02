#include "barretenberg/vm2/constraining/recursion/recursive_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/constraining/prover.hpp"
#include "barretenberg/vm2/constraining/recursion/recursive_flavor.hpp"
#include "barretenberg/vm2/constraining/verifier.hpp"
#include "barretenberg/vm2/proving_helper.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"
#include "barretenberg/vm2/tracegen_helper.hpp"

#include <gtest/gtest.h>

namespace bb::avm2::constraining {

class AvmRecursiveTests : public ::testing::Test {
  public:
    using RecursiveFlavor = AvmRecursiveFlavor_<UltraCircuitBuilder>;

    using InnerFlavor = typename RecursiveFlavor::NativeFlavor;
    using InnerProver = AvmProvingHelper;
    using InnerVerifier = AvmVerifier;
    using InnerG1 = InnerFlavor::Commitment;
    using InnerFF = InnerFlavor::FF;

    using Transcript = InnerFlavor::Transcript;

    using RecursiveVerifier = AvmRecursiveVerifier_<RecursiveFlavor>;

    using OuterBuilder = typename RecursiveFlavor::CircuitBuilder;
    using OuterProver = UltraProver;
    using OuterVerifier = UltraVerifier;
    using OuterDeciderProvingKey = DeciderProvingKey_<UltraFlavor>;

    using TraceContainer = tracegen::TraceContainer;

    static void SetUpTestSuite() { bb::srs::init_crs_factory(bb::srs::get_ignition_crs_path()); }
};

TEST_F(AvmRecursiveTests, recursion)
{
    // TODO: Do we define another environment variable for long running tests?
    if (std::getenv("AVM_SLOW_TESTS") == nullptr) {
        GTEST_SKIP();
    }

    auto [trace, public_inputs] = testing::get_minimal_trace_with_pi();

    InnerProver prover;
    const auto [proof, vk_data] = prover.prove(std::move(trace));
    const auto verification_key = prover.create_verification_key(vk_data);
    InnerVerifier verifier(verification_key);

    const auto public_inputs_cols = public_inputs.to_columns();

    const bool verified = verifier.verify_proof(proof, public_inputs_cols);

    ASSERT_TRUE(verified) << "native proof verification failed";

    // Create the outer verifier, to verify the proof
    OuterBuilder outer_circuit;
    RecursiveVerifier recursive_verifier{ outer_circuit, verification_key };

    auto agg_object =
        stdlib::recursion::init_default_aggregation_state<OuterBuilder, typename RecursiveFlavor::Curve>(outer_circuit);

    auto agg_output = recursive_verifier.verify_proof(proof, public_inputs_cols, agg_object);

    bool agg_output_valid =
        verification_key->pcs_verification_key->pairing_check(agg_output.P0.get_value(), agg_output.P1.get_value());

    // Check that the output of the recursive verifier is well-formed for aggregation as this pair of points will
    // be aggregated with others.
    ASSERT_TRUE(agg_output_valid) << "Pairing points (aggregation state) are not valid.";

    // Check that no failure flag was raised in the recursive verifier circuit
    ASSERT_FALSE(outer_circuit.failed()) << outer_circuit.err();

    // Check that the circuit is valid.
    bool outer_circuit_checked = CircuitChecker::check(outer_circuit);
    ASSERT_TRUE(outer_circuit_checked) << "outer circuit check failed";

    auto manifest = verifier.transcript->get_manifest();
    auto recursive_manifest = recursive_verifier.transcript->get_manifest();

    // We sanity check that the recursive manifest matches its counterpart one.
    ASSERT_EQ(manifest.size(), recursive_manifest.size());
    for (size_t i = 0; i < recursive_manifest.size(); ++i) {
        EXPECT_EQ(recursive_manifest[i], manifest[i]);
    }

    // We sanity check that the recursive verifier key (precomputed columns) matches its counterpart one.
    for (const auto [key_el, rec_key_el] : zip_view(verifier.key->get_all(), recursive_verifier.key->get_all())) {
        EXPECT_EQ(key_el, rec_key_el.get_value());
    }

    // Sanity checks on circuit_size and num_public_inputs match.
    EXPECT_EQ(verifier.key->circuit_size, static_cast<uint64_t>(recursive_verifier.key->circuit_size.get_value()));
    EXPECT_EQ(verifier.key->num_public_inputs,
              static_cast<uint64_t>(recursive_verifier.key->num_public_inputs.get_value()));

    // Make a proof of the verification of an AVM proof
    const size_t srs_size = 1 << 24; // Current outer_circuit size is 9.6 millions
    auto ultra_instance = std::make_shared<OuterDeciderProvingKey>(
        outer_circuit, TraceSettings{}, std::make_shared<bb::CommitmentKey<curve::BN254>>(srs_size));
    OuterProver ultra_prover(ultra_instance);
    auto outer_proof = ultra_prover.construct_proof();

    vinfo("Recursive verifier: finalized num gates = ", outer_circuit.num_gates);

    auto ultra_verification_key = std::make_shared<UltraFlavor::VerificationKey>(ultra_instance->proving_key);
    OuterVerifier ultra_verifier(ultra_verification_key);
    EXPECT_TRUE(ultra_verifier.verify_proof(outer_proof)) << "outer/recursion proof verification failed";
}

} // namespace bb::avm2::constraining
