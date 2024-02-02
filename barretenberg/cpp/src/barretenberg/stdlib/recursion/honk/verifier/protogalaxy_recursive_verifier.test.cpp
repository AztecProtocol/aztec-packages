#include "barretenberg/stdlib/recursion/honk/verifier/protogalaxy_recursive_verifier.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/flavor/ultra_recursive.hpp"
#include "barretenberg/stdlib/hash/blake3s/blake3s.hpp"
#include "barretenberg/stdlib/hash/pedersen/pedersen.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/recursion/honk/verifier/decider_recursive_verifier.hpp"
#include "barretenberg/ultra_honk/ultra_composer.hpp"

namespace bb::stdlib::recursion::honk {
template <typename RecursiveFlavor> class ProtoGalaxyRecursiveTests : public testing::Test {
  public:
    // Define types relevant for testing
    using UltraComposer = ::bb::UltraComposer_<UltraFlavor>;
    using GoblinUltraComposer = ::bb::UltraComposer_<GoblinUltraFlavor>;

    using InnerFlavor = typename RecursiveFlavor::NativeFlavor;
    using InnerComposer = ::bb::UltraComposer_<InnerFlavor>;
    using Instance = ::bb::ProverInstance_<InnerFlavor>;
    using InnerBuilder = typename InnerComposer::CircuitBuilder;
    using InnerCurve = bn254<InnerBuilder>;
    using Commitment = typename InnerFlavor::Commitment;
    using FF = typename InnerFlavor::FF;

    // Types for veryfing a recursive verifier circuit
    using OuterBuilder = GoblinUltraCircuitBuilder;
    using OuterComposer = GoblinUltraComposer;

    using RecursiveVerifierInstances = ::bb::VerifierInstances_<RecursiveFlavor, 2>;
    using FoldingRecursiveVerifier = ProtoGalaxyRecursiveVerifier_<RecursiveVerifierInstances>;
    using DeciderRecursiveVerifier = DeciderRecursiveVerifier_<RecursiveFlavor>;
    using DeciderVerifier = DeciderVerifier_<InnerFlavor>;
    using NativeVerifierInstances = VerifierInstances_<InnerFlavor, 2>;
    using NativeFoldingVerifier = ProtoGalaxyVerifier_<NativeVerifierInstances>;

    static void SetUpTestSuite() { bb::srs::init_crs_factory("../srs_db/ignition"); }

    // Helper for getting composer for prover/verifier of recursive (outer) circuit
    template <typename BuilderT> static auto get_outer_composer()
    {
        if constexpr (IsGoblinBuilder<BuilderT>) {
            return GoblinUltraComposer();
        } else {
            return UltraComposer();
        }
    }

    /**
     * @brief Create a non-trivial arbitrary inner circuit, the proof of which will be recursively verified
     *
     * @param builder
     * @param public_inputs
     * @param log_num_gates
     *
     * TODO(https://github.com/AztecProtocol/barretenberg/issues/744): make testing utility with functionality shared
     * amongst test files
     */
    static void create_inner_circuit(InnerBuilder& builder, size_t log_num_gates = 10)
    {
        using fr_ct = typename InnerCurve::ScalarField;
        using fq_ct = typename InnerCurve::BaseField;
        using public_witness_ct = typename InnerCurve::public_witness_ct;
        using witness_ct = typename InnerCurve::witness_ct;
        using byte_array_ct = typename InnerCurve::byte_array_ct;
        using fr = typename InnerCurve::ScalarFieldNative;
        using point = typename InnerCurve::AffineElementNative;

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

        if constexpr (IsGoblinBuilder<InnerBuilder>) {
            auto p = point::one() * fr::random_element();
            auto scalar = fr::random_element();
            builder.queue_ecc_mul_accum(p, scalar);
            builder.queue_ecc_eq();
        }
    };

    static std::shared_ptr<Instance> fold_and_verify_native(const std::vector<std::shared_ptr<Instance>>& instances,
                                                            InnerComposer& composer)
    {
        auto folding_prover = composer.create_folding_prover(instances);
        auto folding_verifier = composer.create_folding_verifier();

        auto proof = folding_prover.fold_instances();
        auto next_accumulator = proof.accumulator;
        auto res = folding_verifier.verify_folding_proof(proof.folding_data);
        EXPECT_EQ(res, true);
        return next_accumulator;
    }

    /**
     *@brief Create inner circuit and call check_circuit on it
     */
    static void test_inner_circuit()
    {
        InnerBuilder builder;

        create_inner_circuit(builder);

        bool result = builder.check_circuit();
        EXPECT_EQ(result, true);
    };

    /**
     * @brief Ensure that evaluating the perturbator in the recursive folding verifier returns the same result as
     * evaluating in Polynomial class.
     *
     */
    static void test_new_evaluate()
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
    };

    /**
     * @brief Tests a simple recursive fold that is valid works as expected.
     *
     */
    static void test_recursive_folding()
    {
        // Create two arbitrary circuits for the first round of folding
        InnerBuilder builder1;

        create_inner_circuit(builder1);
        InnerBuilder builder2;
        builder2.add_public_variable(FF(1));
        create_inner_circuit(builder2);

        InnerComposer inner_composer = InnerComposer();
        auto instance1 = inner_composer.create_instance(builder1);
        auto instance2 = inner_composer.create_instance(builder2);
        auto instances = std::vector<std::shared_ptr<Instance>>{ instance1, instance2 };

        // Generate a folding proof
        auto inner_folding_prover = inner_composer.create_folding_prover(instances);
        auto inner_folding_proof = inner_folding_prover.fold_instances();

        // Create a recursive folding verifier circuit for the folding proof of the two instances
        OuterBuilder outer_folding_circuit;
        FoldingRecursiveVerifier verifier{ &outer_folding_circuit };
        verifier.verify_folding_proof(inner_folding_proof.folding_data);
        info("Folding Recursive Verifier: num gates = ", outer_folding_circuit.num_gates);

        // Perform native folding verification and ensure it returns the same result (either true or false) as calling
        // check_circuit on the recursive folding verifier
        auto native_folding_verifier = inner_composer.create_folding_verifier();
        auto native_folding_result = native_folding_verifier.verify_folding_proof(inner_folding_proof.folding_data);
        EXPECT_EQ(native_folding_result, !outer_folding_circuit.failed());

        // Ensure that the underlying native and recursive folding verification algorithms agree by ensuring the
        // manifestsproduced by each agree.
        auto recursive_folding_manifest = verifier.transcript->get_manifest();
        auto native_folding_manifest = native_folding_verifier.transcript->get_manifest();

        for (size_t i = 0; i < recursive_folding_manifest.size(); ++i) {
            EXPECT_EQ(recursive_folding_manifest[i], native_folding_manifest[i]);
        }

        // Check for a failure flag in the recursive verifier circuit
        EXPECT_EQ(outer_folding_circuit.failed(), false) << outer_folding_circuit.err();

        {
            auto composer = OuterComposer();
            auto instance = composer.create_instance(outer_folding_circuit);
            auto prover = composer.create_prover(instance);
            auto verifier = composer.create_verifier(instance);
            auto proof = prover.construct_proof();
            bool verified = verifier.verify_proof(proof);

            ASSERT(verified);
        }
    };

    /**
     * @brief Perform two rounds of folding valid circuits and then recursive verify the final decider proof,
     * make sure the verifer circuits pass check_circuit(). Ensure that the algorithm of the recursive and native
     * verifiers are identical by checking the manifests
     */
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/844): Fold the recursive folding verifier in tests once
    // we can fold instances of different sizes.
    static void test_full_protogalaxy_recursive()
    {
        // Create two arbitrary circuits for the first round of folding
        InnerBuilder builder1;

        create_inner_circuit(builder1);
        InnerBuilder builder2;
        builder2.add_public_variable(FF(1));
        create_inner_circuit(builder2);

        InnerComposer inner_composer = InnerComposer();
        auto instance1 = inner_composer.create_instance(builder1);
        auto instance2 = inner_composer.create_instance(builder2);
        auto instances = std::vector<std::shared_ptr<Instance>>{ instance1, instance2 };

        auto accumulator = fold_and_verify_native(instances, inner_composer);

        // Create another circuit to do a second round of folding
        InnerBuilder builder3;
        create_inner_circuit(builder3);
        auto instance3 = inner_composer.create_instance(builder3);
        instances = std::vector<std::shared_ptr<Instance>>{ accumulator, instance3 };

        accumulator = fold_and_verify_native(instances, inner_composer);

        // Create a decider proof for the relaxed instance obtained through folding
        auto inner_decider_prover = inner_composer.create_decider_prover(accumulator);
        auto inner_decider_proof = inner_decider_prover.construct_proof();

        // Create a decider verifier circuit for recursively verifying the decider proof
        OuterBuilder outer_decider_circuit;
        DeciderRecursiveVerifier decider_verifier{ &outer_decider_circuit };
        auto pairing_points = decider_verifier.verify_proof(inner_decider_proof);
        info("Decider Recursive Verifier: num gates = ", outer_decider_circuit.num_gates);
        // Check for a failure flag in the recursive verifier circuit
        EXPECT_EQ(outer_decider_circuit.failed(), false) << outer_decider_circuit.err();

        // Perform native verification then perform the pairing on the outputs of the recursive
        //  decider verifier and check that the result agrees.
        DeciderVerifier native_decider_verifier = inner_composer.create_decider_verifier(accumulator);
        auto native_result = native_decider_verifier.verify_proof(inner_decider_proof);
        auto recursive_result = native_decider_verifier.pcs_verification_key->pairing_check(
            pairing_points[0].get_value(), pairing_points[1].get_value());
        EXPECT_EQ(native_result, recursive_result);

        // Ensure that the underlying native and recursive decider verification algorithms agree by ensuring
        // the manifests produced are the same.
        auto recursive_decider_manifest = decider_verifier.transcript->get_manifest();
        auto native_decider_manifest = native_decider_verifier.transcript->get_manifest();
        for (size_t i = 0; i < recursive_decider_manifest.size(); ++i) {
            EXPECT_EQ(recursive_decider_manifest[i], native_decider_manifest[i]);
        }

        // Construct and verify a proof of the recursive decider verifier circuit
        {
            auto composer = OuterComposer();
            auto instance = composer.create_instance(outer_decider_circuit);
            auto prover = composer.create_prover(instance);
            auto verifier = composer.create_verifier(instance);
            auto proof = prover.construct_proof();
            bool verified = verifier.verify_proof(proof);

            ASSERT(verified);
        }
    };

    static void test_tampered_decider_proof()
    {
        // Create two arbitrary circuits for the first round of folding
        InnerBuilder builder1;

        create_inner_circuit(builder1);
        InnerBuilder builder2;
        builder2.add_public_variable(FF(1));
        create_inner_circuit(builder2);

        InnerComposer inner_composer = InnerComposer();
        auto instance1 = inner_composer.create_instance(builder1);
        auto instance2 = inner_composer.create_instance(builder2);
        auto instances = std::vector<std::shared_ptr<Instance>>{ instance1, instance2 };

        auto accumulator = fold_and_verify_native(instances, inner_composer);

        // Tamper with the accumulator by changing the target sum
        accumulator->target_sum = FF::random_element();

        // Create a decider proof for the relaxed instance obtained through folding
        auto inner_decider_prover = inner_composer.create_decider_prover(accumulator);
        auto inner_decider_proof = inner_decider_prover.construct_proof();

        // Create a decider verifier circuit for recursively verifying the decider proof
        OuterBuilder outer_decider_circuit;
        DeciderRecursiveVerifier decider_verifier{ &outer_decider_circuit };
        decider_verifier.verify_proof(inner_decider_proof);
        info("Decider Recursive Verifier: num gates = ", outer_decider_circuit.num_gates);

        // We expect the decider circuit check to fail due to the bad proof
        EXPECT_FALSE(outer_decider_circuit.check_circuit());
    };

    static void test_tampered_accumulator()
    {
        // Create two arbitrary circuits for the first round of folding
        InnerBuilder builder1;

        create_inner_circuit(builder1);
        InnerBuilder builder2;
        builder2.add_public_variable(FF(1));
        create_inner_circuit(builder2);

        InnerComposer inner_composer = InnerComposer();
        auto instance1 = inner_composer.create_instance(builder1);
        auto instance2 = inner_composer.create_instance(builder2);
        auto instances = std::vector<std::shared_ptr<Instance>>{ instance1, instance2 };

        auto accumulator = fold_and_verify_native(instances, inner_composer);

        // Create another circuit to do a second round of folding
        InnerBuilder builder3;
        create_inner_circuit(builder3);
        auto instance3 = inner_composer.create_instance(builder3);

        // Tamper with the accumulator
        instances = std::vector<std::shared_ptr<Instance>>{ accumulator, instance3 };
        accumulator->prover_polynomials.w_l[1] = FF::random_element();

        // Generate a folding proof
        auto inner_folding_prover = inner_composer.create_folding_prover(instances);
        auto inner_folding_proof = inner_folding_prover.fold_instances();

        // Create a recursive folding verifier circuit for the folding proof of the two instances
        OuterBuilder outer_folding_circuit;
        FoldingRecursiveVerifier verifier{ &outer_folding_circuit };
        verifier.verify_folding_proof(inner_folding_proof.folding_data);
        EXPECT_EQ(outer_folding_circuit.check_circuit(), false);
    };
};

using FlavorTypes = testing::Types<GoblinUltraRecursiveFlavor_<GoblinUltraCircuitBuilder>,
                                   UltraRecursiveFlavor_<GoblinUltraCircuitBuilder>>;
TYPED_TEST_SUITE(ProtoGalaxyRecursiveTests, FlavorTypes);

TYPED_TEST(ProtoGalaxyRecursiveTests, InnerCircuit)
{
    TestFixture::test_inner_circuit();
}

TYPED_TEST(ProtoGalaxyRecursiveTests, NewEvaluate)
{
    TestFixture::test_new_evaluate();
}

TYPED_TEST(ProtoGalaxyRecursiveTests, RecursiveFoldingTest)
{
    TestFixture::test_recursive_folding();
}

TYPED_TEST(ProtoGalaxyRecursiveTests, FullProtogalaxyRecursiveTest)
{

    TestFixture::test_full_protogalaxy_recursive();
}

TYPED_TEST(ProtoGalaxyRecursiveTests, TamperedDeciderProof)
{
    TestFixture::test_tampered_decider_proof();
}

TYPED_TEST(ProtoGalaxyRecursiveTests, TamperedAccumulator)
{
    TestFixture::test_tampered_accumulator();
}

} // namespace bb::stdlib::recursion::honk