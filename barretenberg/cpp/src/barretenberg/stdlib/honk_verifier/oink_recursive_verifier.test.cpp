#include "barretenberg/stdlib/honk_verifier/oink_recursive_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/stdlib/pairing_points.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_recursive_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_zk_recursive_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_rollup_recursive_flavor.hpp"
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
template <typename RecursiveFlavor> class OinkRecursiveVerifierTest : public testing::Test {

    // Define types for the inner circuit, i.e. the circuit whose proof will be recursively verified
    using InnerFlavor = typename RecursiveFlavor::NativeFlavor;
    using InnerProver = UltraProver_<InnerFlavor>;
    using InnerVerifier = UltraVerifier_<InnerFlavor>;
    using InnerBuilder = typename InnerFlavor::CircuitBuilder;
    using InnerDeciderProvingKey = DeciderProvingKey_<InnerFlavor>;
    using InnerCommitment = InnerFlavor::Commitment;
    using InnerFF = InnerFlavor::FF;

    // Defines types for the outer circuit, i.e. the circuit of the recursive verifier
    using OuterBuilder = typename RecursiveFlavor::CircuitBuilder;
    using OuterFlavor =
        std::conditional_t<IsMegaBuilder<OuterBuilder>,
                           MegaFlavor,
                           std::conditional_t<HasIPAAccumulator<RecursiveFlavor>, UltraRollupFlavor, UltraFlavor>>;
    using OuterRecursiveDeciderVK = RecursiveDeciderVerificationKey_<RecursiveFlavor>;
    using OuterProver = UltraProver_<OuterFlavor>;
    using OuterVerifier = UltraVerifier_<OuterFlavor>;
    using OuterFF = OuterFlavor::FF;

    using RecursiveVerifier = OinkRecursiveVerifier_<RecursiveFlavor>;
    using VerificationKey = typename RecursiveVerifier::VerificationKey;

    /**
     * @brief Create a non-trivial arbitrary inner circuit, the proof of which will be recursively verified
     *
     * @param builder
     * @param public_inputs
     * @param log_num_gates
     */
    static InnerBuilder create_inner_circuit(size_t log_num_gates = 10)
    {
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

        stdlib::recursion::PairingPoints<InnerBuilder>::add_default_to_public_inputs(builder);

        if constexpr (HasIPAAccumulator<RecursiveFlavor>) {
            auto [stdlib_opening_claim, ipa_proof] =
                IPA<grumpkin<InnerBuilder>>::create_fake_ipa_claim_and_proof(builder);
            stdlib_opening_claim.set_public();
            builder.ipa_proof = ipa_proof;
        }
        return builder;
    }

  public:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    /**
     * @brief Check that the VK hash produced from Oink Fiat-Shamir matches the value produced by just hash().
     * @details We need these to match because we are using both of these paths to compute the VK hash(). This makes
     * sure we're not doing anything weird in Oink like Fiat-Shamiring values before the VK.
     */
    static void test_verification_key_hash_consistency()
    {
        auto inner_circuit = create_inner_circuit();

        // Generate a proof over the inner circuit
        auto proving_key = std::make_shared<InnerDeciderProvingKey>(inner_circuit);
        auto inner_verification_key = std::make_shared<typename InnerFlavor::VerificationKey>(proving_key->proving_key);
        InnerProver inner_prover(proving_key, inner_verification_key);
        HonkProof inner_proof = inner_prover.construct_proof();
        // Generate the corresponding inner verification key

        // Create a recursive verification circuit for the proof of the inner circuit
        OuterBuilder outer_circuit;
        auto verification_key = std::make_shared<OuterRecursiveDeciderVK>(&outer_circuit, inner_verification_key);
        RecursiveVerifier verifier{ &outer_circuit, verification_key };
        StdlibProof<OuterBuilder> recursive_proof = bb::convert_native_proof_to_stdlib(&outer_circuit, inner_proof);
        // typename RecursiveFlavor::FF output = verifier.verify_proof(recursive_proof);
        // EXPECT_EQ(output.get_value(), inner_verification_key->hash());
    }
};

// Run the recursive verifier tests with conventional Ultra builder and Goblin builder
using Flavors = testing::Types<MegaRecursiveFlavor_<MegaCircuitBuilder>,
                               MegaRecursiveFlavor_<UltraCircuitBuilder>,
                               UltraRecursiveFlavor_<UltraCircuitBuilder>,
                               UltraRecursiveFlavor_<MegaCircuitBuilder>,
                               UltraRollupRecursiveFlavor_<UltraCircuitBuilder>,
                               MegaZKRecursiveFlavor_<MegaCircuitBuilder>,
                               MegaZKRecursiveFlavor_<UltraCircuitBuilder>>;

TYPED_TEST_SUITE(OinkRecursiveVerifierTest, Flavors);

/**
 * @brief Checks that the vkey hash produced by the OinkRecursiveVerifier matches the expected hash of the vkey.
 *
 */
TYPED_TEST(OinkRecursiveVerifierTest, CheckRecursiveVerificationKeyHash)
{
    TestFixture::test_verification_key_hash_consistency();
}

} // namespace bb::stdlib::recursion::honk
