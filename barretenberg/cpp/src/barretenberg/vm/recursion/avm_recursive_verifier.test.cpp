

#include "barretenberg/vm/recursion/avm_recursive_verifier.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"
#include "barretenberg/sumcheck/instance/prover_instance.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "barretenberg/vm/avm_trace/avm_common.hpp"
#include "barretenberg/vm/avm_trace/avm_helper.hpp"
#include "barretenberg/vm/avm_trace/avm_trace.hpp"
#include "barretenberg/vm/generated/avm_circuit_builder.hpp"
#include "barretenberg/vm/generated/avm_composer.hpp"
#include "barretenberg/vm/recursion/avm_recursive_flavor.hpp"
#include "barretenberg/vm/tests/helpers.test.hpp"
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
    using InnerBF = InnerFlavor::BF;

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
        trace_builder.return_op(0, 0, 0);
        auto trace = trace_builder.finalize();

        builder.set_trace(std::move(trace));
        builder.check_circuit();

        return builder;
    }
};

TEST_F(AvmRecursiveTests, recursion)
{

    AvmCircuitBuilder circuit_builder = generate_avm_circuit();
    AvmComposer composer = AvmComposer();
    AvmProver prover = composer.create_prover(circuit_builder);
    AvmVerifier verifier = composer.create_verifier(circuit_builder);

    HonkProof proof = prover.construct_proof();

    // NOTE(md): got to do something about these public inputs
    auto public_inputs = generate_base_public_inputs();
    std::vector<std::vector<InnerFF>> public_inputs_vec = bb::avm_trace::copy_public_inputs_columns(public_inputs);

    bool verified = verifier.verify_proof(proof, public_inputs_vec);
    info("proof verified: ", verified);
    ASSERT_TRUE(verified);

    // Create the outer verifier, to verify the proof
    const std::shared_ptr<AvmFlavor::VerificationKey> verification_key = verifier.key;
    // Verification key contains the commitments to things listed in the verifiercommitments class
    // info((*verification_key).main_clk);

    OuterBuilder outer_circuit;
    RecursiveVerifier recursive_verifier{ &outer_circuit, verification_key };

    // Note(md): no inputs are provided here - so the verifier is under-constrained in respect to public inputs
    // If we return the pairing points then potentially they can be recursively verified nicely?? - but it is not clear
    // how aggregation will work unless we make sure the avm has the same circuit size as other things
    recursive_verifier.verify_proof(proof);
}
} // namespace tests_avm
