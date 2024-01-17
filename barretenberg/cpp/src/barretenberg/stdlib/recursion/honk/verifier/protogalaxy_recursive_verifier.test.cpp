#include "barretenberg/stdlib/recursion/honk/verifier/protogalaxy_recursive_verifier.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/flavor/ultra_recursive.hpp"
#include "barretenberg/stdlib/hash/blake3s/blake3s.hpp"
#include "barretenberg/stdlib/hash/pedersen/pedersen.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/recursion/honk/verifier/decider_recursive_verifier.hpp"
#include "barretenberg/ultra_honk/ultra_composer.hpp"

namespace proof_system::plonk::stdlib::recursion::honk {
template <typename BuilderType> class ProtogalaxyRecursiveTest : public testing::Test {
    // Define types relevant for testing
    using UltraFlavor = ::proof_system::honk::flavor::Ultra;
    using GoblinUltraFlavor = ::proof_system::honk::flavor::GoblinUltra;
    using UltraComposer = ::proof_system::honk::UltraComposer_<UltraFlavor>;
    using GoblinUltraComposer = ::proof_system::honk::UltraComposer_<GoblinUltraFlavor>;

    using InnerFlavor = UltraFlavor; // type this
    using InnerComposer = UltraComposer;
    using Instance = ::proof_system::honk::ProverInstance_<InnerFlavor>;
    using InnerBuilder = typename InnerComposer::CircuitBuilder;
    using InnerCurve = bn254<InnerBuilder>;
    using Commitment = InnerFlavor::Commitment;
    using FF = InnerFlavor::FF;

    // Types for recursive verifier circuit
    using RecursiveFlavor = ::proof_system::honk::flavor::UltraRecursive_<BuilderType>;
    using RecursiveVerifierInstances = ::proof_system::honk::VerifierInstances_<RecursiveFlavor, 2>;
    using FoldingRecursiveVerifier = ProtoGalaxyRecursiveVerifier_<RecursiveVerifierInstances>;
    using OuterBuilder = BuilderType;
    using DeciderRecursiveVerifier = DeciderRecursiveVerifier_<RecursiveFlavor>;
    using NativeVerifierInstances = ::proof_system::honk::VerifierInstances_<InnerFlavor, 2>;
    using NativeFoldingVerifier = proof_system::honk::ProtoGalaxyVerifier_<NativeVerifierInstances>;

    /**
     * @brief Create a non-trivial arbitrary inner circuit, the proof of which will be recursively verified
     *
     * @param builder
     * @param public_inputs
     * @param log_num_gates
     */
    static void create_inner_circuit(InnerBuilder& builder, size_t log_num_gates = 10)
    {
        using fr_ct = InnerCurve::ScalarField;
        using fq_ct = InnerCurve::BaseField;
        using public_witness_ct = InnerCurve::public_witness_ct;
        using witness_ct = InnerCurve::witness_ct;
        using byte_array_ct = InnerCurve::byte_array_ct;
        using fr = typename InnerCurve::ScalarFieldNative;

        // Create 2^log_n many add gates based on input log num gates
        const size_t num_gates = 1 << log_num_gates;
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

        // Define some additional non-trivial but arbitrary circuit logic
        fr_ct a(public_witness_ct(&builder, fr::random_element()));
        fr_ct b(public_witness_ct(&builder, fr::random_element()));
        fr_ct c(public_witness_ct(&builder, fr::random_element()));

        for (size_t i = 0; i < 32; ++i) {
            a = (a * b) + b + a;
            a = a.madd(b, c);
        }
        pedersen_hash<InnerBuilder>::hash({ a, b });
        byte_array_ct to_hash(&builder, "nonsense test data");
        blake3s(to_hash);

        fr bigfield_data = fr::random_element();
        fr bigfield_data_a{ bigfield_data.data[0], bigfield_data.data[1], 0, 0 };
        fr bigfield_data_b{ bigfield_data.data[2], bigfield_data.data[3], 0, 0 };

        fq_ct big_a(fr_ct(witness_ct(&builder, bigfield_data_a.to_montgomery_form())), fr_ct(witness_ct(&builder, 0)));
        fq_ct big_b(fr_ct(witness_ct(&builder, bigfield_data_b.to_montgomery_form())), fr_ct(witness_ct(&builder, 0)));

        big_a* big_b;
    };

  public:
    static void SetUpTestSuite() { barretenberg::srs::init_crs_factory("../srs_db/ignition"); }

    /**
     * @brief Create inner circuit and call check_circuit on it
     *
     */
    static void test_inner_circuit()
    {
        InnerBuilder builder;

        create_inner_circuit(builder);

        bool result = builder.check_circuit();
        EXPECT_EQ(result, true);
    }

    static void test_evaluate_perturbator()
    {
        OuterBuilder builder;
        using fr_ct = bn254<OuterBuilder>::ScalarField;
        using fr = bn254<OuterBuilder>::ScalarFieldNative;

        std::vector<fr> coeffs;
        std::vector<fr_ct> coeffs_ct;
        for (size_t idx = 0; idx < 8; idx++) {
            auto el = fr::random_element();
            coeffs.emplace_back(el);
            coeffs_ct.emplace_back(fr_ct(&builder, el));
        }
        Polynomial<fr> poly(coeffs);
        fr point = fr::random_element();
        fr_ct point_ct(fr_ct(&builder, point));
        auto res1 = poly.evaluate(point);

        auto res2 = FoldingRecursiveVerifier::evaluate_perturbator(coeffs_ct, point_ct);
        EXPECT_EQ(res1, res2.get_value());
    }

    static void test_recursive_folding()
    {
        InnerBuilder builder1;
        // create_inner_circuit(builder1);
        builder1.add_public_variable(FF(1));
        InnerBuilder builder2;
        builder2.add_public_variable(FF(1));
        // create_inner_circuit(builder2);
        InnerComposer inner_composer = InnerComposer();
        auto instance1 = inner_composer.create_instance(builder1);
        auto instance2 = inner_composer.create_instance(builder2);
        auto instances = std::vector<std::shared_ptr<Instance>>{ instance1, instance2 };
        // commitment key accessible
        auto inner_folding_prover = inner_composer.create_folding_prover(instances, inner_composer.commitment_key);
        auto inner_folding_proof = inner_folding_prover.fold_instances();
        // auto native_folding_verifier = inner_composer.create_folding_verifier();
        // auto res = native_folding_verifier.verify_folding_proof(inner_folding_proof.folding_data);
        // EXPECT_EQ(res, true);

        OuterBuilder outer_folding_circuit;
        FoldingRecursiveVerifier verifier{ &outer_folding_circuit };
        auto res = verifier.verify_folding_proof(inner_folding_proof.folding_data);
        EXPECT_EQ(res, true);
        info("Recursive Verifier with Ultra instances: num gates = ", outer_folding_circuit.num_gates);

        // Check for a failure flag in the recursive verifier circuit
        EXPECT_EQ(outer_folding_circuit.failed(), false) << outer_folding_circuit.err();

        // TODO: construct and verify a proof for the recursive folding verifier

        auto inner_decider_prover =
            inner_composer.create_decider_prover(inner_folding_proof.accumulator, inner_composer.commitment_key);
        auto inner_decider_proof = inner_decider_prover.construct_proof();
        OuterBuilder outer_decider_circuit;
        DeciderRecursiveVerifier decider_verifier{ &outer_decider_circuit };
        auto pairing_points = decider_verifier.verify_proof(inner_decider_proof);
        static_cast<void>(pairing_points);
        // need to check these pairing points
        info("Decider Recursive Verifier: num gates = ", outer_decider_circuit.num_gates);
        // Check for a failure flag in the recursive verifier circuit
        EXPECT_EQ(outer_decider_circuit.failed(), false) << outer_decider_circuit.err();
    }
};

using BuilderTypes = testing::Types<UltraCircuitBuilder, GoblinUltraCircuitBuilder>;
TYPED_TEST_SUITE(ProtogalaxyRecursiveTest, BuilderTypes);

TYPED_TEST(ProtogalaxyRecursiveTest, InnerCircuit)
{
    TestFixture::test_inner_circuit();
}

TYPED_TEST(ProtogalaxyRecursiveTest, NewEvaluate)
{
    TestFixture::test_evaluate_perturbator();
}

TYPED_TEST(ProtogalaxyRecursiveTest, FirstRound)
{
    TestFixture::test_recursive_folding();
}

} // namespace proof_system::plonk::stdlib::recursion::honk