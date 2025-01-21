#include "barretenberg/vm/avm/recursion/recursive_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "barretenberg/vm/avm/generated/circuit_builder.hpp"
#include "barretenberg/vm/avm/generated/composer.hpp"
#include "barretenberg/vm/avm/recursion/recursive_flavor.hpp"
#include "barretenberg/vm/avm/tests/helpers.test.hpp"
#include "barretenberg/vm/avm/trace/common.hpp"
#include "barretenberg/vm/avm/trace/helper.hpp"
#include "barretenberg/vm/avm/trace/public_inputs.hpp"
#include "barretenberg/vm/avm/trace/trace.hpp"
#include <gtest/gtest.h>

namespace tests_avm {

using namespace bb;
using namespace bb::avm_trace;

class AvmRecursiveTests : public ::testing::Test {
  public:
    using RecursiveFlavor = AvmRecursiveFlavor_<UltraCircuitBuilder>;

    using InnerFlavor = typename RecursiveFlavor::NativeFlavor;
    using InnerBuilder = bb::avm::AvmCircuitBuilder;
    using InnerProver = bb::avm::AvmProver;
    using InnerVerifier = bb::avm::AvmVerifier;
    using InnerComposer = bb::avm::AvmComposer;
    using InnerG1 = InnerFlavor::Commitment;
    using InnerFF = InnerFlavor::FF;

    using Transcript = InnerFlavor::Transcript;

    using RecursiveVerifier = bb::avm::AvmRecursiveVerifier_<RecursiveFlavor>;

    using OuterBuilder = typename RecursiveFlavor::CircuitBuilder;
    using OuterProver = UltraProver;
    using OuterVerifier = UltraVerifier;
    using OuterDeciderProvingKey = DeciderProvingKey_<UltraFlavor>;

    static void SetUpTestSuite() { bb::srs::init_crs_factory(bb::srs::get_ignition_crs_path()); }

    AvmPublicInputs public_inputs;

    // Generate an extremely simple avm trace
    InnerBuilder generate_avm_circuit()
    {
        public_inputs = generate_base_public_inputs();
        AvmTraceBuilder trace_builder(public_inputs);
        InnerBuilder builder;

        trace_builder.op_set(0, 1, 1, AvmMemoryTag::U8);
        trace_builder.op_set(0, 1, 2, AvmMemoryTag::U8);
        trace_builder.op_add(0, 1, 2, 3);
        trace_builder.op_set(0, 0, 100, AvmMemoryTag::U32);
        trace_builder.op_return(0, 0, 100);
        auto trace = trace_builder.finalize(); // Passing true enables a longer trace with lookups

        inject_end_gas_values(public_inputs, trace);

        builder.set_trace(std::move(trace));
        builder.check_circuit();
        vinfo("inner builder - num gates: ", builder.get_estimated_num_finalized_gates());

        return builder;
    }
};

TEST_F(AvmRecursiveTests, recursion)
{
    if (std::getenv("AVM_ENABLE_FULL_PROVING") == nullptr) {
        GTEST_SKIP();
    }

    InnerBuilder circuit_builder = generate_avm_circuit();
    InnerComposer composer = InnerComposer();
    InnerProver prover = composer.create_prover(circuit_builder);
    InnerVerifier verifier = composer.create_verifier(circuit_builder);

    HonkProof proof = prover.construct_proof();

    // We just pad all the public inputs with the right number of zeroes
    std::vector<FF> kernel_inputs(KERNEL_INPUTS_LENGTH);
    std::vector<FF> kernel_value_outputs(KERNEL_OUTPUTS_LENGTH);
    std::vector<FF> kernel_side_effect_outputs(KERNEL_OUTPUTS_LENGTH);
    std::vector<FF> kernel_metadata_outputs(KERNEL_OUTPUTS_LENGTH);
    std::vector<FF> calldata{ {} };
    std::vector<FF> returndata{ {} };

    std::vector<std::vector<InnerFF>> public_inputs{
        kernel_inputs, kernel_value_outputs, kernel_side_effect_outputs, kernel_metadata_outputs
    };
    std::vector<std::vector<InnerFF>> public_inputs_vec{
        kernel_inputs, kernel_value_outputs, kernel_side_effect_outputs, kernel_metadata_outputs, calldata, returndata
    };

    bool verified = verifier.verify_proof(proof, public_inputs_vec);
    ASSERT_TRUE(verified) << "native proof verification failed";

    // Create the outer verifier, to verify the proof
    const std::shared_ptr<InnerFlavor::VerificationKey> verification_key = verifier.key;
    OuterBuilder outer_circuit;
    RecursiveVerifier recursive_verifier{ &outer_circuit, verification_key };

    auto agg_object =
        stdlib::recursion::init_default_aggregation_state<OuterBuilder, typename RecursiveFlavor::Curve>(outer_circuit);

    auto agg_output = recursive_verifier.verify_proof(proof, public_inputs_vec, agg_object);

    bool agg_output_valid =
        verification_key->pcs_verification_key->pairing_check(agg_output.P0.get_value(), agg_output.P1.get_value());

    ASSERT_TRUE(agg_output_valid) << "Pairing points (aggregation state) are not valid.";
    ASSERT_FALSE(outer_circuit.failed()) << "Outer circuit has failed.";

    bool outer_circuit_checked = CircuitChecker::check(outer_circuit);
    ASSERT_TRUE(outer_circuit_checked) << "outer circuit check failed";

    auto manifest = verifier.transcript->get_manifest();
    auto recursive_manifest = recursive_verifier.transcript->get_manifest();

    EXPECT_EQ(manifest.size(), recursive_manifest.size());
    for (size_t i = 0; i < recursive_manifest.size(); ++i) {
        EXPECT_EQ(recursive_manifest[i], manifest[i]);
    }

    for (auto const [key_el, rec_key_el] : zip_view(verifier.key->get_all(), recursive_verifier.key->get_all())) {
        EXPECT_EQ(key_el, rec_key_el.get_value());
    }

    EXPECT_EQ(verifier.key->circuit_size, recursive_verifier.key->circuit_size);
    EXPECT_EQ(verifier.key->num_public_inputs, recursive_verifier.key->num_public_inputs);

    // Make a proof of the verification of an AVM proof
    const size_t srs_size = 1 << 23;
    auto ultra_instance = std::make_shared<OuterDeciderProvingKey>(
        outer_circuit, TraceSettings{}, std::make_shared<bb::CommitmentKey<curve::BN254>>(srs_size));
    OuterProver ultra_prover(ultra_instance);
    auto ultra_verification_key = std::make_shared<UltraFlavor::VerificationKey>(ultra_instance->proving_key);
    OuterVerifier ultra_verifier(ultra_verification_key);

    vinfo("Recursive verifier: finalized num gates = ", outer_circuit.num_gates);

    auto recursion_proof = ultra_prover.construct_proof();
    bool recursion_verified = ultra_verifier.verify_proof(recursion_proof);
    EXPECT_TRUE(recursion_verified) << "recursion proof verification failed";
}
} // namespace tests_avm
