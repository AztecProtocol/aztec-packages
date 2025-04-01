#include "barretenberg/vm2/constraining/recursion/recursive_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/prover.hpp"
#include "barretenberg/vm2/constraining/recursion/recursive_flavor.hpp"
#include "barretenberg/vm2/constraining/verifier.hpp"
#include "barretenberg/vm2/proving_helper.hpp"
#include "barretenberg/vm2/simulation/events/alu_event.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"
#include "barretenberg/vm2/tracegen_helper.hpp"

#include <gtest/gtest.h>

namespace bb::avm2::tracegen {

using namespace bb;

class AvmRecursiveTests : public ::testing::Test {
  public:
    using RecursiveFlavor = Avm2RecursiveFlavor_<UltraCircuitBuilder>;

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

    static void SetUpTestSuite() { bb::srs::init_crs_factory(bb::srs::get_ignition_crs_path()); }

    // Generate an extremely simple avm trace
    TraceContainer generate_avm_circuit()
    {
        AvmTraceGenHelper trace_gen_helper;

        return trace_gen_helper.generate_trace({
            .alu = { { .operation = simulation::AluOperation::ADD, .a = 1, .b = 2, .c = 3, .tag = MemoryTag::U16 }, },
        });
    }
};

TEST_F(AvmRecursiveTests, recursion)
{
    // TODO: Do we still want to use this env variable?
    if (std::getenv("AVM_ENABLE_FULL_PROVING") == nullptr) {
        GTEST_SKIP();
    }

    TraceContainer trace = generate_avm_circuit();

    InnerProver prover;
    const auto [proof, vk_data] = prover.prove(std::move(trace));
    const std::shared_ptr<InnerFlavor::VerificationKey> verification_key = prover.create_verification_key(vk_data);
    InnerVerifier verifier(verification_key);

    const bool verified = verifier.verify_proof(proof, { { 0 } }); // Empty public inputs.

    ASSERT_TRUE(verified) << "native proof verification failed";

    // Create the outer verifier, to verify the proof
    OuterBuilder outer_circuit;
    RecursiveVerifier recursive_verifier{ &outer_circuit, verification_key };

    auto agg_object =
        stdlib::recursion::init_default_aggregation_state<OuterBuilder, typename RecursiveFlavor::Curve>(outer_circuit);

    auto agg_output = recursive_verifier.verify_proof(proof, {}, agg_object);

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

} // namespace bb::avm2::tracegen
