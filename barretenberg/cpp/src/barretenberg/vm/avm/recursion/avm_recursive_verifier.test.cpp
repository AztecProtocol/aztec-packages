// As this adds the honk_stdlib_recursion module to the cmake lists, we probably
// want to make vm recursion its own module

#include "barretenberg/circuit_checker/circuit_checker.hpp"

#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"
#include "barretenberg/sumcheck/instance/prover_instance.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "barretenberg/vm/avm/generated/circuit_builder.hpp"
#include "barretenberg/vm/avm/generated/composer.hpp"
#include "barretenberg/vm/avm/recursion/avm_recursive_flavor.hpp"
#include "barretenberg/vm/avm/recursion/avm_recursive_verifier.hpp"
#include "barretenberg/vm/avm/tests/helpers.test.hpp"
#include "barretenberg/vm/avm/trace/common.hpp"
#include "barretenberg/vm/avm/trace/helper.hpp"
#include "barretenberg/vm/avm/trace/trace.hpp"
#include <gtest/gtest.h>

namespace tests_avm {

using namespace bb;
using namespace bb::avm_trace;

namespace {
auto& engine = bb::numeric::get_debug_randomness();
}

class AvmRecursiveTests : public ::testing::Test {
  public:
    using RecursiveFlavor = AvmRecursiveFlavor_<UltraCircuitBuilder>;

    using InnerFlavor = typename RecursiveFlavor::NativeFlavor;
    using InnerBuilder = AvmCircuitBuilder;
    using InnerProver = AvmProver;
    using InnerVerifier = AvmVerifier;
    using InnerG1 = InnerFlavor::Commitment;
    using InnerFF = InnerFlavor::FF;

    using Transcript = InnerFlavor::Transcript;

    // Note: removed templating from eccvm one
    using RecursiveVerifier = AvmRecursiveVerifier_<RecursiveFlavor>;

    using OuterBuilder = typename RecursiveFlavor::CircuitBuilder;
    using OuterProver = UltraProver_<UltraFlavor>;
    using OuterVerifier = UltraVerifier_<UltraFlavor>;
    using OuterProverInstance = ProverInstance_<UltraFlavor>;

    static void SetUpTestSuite() { bb::srs::init_crs_factory("../srs_db/ignition"); }

    // Generate an extremely simple avm trace
    // - no public inputs etc

    static AvmCircuitBuilder generate_avm_circuit()
    {
        AvmTraceBuilder trace_builder(generate_base_public_inputs());
        AvmCircuitBuilder builder;

        trace_builder.op_set(0, 1, 1, AvmMemoryTag::U8);
        trace_builder.op_set(0, 1, 2, AvmMemoryTag::U8);
        trace_builder.op_add(0, 1, 2, 3, AvmMemoryTag::U8);
        trace_builder.op_return(0, 0, 0);
        auto trace = trace_builder.finalize();

        builder.set_trace(std::move(trace));
        builder.check_circuit();
        info("inner builder - num gates: ", builder.get_num_gates());

        return builder;
    }
};

TEST_F(AvmRecursiveTests, recursion)
{
    // GTEST_SKIP() << "Skipping single test";
    AvmCircuitBuilder circuit_builder = generate_avm_circuit();
    AvmComposer composer = AvmComposer();
    AvmProver prover = composer.create_prover(circuit_builder);
    AvmVerifier verifier = composer.create_verifier(circuit_builder);

    HonkProof proof = prover.construct_proof();

    // NOTE(md): got to do something about these public inputs
    auto public_inputs = generate_base_public_inputs();
    std::vector<std::vector<InnerFF>> public_inputs_vec =
        bb::avm_trace::copy_public_inputs_columns(public_inputs, {}, {});

    bool verified = verifier.verify_proof(proof, public_inputs_vec);
    info("proof verified: ", verified);
    ASSERT_TRUE(verified);

    // Create the outer verifier, to verify the proof
    const std::shared_ptr<AvmFlavor::VerificationKey> verification_key = verifier.key;
    // Verification key contains the commitments to things listed in the verifiercommitments class
    // info((*verification_key).main_clk);

    info("got verification key");

    OuterBuilder outer_circuit;
    RecursiveVerifier recursive_verifier{ &outer_circuit, verification_key };

    info("make recursive verifier");

    // Note(md): no inputs are provided here - so the verifier is under-constrained in respect to public inputs
    // If we return the pairing points then potentially they can be recursively verified nicely?? - but it is not clear
    // how aggregation will work unless we make sure the avm has the same circuit size as other things
    recursive_verifier.verify_proof(proof);

    info("Recursive verifier: num gates = ", outer_circuit.num_gates);
    info("Outer circuit failed? ", outer_circuit.failed());
    CircuitChecker::check(outer_circuit);

    // Make a proof of the verification of an AVM proof
    const size_t srs_size = 1 << 23;
    auto ultra_instance = std::make_shared<OuterProverInstance>(
        outer_circuit, TraceStructure::NONE, std::make_shared<bb::CommitmentKey<curve::BN254>>(srs_size));
    OuterProver ultra_prover(ultra_instance);
    auto ultra_verification_key = std::make_shared<UltraFlavor::VerificationKey>(ultra_instance->proving_key);
    OuterVerifier ultra_verifier(ultra_verification_key);

    auto recursion_proof = ultra_prover.construct_proof();
    bool recursion_verified = ultra_verifier.verify_proof(recursion_proof);

    info("verified recursive proof, ", recursion_verified);
}
} // namespace tests_avm
