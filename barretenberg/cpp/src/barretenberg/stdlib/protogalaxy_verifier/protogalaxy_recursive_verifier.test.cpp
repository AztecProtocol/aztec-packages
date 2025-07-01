#include "barretenberg/stdlib/protogalaxy_verifier/protogalaxy_recursive_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/flavor/ultra_recursive_flavor.hpp"
#include "barretenberg/protogalaxy/protogalaxy_prover.hpp"
#include "barretenberg/protogalaxy/protogalaxy_verifier.hpp"
#include "barretenberg/protogalaxy/prover_verifier_shared.hpp"
#include "barretenberg/stdlib/hash/blake3s/blake3s.hpp"
#include "barretenberg/stdlib/hash/pedersen/pedersen.hpp"
#include "barretenberg/stdlib/honk_verifier/decider_recursive_verifier.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/ultra_honk/decider_keys.hpp"
#include "barretenberg/ultra_honk/decider_prover.hpp"
#include "barretenberg/ultra_honk/decider_verifier.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

auto& engine = bb::numeric::get_debug_randomness();

namespace bb::stdlib::recursion::honk {
template <typename RecursiveFlavor> class ProtogalaxyRecursiveTests : public testing::Test {
  public:
    // Define types for the inner circuit, i.e. the circuit whose proof will be recursively verified
    using InnerFlavor = typename RecursiveFlavor::NativeFlavor;
    using InnerProver = UltraProver_<InnerFlavor>;
    using InnerVerifier = UltraVerifier_<InnerFlavor>;
    using InnerBuilder = typename InnerFlavor::CircuitBuilder;
    using InnerDeciderProvingKey = DeciderProvingKey_<InnerFlavor>;
    using InnerDeciderVerificationKey = ::bb::DeciderVerificationKey_<InnerFlavor>;
    using InnerVerificationKey = typename InnerFlavor::VerificationKey;
    using InnerCurve = bn254<InnerBuilder>;
    using Commitment = InnerFlavor::Commitment;
    using FF = InnerFlavor::FF;

    // Defines types for the outer circuit, i.e. the circuit of the recursive verifier
    using OuterBuilder = typename RecursiveFlavor::CircuitBuilder;
    using OuterFlavor = std::conditional_t<IsMegaBuilder<OuterBuilder>, MegaFlavor, UltraFlavor>;
    using OuterProver = UltraProver_<OuterFlavor>;
    using OuterVerifier = UltraVerifier_<OuterFlavor>;
    using OuterDeciderProvingKey = DeciderProvingKey_<OuterFlavor>;

    using RecursiveDeciderVerificationKeys =
        ::bb::stdlib::recursion::honk::RecursiveDeciderVerificationKeys_<RecursiveFlavor, 2>;
    using RecursiveDeciderVerificationKey = RecursiveDeciderVerificationKeys::DeciderVK;
    using RecursiveVerificationKey = RecursiveDeciderVerificationKeys::VerificationKey;
    using FoldingRecursiveVerifier = ProtogalaxyRecursiveVerifier_<RecursiveDeciderVerificationKeys>;
    using DeciderRecursiveVerifier = DeciderRecursiveVerifier_<RecursiveFlavor>;
    using InnerDeciderProver = DeciderProver_<InnerFlavor>;
    using InnerDeciderVerifier = DeciderVerifier_<InnerFlavor>;
    using InnerDeciderVerificationKeys = DeciderVerificationKeys_<InnerFlavor, 2>;
    using InnerFoldingVerifier = ProtogalaxyVerifier_<InnerDeciderVerificationKeys>;
    using InnerFoldingProver = ProtogalaxyProver_<InnerFlavor>;

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
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
    static void create_function_circuit(InnerBuilder& builder, size_t log_num_gates = 10)
    {
        using fr_ct = typename InnerCurve::ScalarField;
        using fq_ct = stdlib::bigfield<InnerBuilder, typename InnerCurve::BaseFieldNative::Params>;
        using public_witness_ct = typename InnerCurve::public_witness_ct;
        using witness_ct = typename InnerCurve::witness_ct;
        using byte_array_ct = typename InnerCurve::byte_array_ct;
        using fr = typename InnerCurve::ScalarFieldNative;

        // Create 2^log_n many add gates based on input log num gates
        const size_t num_gates = 1 << log_num_gates;
        for (size_t i = 0; i < num_gates; ++i) {
            fr a = fr::random_element(&engine);
            uint32_t a_idx = builder.add_variable(a);

            fr b = fr::random_element(&engine);
            fr c = fr::random_element(&engine);
            fr d = a + b + c;
            uint32_t b_idx = builder.add_variable(b);
            uint32_t c_idx = builder.add_variable(c);
            uint32_t d_idx = builder.add_variable(d);

            builder.create_big_add_gate({ a_idx, b_idx, c_idx, d_idx, fr(1), fr(1), fr(1), fr(-1), fr(0) });
        }

        // Define some additional non-trivial but arbitrary circuit logic
        fr_ct a(public_witness_ct(&builder, fr::random_element(&engine)));
        fr_ct b(public_witness_ct(&builder, fr::random_element(&engine)));
        fr_ct c(public_witness_ct(&builder, fr::random_element(&engine)));

        for (size_t i = 0; i < 32; ++i) {
            a = (a * b) + b + a;
            a = a.madd(b, c);
        }
        pedersen_hash<InnerBuilder>::hash({ a, b });
        byte_array_ct to_hash(&builder, "nonsense test data");
        blake3s(to_hash);

        fr bigfield_data = fr::random_element(&engine);
        fr bigfield_data_a{ bigfield_data.data[0], bigfield_data.data[1], 0, 0 };
        fr bigfield_data_b{ bigfield_data.data[2], bigfield_data.data[3], 0, 0 };

        fq_ct big_a(fr_ct(witness_ct(&builder, bigfield_data_a.to_montgomery_form())), fr_ct(witness_ct(&builder, 0)));
        fq_ct big_b(fr_ct(witness_ct(&builder, bigfield_data_b.to_montgomery_form())), fr_ct(witness_ct(&builder, 0)));

        big_a* big_b;

        stdlib::recursion::PairingPoints<InnerBuilder>::add_default_to_public_inputs(builder);
    };

    static std::tuple<std::shared_ptr<InnerDeciderProvingKey>, std::shared_ptr<InnerDeciderVerificationKey>>
    fold_and_verify_native()
    {
        InnerBuilder builder1;
        create_function_circuit(builder1);
        InnerBuilder builder2;
        builder2.add_public_variable(FF(1));
        create_function_circuit(builder2);

        auto decider_pk_1 = std::make_shared<InnerDeciderProvingKey>(builder1);
        auto honk_vk_1 = std::make_shared<InnerVerificationKey>(decider_pk_1->proving_key);
        auto decider_vk_1 = std::make_shared<InnerDeciderVerificationKey>(honk_vk_1);
        auto decider_pk_2 = std::make_shared<InnerDeciderProvingKey>(builder2);
        auto honk_vk_2 = std::make_shared<InnerVerificationKey>(decider_pk_2->proving_key);
        auto decider_vk_2 = std::make_shared<InnerDeciderVerificationKey>(honk_vk_2);
        InnerFoldingProver folding_prover({ decider_pk_1, decider_pk_2 },
                                          { decider_vk_1, decider_vk_2 },
                                          std::make_shared<typename InnerFoldingProver::Transcript>());
        InnerFoldingVerifier folding_verifier({ decider_vk_1, decider_vk_2 },
                                              std::make_shared<typename InnerFoldingVerifier::Transcript>());

        auto [prover_accumulator, folding_proof] = folding_prover.prove();
        auto verifier_accumulator = folding_verifier.verify_folding_proof(folding_proof);
        return { prover_accumulator, verifier_accumulator };
    }

    /**
     *@brief Create inner circuit and call check_circuit on it
     */
    static void test_circuit()
    {
        InnerBuilder builder;

        create_function_circuit(builder);

        bool result = CircuitChecker::check(builder);
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
        using fr_ct = typename bn254<OuterBuilder>::ScalarField;
        using fr = typename bn254<OuterBuilder>::ScalarFieldNative;

        std::vector<fr> coeffs;
        std::vector<fr_ct> coeffs_ct;
        for (size_t idx = 0; idx < 8; idx++) {
            auto el = fr::random_element(&engine);
            coeffs.emplace_back(el);
            coeffs_ct.emplace_back(fr_ct(&builder, el));
        }
        Polynomial<fr> poly(coeffs);
        fr point = fr::random_element(&engine);
        fr_ct point_ct(fr_ct(&builder, point));
        auto res1 = poly.evaluate(point);

        auto res2 = evaluate_perturbator(coeffs_ct, point_ct);
        EXPECT_EQ(res1, res2.get_value());
    };

    /**
     * @brief Tests that a valid recursive fold  works as expected.
     *
     */
    static void test_recursive_folding(const size_t num_verifiers = 1)
    {
        // Create two arbitrary circuits for the first round of folding
        InnerBuilder builder1;
        create_function_circuit(builder1);
        InnerBuilder builder2;
        builder2.add_public_variable(FF(1));
        create_function_circuit(builder2);

        auto decider_pk_1 = std::make_shared<InnerDeciderProvingKey>(builder1);
        auto honk_vk_1 = std::make_shared<InnerVerificationKey>(decider_pk_1->proving_key);
        auto decider_vk_1 = std::make_shared<InnerDeciderVerificationKey>(honk_vk_1);
        auto decider_pk_2 = std::make_shared<InnerDeciderProvingKey>(builder2);
        auto honk_vk_2 = std::make_shared<InnerVerificationKey>(decider_pk_2->proving_key);
        auto decider_vk_2 = std::make_shared<InnerDeciderVerificationKey>(honk_vk_2);
        // Generate a folding proof
        InnerFoldingProver folding_prover({ decider_pk_1, decider_pk_2 },
                                          { decider_vk_1, decider_vk_2 },
                                          std::make_shared<typename InnerFoldingProver::Transcript>());
        auto folding_proof = folding_prover.prove();

        // Create a folding verifier circuit
        OuterBuilder folding_circuit;

        auto recursive_decider_vk_1 = std::make_shared<RecursiveDeciderVerificationKey>(&folding_circuit, decider_vk_1);
        auto recursive_decider_vk_2 =
            std::make_shared<RecursiveVerificationKey>(&folding_circuit, decider_vk_2->verification_key);
        stdlib::Proof<OuterBuilder> stdlib_proof(folding_circuit, folding_proof.proof);

        auto verifier = FoldingRecursiveVerifier{ &folding_circuit,
                                                  recursive_decider_vk_1,
                                                  { recursive_decider_vk_2 },
                                                  std::make_shared<typename FoldingRecursiveVerifier::Transcript>() };
        verifier.transcript->enable_manifest();
        std::shared_ptr<RecursiveDeciderVerificationKey> accumulator;
        for (size_t idx = 0; idx < num_verifiers; idx++) {
            accumulator = verifier.verify_folding_proof(stdlib_proof);
            if (idx < num_verifiers - 1) { // else the transcript is null in the test below
                verifier = FoldingRecursiveVerifier{
                    &folding_circuit,
                    accumulator,
                    { std::make_shared<RecursiveVerificationKey>(&folding_circuit, decider_vk_1->verification_key) },
                    std::make_shared<typename FoldingRecursiveVerifier::Transcript>()
                };
                verifier.transcript->enable_manifest();
            }
        }
        info("Folding Recursive Verifier: num gates unfinalized = ", folding_circuit.num_gates);
        EXPECT_EQ(folding_circuit.failed(), false) << folding_circuit.err();

        // Perform native folding verification and ensure it returns the same result (either true or false) as
        // calling check_circuit on the recursive folding verifier
        InnerFoldingVerifier native_folding_verifier({ decider_vk_1, decider_vk_2 },
                                                     std::make_shared<typename InnerFoldingVerifier::Transcript>());
        native_folding_verifier.transcript->enable_manifest();
        std::shared_ptr<InnerDeciderVerificationKey> native_accumulator;
        native_folding_verifier.verify_folding_proof(folding_proof.proof);
        for (size_t idx = 0; idx < num_verifiers; idx++) {
            native_accumulator = native_folding_verifier.verify_folding_proof(folding_proof.proof);
            if (idx < num_verifiers - 1) { // else the transcript is null in the test below
                native_folding_verifier =
                    InnerFoldingVerifier{ { native_accumulator, decider_vk_1 },
                                          std::make_shared<typename InnerFoldingVerifier::Transcript>() };
                native_folding_verifier.transcript->enable_manifest();
            }
        }

        // Ensure that the underlying native and recursive folding verification algorithms agree by ensuring the
        // manifests produced by each agree.
        auto recursive_folding_manifest = verifier.transcript->get_manifest();
        auto native_folding_manifest = native_folding_verifier.transcript->get_manifest();

        ASSERT(recursive_folding_manifest.size() > 0);
        for (size_t i = 0; i < recursive_folding_manifest.size(); ++i) {
            EXPECT_EQ(recursive_folding_manifest[i], native_folding_manifest[i])
                << "Recursive Verifier/Verifier manifest discrepency in round " << i;
        }

        // Check for a failure flag in the recursive verifier circuit
        {
            stdlib::recursion::PairingPoints<OuterBuilder>::add_default_to_public_inputs(folding_circuit);
            // inefficiently check finalized size
            folding_circuit.finalize_circuit(/* ensure_nonzero= */ true);
            info("Folding Recursive Verifier: num gates finalized = ", folding_circuit.num_gates);
            auto decider_pk = std::make_shared<OuterDeciderProvingKey>(folding_circuit);
            info("Dyadic size of verifier circuit: ", decider_pk->proving_key.circuit_size);
            auto honk_vk = std::make_shared<typename OuterFlavor::VerificationKey>(decider_pk->proving_key);
            OuterProver prover(decider_pk, honk_vk);
            OuterVerifier verifier(honk_vk);
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
    static void test_full_protogalaxy_recursive()
    {
        using NativeVerifierCommitmentKey = typename InnerFlavor::VerifierCommitmentKey;
        // Create two arbitrary circuits for the first round of folding
        InnerBuilder builder1;
        create_function_circuit(builder1);
        InnerBuilder builder2;
        builder2.add_public_variable(FF(1));

        create_function_circuit(builder2);

        auto decider_pk_1 = std::make_shared<InnerDeciderProvingKey>(builder1);
        auto honk_vk_1 = std::make_shared<InnerVerificationKey>(decider_pk_1->proving_key);
        auto decider_vk_1 = std::make_shared<InnerDeciderVerificationKey>(honk_vk_1);
        auto decider_pk_2 = std::make_shared<InnerDeciderProvingKey>(builder2);
        auto honk_vk_2 = std::make_shared<InnerVerificationKey>(decider_pk_2->proving_key);
        auto decider_vk_2 = std::make_shared<InnerDeciderVerificationKey>(honk_vk_2);
        // Generate a folding proof
        InnerFoldingProver folding_prover({ decider_pk_1, decider_pk_2 },
                                          { decider_vk_1, decider_vk_2 },
                                          std::make_shared<typename InnerFoldingProver::Transcript>());
        auto folding_proof = folding_prover.prove();

        // Create a folding verifier circuit
        OuterBuilder folding_circuit;
        auto recursive_decider_vk_1 = std::make_shared<RecursiveDeciderVerificationKey>(&folding_circuit, decider_vk_1);
        auto recursive_decider_vk_2 =
            std::make_shared<RecursiveVerificationKey>(&folding_circuit, decider_vk_2->verification_key);
        stdlib::Proof<OuterBuilder> stdlib_proof(folding_circuit, folding_proof.proof);

        auto verifier = FoldingRecursiveVerifier{ &folding_circuit,
                                                  recursive_decider_vk_1,
                                                  { recursive_decider_vk_2 },
                                                  std::make_shared<typename FoldingRecursiveVerifier::Transcript>() };
        verifier.transcript->enable_manifest();
        auto recursive_verifier_accumulator = verifier.verify_folding_proof(stdlib_proof);
        auto native_verifier_acc =
            std::make_shared<InnerDeciderVerificationKey>(recursive_verifier_accumulator->get_value());
        info("Folding Recursive Verifier: num gates = ", folding_circuit.get_estimated_num_finalized_gates());

        // Check for a failure flag in the recursive verifier circuit
        EXPECT_EQ(folding_circuit.failed(), false) << folding_circuit.err();

        // Perform native folding verification and ensure it returns the same result (either true or false) as
        // calling check_circuit on the recursive folding verifier
        InnerFoldingVerifier native_folding_verifier({ decider_vk_1, decider_vk_2 },
                                                     std::make_shared<typename InnerFoldingVerifier::Transcript>());
        native_folding_verifier.transcript->enable_manifest();
        auto verifier_accumulator = native_folding_verifier.verify_folding_proof(folding_proof.proof);

        // Ensure that the underlying native and recursive folding verification algorithms agree by ensuring the
        // manifests produced by each agree.
        auto recursive_folding_manifest = verifier.transcript->get_manifest();
        auto native_folding_manifest = native_folding_verifier.transcript->get_manifest();

        ASSERT(recursive_folding_manifest.size() > 0);
        for (size_t i = 0; i < recursive_folding_manifest.size(); ++i) {
            EXPECT_EQ(recursive_folding_manifest[i], native_folding_manifest[i])
                << "Recursive Verifier/Verifier manifest discrepency in round " << i;
        }

        InnerDeciderProver decider_prover(folding_proof.accumulator);
        decider_prover.construct_proof();
        auto decider_proof = decider_prover.export_proof();

        OuterBuilder decider_circuit;
        DeciderRecursiveVerifier decider_verifier{ &decider_circuit, native_verifier_acc };
        auto pairing_points = decider_verifier.verify_proof(decider_proof);
        pairing_points.set_public();
        info("Decider Recursive Verifier: num gates = ", decider_circuit.num_gates);
        // Check for a failure flag in the recursive verifier circuit
        EXPECT_EQ(decider_circuit.failed(), false) << decider_circuit.err();

        // Perform native verification then perform the pairing on the outputs of the recursive decider verifier and
        // check that the result agrees.
        InnerDeciderVerifier native_decider_verifier(verifier_accumulator);
        auto native_decider_output = native_decider_verifier.verify_proof(decider_proof);
        auto native_result = native_decider_output.check();
        NativeVerifierCommitmentKey pcs_vkey{};
        auto recursive_result = pcs_vkey.pairing_check(pairing_points.P0.get_value(), pairing_points.P1.get_value());
        EXPECT_EQ(native_result, recursive_result);

        {
            auto decider_pk = std::make_shared<OuterDeciderProvingKey>(decider_circuit);
            auto honk_vk = std::make_shared<typename OuterFlavor::VerificationKey>(decider_pk->proving_key);
            OuterProver prover(decider_pk, honk_vk);
            OuterVerifier verifier(honk_vk);
            auto proof = prover.construct_proof();
            bool verified = verifier.verify_proof(proof);

            ASSERT(verified);
        }
    };

    static void test_tampered_decider_proof()
    {
        // Natively fold two circuits
        auto [prover_accumulator, verifier_accumulator] = fold_and_verify_native();

        // Tamper with the accumulator by changing the target sum
        verifier_accumulator->target_sum = FF::random_element(&engine);

        // Create a decider proof for accumulator obtained through folding
        InnerDeciderProver decider_prover(prover_accumulator);
        decider_prover.construct_proof();
        auto decider_proof = decider_prover.export_proof();

        // Create a decider verifier circuit for recursively verifying the decider proof
        OuterBuilder decider_circuit;
        DeciderRecursiveVerifier decider_verifier{ &decider_circuit, verifier_accumulator };
        [[maybe_unused]] auto output = decider_verifier.verify_proof(decider_proof);
        info("Decider Recursive Verifier: num gates = ", decider_circuit.num_gates);

        // We expect the decider circuit check to fail due to the bad proof
        EXPECT_FALSE(CircuitChecker::check(decider_circuit));
    };

    static void test_tampered_accumulator()
    {
        // Fold two circuits natively
        auto [prover_accumulator, verifier_accumulator] = fold_and_verify_native();

        // Create another circuit to do a second round of folding
        InnerBuilder builder;
        create_function_circuit(builder);
        auto prover_inst = std::make_shared<InnerDeciderProvingKey>(builder);
        auto verification_key = std::make_shared<InnerVerificationKey>(prover_inst->proving_key);
        auto verifier_inst = std::make_shared<InnerDeciderVerificationKey>(verification_key);

        // Corrupt a wire value in the accumulator
        prover_accumulator->proving_key.polynomials.w_l.at(1) = FF::random_element(&engine);

        // Generate a folding proof with the incorrect polynomials which would result in the prover having the wrong
        // target sum
        InnerFoldingProver folding_prover({ prover_accumulator, prover_inst },
                                          { verifier_accumulator, verifier_inst },
                                          std::make_shared<typename InnerFoldingProver::Transcript>());
        auto folding_proof = folding_prover.prove();

        // Create a folding verifier circuit
        // commitments
        OuterBuilder folding_circuit;
        auto recursive_decider_vk_1 =
            std::make_shared<RecursiveDeciderVerificationKey>(&folding_circuit, verifier_accumulator);
        auto recursive_decider_vk_2 =
            std::make_shared<RecursiveVerificationKey>(&folding_circuit, verifier_inst->verification_key);
        stdlib::Proof<OuterBuilder> stdlib_proof(folding_circuit, folding_proof.proof);

        auto verifier = FoldingRecursiveVerifier{ &folding_circuit,
                                                  recursive_decider_vk_1,
                                                  { recursive_decider_vk_2 },
                                                  std::make_shared<typename FoldingRecursiveVerifier::Transcript>() };
        auto recursive_verifier_acc = verifier.verify_folding_proof(stdlib_proof);

        // Validate that the target sum between prover and verifier is now different
        EXPECT_FALSE(folding_proof.accumulator->target_sum == recursive_verifier_acc->target_sum.get_value());
    };

    // Ensure that the PG recursive verifier circuit is independent of the size of the circuits being folded
    static void test_constant_pg_verifier_circuit()
    {
        struct ProofAndVerifier {
            HonkProof fold_proof;
            OuterBuilder verifier_circuit;
        };

        // Fold two circuits of a given size then construct a recursive PG verifier circuit
        auto produce_proof_and_verifier_circuit = [](size_t log_num_gates) -> ProofAndVerifier {
            InnerBuilder builder1;
            create_function_circuit(builder1, log_num_gates);
            InnerBuilder builder2;
            create_function_circuit(builder2, log_num_gates);

            // Generate a folding proof
            auto decider_pk_1 = std::make_shared<InnerDeciderProvingKey>(builder1);
            auto decider_pk_2 = std::make_shared<InnerDeciderProvingKey>(builder2);
            auto honk_vk_1 = std::make_shared<InnerVerificationKey>(decider_pk_1->proving_key);
            auto decider_vk_1 = std::make_shared<InnerDeciderVerificationKey>(honk_vk_1);
            auto honk_vk_2 = std::make_shared<InnerVerificationKey>(decider_pk_2->proving_key);
            auto decider_vk_2 = std::make_shared<InnerDeciderVerificationKey>(honk_vk_2);
            InnerFoldingProver folding_prover({ decider_pk_1, decider_pk_2 },
                                              { decider_vk_1, decider_vk_2 },
                                              std::make_shared<typename InnerFoldingProver::Transcript>());
            auto fold_result = folding_prover.prove();

            // Create a folding verifier circuit
            OuterBuilder verifier_circuit;
            auto recursive_decider_vk_1 =
                std::make_shared<RecursiveDeciderVerificationKey>(&verifier_circuit, honk_vk_1);
            auto recursive_decider_vk_2 = std::make_shared<RecursiveVerificationKey>(&verifier_circuit, honk_vk_2);
            stdlib::Proof<OuterBuilder> stdlib_proof(verifier_circuit, fold_result.proof);

            auto verifier =
                FoldingRecursiveVerifier{ &verifier_circuit,
                                          recursive_decider_vk_1,
                                          { recursive_decider_vk_2 },
                                          std::make_shared<typename FoldingRecursiveVerifier::Transcript>() };
            auto recursive_verifier_accumulator = verifier.verify_folding_proof(stdlib_proof);

            return { fold_result.proof, verifier_circuit };
        };

        // Create fold proofs and verifier circuits from folding circuits of different sizes
        auto [proof_1, verifier_circuit_1] = produce_proof_and_verifier_circuit(10);
        auto [proof_2, verifier_circuit_2] = produce_proof_and_verifier_circuit(11);

        EXPECT_TRUE(CircuitChecker::check(verifier_circuit_1));
        EXPECT_TRUE(CircuitChecker::check(verifier_circuit_2));

        // Check that the proofs are the same size and that the verifier circuits have the same number of gates
        EXPECT_EQ(proof_1.size(), proof_2.size());
        EXPECT_EQ(verifier_circuit_1.get_estimated_num_finalized_gates(),
                  verifier_circuit_2.get_estimated_num_finalized_gates());

        // The circuit blocks (selectors + wires) fully determine the circuit - check that they are identical
        EXPECT_EQ(verifier_circuit_1.blocks, verifier_circuit_2.blocks);
    }
};

using FlavorTypes = testing::Types<MegaRecursiveFlavor_<MegaCircuitBuilder>>;
TYPED_TEST_SUITE(ProtogalaxyRecursiveTests, FlavorTypes);

TYPED_TEST(ProtogalaxyRecursiveTests, InnerCircuit)
{
    TestFixture::test_circuit();
}

TYPED_TEST(ProtogalaxyRecursiveTests, NewEvaluate)
{
    TestFixture::test_new_evaluate();
}

TYPED_TEST(ProtogalaxyRecursiveTests, RecursiveFoldingTest)
{
    TestFixture::test_recursive_folding();
}

TYPED_TEST(ProtogalaxyRecursiveTests, RecursiveFoldingTwiceTest)
{
    TestFixture::test_recursive_folding(/* num_verifiers= */ 2);
}

TYPED_TEST(ProtogalaxyRecursiveTests, FullProtogalaxyRecursiveTest)
{

    TestFixture::test_full_protogalaxy_recursive();
}

TYPED_TEST(ProtogalaxyRecursiveTests, TamperedDeciderProof)
{
    TestFixture::test_tampered_decider_proof();
}

TYPED_TEST(ProtogalaxyRecursiveTests, TamperedAccumulator)
{
    TestFixture::test_tampered_accumulator();
}

TYPED_TEST(ProtogalaxyRecursiveTests, ConstantVerifierCircuit)
{
    TestFixture::test_constant_pg_verifier_circuit();
}

} // namespace bb::stdlib::recursion::honk
