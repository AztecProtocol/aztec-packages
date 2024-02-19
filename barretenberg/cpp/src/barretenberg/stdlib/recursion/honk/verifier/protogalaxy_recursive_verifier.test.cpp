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
    using NativeFlavor = typename RecursiveFlavor::NativeFlavor;
    using Composer = ::bb::UltraComposer_<NativeFlavor>;
    using Builder = typename RecursiveFlavor::CircuitBuilder;
    using ProverInstance = ::bb::ProverInstance_<NativeFlavor>;
    using VerifierInstance = ::bb::VerifierInstance_<NativeFlavor>;
    using RecursiveVerifierInstance = ::bb::stdlib::recursion::honk::RecursiveVerifierInstance_<RecursiveFlavor>;
    using Curve = bn254<Builder>;
    using Commitment = typename NativeFlavor::Commitment;
    using FF = typename NativeFlavor::FF;

    using RecursiveVerifierInstances = ::bb::stdlib::recursion::honk::RecursiveVerifierInstances_<RecursiveFlavor, 2>;
    using FoldingRecursiveVerifier = ProtoGalaxyRecursiveVerifier_<RecursiveVerifierInstances>;
    using DeciderRecursiveVerifier = DeciderRecursiveVerifier_<RecursiveFlavor>;
    using DeciderVerifier = DeciderVerifier_<NativeFlavor>;
    using NativeVerifierInstances = VerifierInstances_<NativeFlavor, 2>;
    using NativeFoldingVerifier = ProtoGalaxyVerifier_<NativeVerifierInstances>;

    static void SetUpTestSuite() { bb::srs::init_crs_factory("../srs_db/ignition"); }
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
    static void create_function_circuit(Builder& builder, size_t log_num_gates = 15)
    {
        using fr_ct = typename Curve::ScalarField;
        using fq_ct = typename Curve::BaseField;
        using public_witness_ct = typename Curve::public_witness_ct;
        using witness_ct = typename Curve::witness_ct;
        using byte_array_ct = typename Curve::byte_array_ct;
        using fr = typename Curve::ScalarFieldNative;
        using point = typename Curve::AffineElementNative;

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
        pedersen_hash<Builder>::hash({ a, b });
        byte_array_ct to_hash(&builder, "nonsense test data");
        blake3s(to_hash);

        fr bigfield_data = fr::random_element();
        fr bigfield_data_a{ bigfield_data.data[0], bigfield_data.data[1], 0, 0 };
        fr bigfield_data_b{ bigfield_data.data[2], bigfield_data.data[3], 0, 0 };

        fq_ct big_a(fr_ct(witness_ct(&builder, bigfield_data_a.to_montgomery_form())), fr_ct(witness_ct(&builder, 0)));
        fq_ct big_b(fr_ct(witness_ct(&builder, bigfield_data_b.to_montgomery_form())), fr_ct(witness_ct(&builder, 0)));

        big_a* big_b;

        if constexpr (IsGoblinBuilder<Builder>) {
            auto p = point::one() * fr::random_element();
            auto scalar = fr::random_element();
            builder.queue_ecc_mul_accum(p, scalar);
            builder.queue_ecc_eq();
        }
    };

    static std::tuple<std::shared_ptr<ProverInstance>, std::shared_ptr<VerifierInstance>> fold_and_verify_native(
        Composer& composer)
    {
        Builder builder1;
        create_function_circuit(builder1);
        Builder builder2;
        builder2.add_public_variable(FF(1));
        create_function_circuit(builder2);

        auto prover_instance_1 = composer.create_prover_instance(builder1);
        auto prover_instance_2 = composer.create_prover_instance(builder2);
        auto verifier_instance_1 = composer.create_verifier_instance(prover_instance_1);
        auto verifier_instance_2 = composer.create_verifier_instance(prover_instance_2);
        auto folding_prover = composer.create_folding_prover({ prover_instance_1, prover_instance_2 });
        auto folding_verifier = composer.create_folding_verifier({ verifier_instance_1, verifier_instance_2 });

        auto [prover_accumulator, folding_proof] = folding_prover.fold_instances();
        auto verifier_accumulator = folding_verifier.verify_folding_proof(folding_proof);
        return { prover_accumulator, verifier_accumulator };
    }

    /**
     *@brief Create inner circuit and call check_circuit on it
     */
    static void test_circuit()
    {
        Builder builder;

        create_function_circuit(builder);

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
        Builder builder;
        using fr_ct = bn254<Builder>::ScalarField;
        using fr = bn254<Builder>::ScalarFieldNative;

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
     * @brief Tests that a valid recursive fold  works as expected.
     *
     */
    static void test_recursive_folding()
    {
        // Create two arbitrary circuits for the first round of folding
        Builder builder1;
        create_function_circuit(builder1);
        Builder builder2;
        create_function_circuit(builder2);

        Composer composer = Composer();
        auto prover_instance_1 = composer.create_prover_instance(builder1);
        auto verifier_instance_1 = composer.create_verifier_instance(prover_instance_1);
        auto prover_instance_2 = composer.create_prover_instance(builder2);
        auto verifier_instance_2 = composer.create_verifier_instance(prover_instance_2);
        // Generate a folding proof
        auto folding_prover = composer.create_folding_prover({ prover_instance_1, prover_instance_2 });
        auto folding_proof = folding_prover.fold_instances();

        // Create a recursive folding verifier circuit for the folding proof of the two instances
        Builder folding_circuit;
        auto verifier =
            FoldingRecursiveVerifier(&folding_circuit, verifier_instance_1, { verifier_instance_2->verification_key });
        auto recursive_verifier_accumulator = verifier.verify_folding_proof(folding_proof.folding_data);
        auto acc = std::make_shared<VerifierInstance>(recursive_verifier_accumulator->get_value());
        info("Folding Recursive Verifier: num gates = ", folding_circuit.num_gates);

        // Perform native folding verification and ensure it returns the same result (either true or false) as
        // calling check_circuit on the recursive folding verifier
        auto native_folding_verifier = composer.create_folding_verifier({ verifier_instance_1, verifier_instance_2 });
        auto verifier_accumulator = native_folding_verifier.verify_folding_proof(folding_proof.folding_data);

        // Ensure that the underlying native and recursive folding verification algorithms agree by ensuring the
        // manifestsproduced by each agree.
        auto recursive_folding_manifest = verifier.transcript->get_manifest();
        auto native_folding_manifest = native_folding_verifier.transcript->get_manifest();

        for (size_t i = 0; i < recursive_folding_manifest.size(); ++i) {
            EXPECT_EQ(recursive_folding_manifest[i], native_folding_manifest[i]);
        }

        {
            auto composer = Composer();
            auto instance = composer.create_prover_instance(folding_circuit);
            auto verification_key = composer.compute_verification_key(instance);
            auto prover = composer.create_prover(instance);
            auto verifier = composer.create_verifier(verification_key);
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
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/844): Fold the recursive folding verifier in
    // tests once we can fold instances of different sizes.
    static void test_full_protogalaxy_recursive()
    {
        // Create two arbitrary circuits for the first round of folding
        Builder builder1;
        create_function_circuit(builder1);
        Builder builder2;
        create_function_circuit(builder2);

        Composer composer = Composer();
        auto prover_instance_1 = composer.create_prover_instance(builder1);
        auto verifier_instance_1 = composer.create_verifier_instance(prover_instance_1);
        auto prover_instance_2 = composer.create_prover_instance(builder2);
        auto verifier_instance_2 = composer.create_verifier_instance(prover_instance_2);
        // Generate a folding proof
        auto folding_prover = composer.create_folding_prover({ prover_instance_1, prover_instance_2 });
        auto folding_proof = folding_prover.fold_instances();

        // Create a recursive folding verifier circuit for the folding proof of the two instances
        Builder folding_circuit;
        auto verifier =
            FoldingRecursiveVerifier(&folding_circuit, verifier_instance_1, { verifier_instance_2->verification_key });
        auto recursive_verifier_accumulator = verifier.verify_folding_proof(folding_proof.folding_data);
        auto acc = std::make_shared<VerifierInstance>(recursive_verifier_accumulator->get_value());
        info("Folding Recursive Verifier: num gates = ", folding_circuit.num_gates);

        // Perform native folding verification and ensure it returns the same result (either true or false) as
        // calling check_circuit on the recursive folding verifier
        auto native_folding_verifier = composer.create_folding_verifier({ verifier_instance_1, verifier_instance_2 });
        auto verifier_accumulator = native_folding_verifier.verify_folding_proof(folding_proof.folding_data);

        // Ensure that the underlying native and recursive folding verification algorithms agree by ensuring the
        // manifestsproduced by each agree.
        auto recursive_folding_manifest = verifier.transcript->get_manifest();
        auto native_folding_manifest = native_folding_verifier.transcript->get_manifest();

        for (size_t i = 0; i < recursive_folding_manifest.size(); ++i) {
            EXPECT_EQ(recursive_folding_manifest[i], native_folding_manifest[i]);
        }

        auto decider_prover = composer.create_decider_prover(folding_proof.accumulator);
        auto decider_proof = decider_prover.construct_proof();

        Builder decider_circuit;
        DeciderRecursiveVerifier decider_verifier{ &decider_circuit, acc };
        auto pairing_points = decider_verifier.verify_proof(decider_proof);
        info("Decider Recursive Verifier: num gates = ", decider_circuit.num_gates);
        // Check for a failure flag in the recursive verifier circuit
        EXPECT_EQ(decider_circuit.failed(), false) << decider_circuit.err();

        // Check for a failure flag in the recursive verifier circuit
        EXPECT_EQ(folding_circuit.failed(), false) << folding_circuit.err();

        DeciderVerifier native_decider_verifier = composer.create_decider_verifier(verifier_accumulator);
        auto native_result = native_decider_verifier.verify_proof(decider_proof);
        auto recursive_result = native_decider_verifier.pcs_verification_key->pairing_check(
            pairing_points[0].get_value(), pairing_points[1].get_value());
        EXPECT_EQ(native_result, recursive_result);

        {
            auto composer = Composer();
            auto instance = composer.create_prover_instance(decider_circuit);
            auto verification_key = composer.compute_verification_key(instance);
            auto prover = composer.create_prover(instance);
            auto verifier = composer.create_verifier(verification_key);
            auto proof = prover.construct_proof();
            bool verified = verifier.verify_proof(proof);

            ASSERT(verified);
        }
    };

    static void test_tampered_decider_proof()
    {
        // Create two arbitrary circuits for the first round of folding
        auto composer = Composer();
        auto [prover_accumulator, verifier_accumulator] = fold_and_verify_native(composer);

        // Tamper with the accumulator by changing the target sum
        verifier_accumulator->target_sum = FF::random_element();

        // Create a decider proof for the relaxed instance obtained through folding
        auto decider_prover = composer.create_decider_prover(prover_accumulator);
        auto decider_proof = decider_prover.construct_proof();

        // Create a decider verifier circuit for recursively verifying the decider proof
        Builder decider_circuit;
        DeciderRecursiveVerifier decider_verifier{ &decider_circuit, verifier_accumulator };
        decider_verifier.verify_proof(decider_proof);
        info("Decider Recursive Verifier: num gates = ", decider_circuit.num_gates);

        {
            auto composer = Composer();
            auto instance = composer.create_prover_instance(decider_circuit);
            auto verification_key = composer.compute_verification_key(instance);
            auto prover = composer.create_prover(instance);
            auto verifier = composer.create_verifier(verification_key);
            auto proof = prover.construct_proof();
            bool verified = verifier.verify_proof(proof);

            EXPECT_FALSE(verified);
        }
    };

    static void test_tampered_accumulator()
    {

        auto composer = Composer();
        auto [prover_accumulator, verifier_accumulator] = fold_and_verify_native(composer);

        // Create another circuit to do a second round of folding
        Builder builder3;
        create_function_circuit(builder3);
        auto prover_inst = composer.create_prover_instance(builder3);
        auto verifier_inst = composer.create_verifier_instance(prover_inst);

        prover_accumulator->prover_polynomials.w_l[1] = FF::random_element();

        // Generate a folding proof
        auto folding_prover = composer.create_folding_prover({ prover_accumulator, prover_inst });
        auto folding_proof = folding_prover.fold_instances();

        // Create a recursive folding verifier circuit for the folding proof of the two instances
        Builder folding_circuit;
        FoldingRecursiveVerifier verifier{ &folding_circuit,
                                           verifier_accumulator,
                                           { verifier_inst->verification_key } };
        auto recursive_verifier_acc = verifier.verify_folding_proof(folding_proof.folding_data);
        EXPECT_FALSE(folding_proof.accumulator->target_sum == recursive_verifier_acc->target_sum.get_value());
    };
};

using FlavorTypes = testing::Types<GoblinUltraRecursiveFlavor_<GoblinUltraCircuitBuilder>>;
TYPED_TEST_SUITE(ProtoGalaxyRecursiveTests, FlavorTypes);

TYPED_TEST(ProtoGalaxyRecursiveTests, InnerCircuit)
{
    TestFixture::test_circuit();
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