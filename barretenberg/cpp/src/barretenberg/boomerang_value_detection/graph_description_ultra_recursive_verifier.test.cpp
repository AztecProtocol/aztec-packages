#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_recursive_flavor.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_verification_keys_comparator.hpp"
#include "barretenberg/stdlib/test_utils/tamper_proof.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

namespace bb::stdlib::recursion::honk {

/**
 * @brief Test suite for recursive verification of  Honk proofs for both Ultra and Mega arithmetisation.
 * @details `Inner*` types describe the type of circuits (and everything else required to generate a proof) that we aim
 * to recursively verify. `Outer*` describes the arithmetisation of the recursive verifier circuit and the types
 * required to ensure the recursive verifier circuit is correct (i.e. by producing a proof and verifying it).
 *
 * @tparam RecursiveFlavor defines the recursive verifier, what the arithmetisation of its circuit should be and what
 * types of proofs it recursively verifies.
 */
template <typename RecursiveFlavor> class BoomerangRecursiveVerifierTest : public testing::Test {

    // Define types for the inner circuit, i.e. the circuit whose proof will be recursively verified
    using InnerFlavor = typename RecursiveFlavor::NativeFlavor;
    using InnerProver = UltraProver_<InnerFlavor>;
    using InnerVerifier = UltraVerifier_<InnerFlavor>;
    using InnerBuilder = typename InnerFlavor::CircuitBuilder;
    using InnerDeciderProvingKey = DeciderProvingKey_<InnerFlavor>;
    using InnerCurve = bn254<InnerBuilder>;
    using InnerCommitment = InnerFlavor::Commitment;
    using InnerFF = InnerFlavor::FF;

    // Defines types for the outer circuit, i.e. the circuit of the recursive verifier
    using OuterBuilder = typename RecursiveFlavor::CircuitBuilder;
    using OuterFlavor =
        std::conditional_t<IsMegaBuilder<OuterBuilder>,
                           MegaFlavor,
                           std::conditional_t<HasIPAAccumulator<RecursiveFlavor>, UltraRollupFlavor, UltraFlavor>>;
    using OuterProver = UltraProver_<OuterFlavor>;
    using OuterVerifier = UltraVerifier_<OuterFlavor>;
    using OuterDeciderProvingKey = DeciderProvingKey_<OuterFlavor>;

    using RecursiveVerifier = UltraRecursiveVerifier_<RecursiveFlavor>;
    using VerificationKey = typename RecursiveVerifier::VerificationKey;

    using PairingObject = PairingPoints<OuterBuilder>;
    using VerifierOutput = bb::stdlib::recursion::honk::UltraRecursiveVerifierOutput<OuterBuilder>;

    /**
     * @brief Create a non-trivial arbitrary inner circuit, the proof of which will be recursively verified
     *
     * @param builder
     * @param public_inputs
     * @param log_num_gates
     */

    static InnerBuilder create_inner_circuit(size_t log_num_gates = 10)
    {
        using fr = typename InnerCurve::ScalarFieldNative;

        InnerBuilder builder;

        // Create 2^log_n many add gates based on input log num gates
        const size_t num_gates = (1 << log_num_gates);
        for (size_t i = 0; i < num_gates; ++i) {
            fr a = fr::random_element();
            uint32_t a_idx = builder.add_variable(a);

            fr b = fr::random_element();
            fr c = fr::random_element();
            fr d = a + b + c;
            uint32_t b_idx = builder.add_variable(b);
            uint32_t c_idx = builder.add_variable(c);
            uint32_t d_idx = builder.add_variable(d);

            builder.create_big_add_gate({ a_idx, b_idx, c_idx, d_idx, fr(1), fr(1), fr(1), fr(-1), fr(0) });
        }
        PairingPoints<InnerBuilder>::add_default_to_public_inputs(builder);

        if constexpr (HasIPAAccumulator<RecursiveFlavor>) {
            auto [stdlib_opening_claim, ipa_proof] =
                IPA<grumpkin<InnerBuilder>>::create_fake_ipa_claim_and_proof(builder);
            stdlib_opening_claim.set_public();
            builder.ipa_proof = ipa_proof;
        }
        return builder;
    };

  public:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    /**
     * @brief Construct a recursive verification circuit for the proof of an inner circuit then  check the number of
     * unconstrained variables in the circuit
     */
    static void test_recursive_verification()
    {
        // Create an arbitrary inner circuit
        auto inner_circuit = create_inner_circuit();

        // Generate a proof over the inner circuit
        auto proving_key = std::make_shared<InnerDeciderProvingKey>(inner_circuit);
        auto verification_key = std::make_shared<typename InnerFlavor::VerificationKey>(proving_key->get_precomputed());
        InnerProver inner_prover(proving_key, verification_key);
        auto inner_proof = inner_prover.construct_proof();

        // Create a recursive verification circuit for the proof of the inner circuit
        OuterBuilder outer_circuit;
        auto stdlib_vk_and_hash =
            std::make_shared<typename RecursiveFlavor::VKAndHash>(outer_circuit, verification_key);
        RecursiveVerifier verifier{ &outer_circuit, stdlib_vk_and_hash };
        verifier.key->vk_and_hash->vk->num_public_inputs.fix_witness();
        verifier.key->vk_and_hash->vk->pub_inputs_offset.fix_witness();

        VerifierOutput output = verifier.verify_proof(inner_proof);
        PairingObject pairing_points = output.points_accumulator;
        pairing_points.P0.x.fix_witness();
        pairing_points.P0.y.fix_witness();
        pairing_points.P1.x.fix_witness();
        pairing_points.P1.y.fix_witness();
        if constexpr (HasIPAAccumulator<OuterFlavor>) {
            output.ipa_claim.set_public();
            outer_circuit.ipa_proof = output.ipa_proof.get_value();
        }
        info("Recursive Verifier: num gates = ", outer_circuit.get_estimated_num_finalized_gates());

        // Check for a failure flag in the recursive verifier circuit
        EXPECT_EQ(outer_circuit.failed(), false) << outer_circuit.err();

        outer_circuit.finalize_circuit(false);
        auto graph = cdg::StaticAnalyzer(outer_circuit);
        auto connected_components = graph.find_connected_components();
        EXPECT_EQ(connected_components.size(), 3);
        info("Connected components: ", connected_components.size());
        auto variables_in_one_gate = graph.show_variables_in_one_gate(outer_circuit);
        EXPECT_EQ(variables_in_one_gate.size(), 2);
    }
};

// Run the recursive verifier tests with conventional Ultra builder and Goblin builder
using Flavors = testing::Types<UltraRecursiveFlavor_<UltraCircuitBuilder>>;

TYPED_TEST_SUITE(BoomerangRecursiveVerifierTest, Flavors);

HEAVY_TYPED_TEST(BoomerangRecursiveVerifierTest, SingleRecursiveVerification)
{
    TestFixture::test_recursive_verification();
};

} // namespace bb::stdlib::recursion::honk
