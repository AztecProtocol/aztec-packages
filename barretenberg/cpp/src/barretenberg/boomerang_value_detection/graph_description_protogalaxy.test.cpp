#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/protogalaxy/protogalaxy_prover.hpp"
#include "barretenberg/protogalaxy/protogalaxy_verifier.hpp"
#include "barretenberg/protogalaxy/prover_verifier_shared.hpp"
#include "barretenberg/stdlib/hash/blake3s/blake3s.hpp"
#include "barretenberg/stdlib/hash/pedersen/pedersen.hpp"
#include "barretenberg/stdlib/honk_verifier/decider_recursive_verifier.hpp"
#include "barretenberg/stdlib/protogalaxy_verifier/protogalaxy_recursive_verifier.hpp"
#include "barretenberg/ultra_honk/decider_keys.hpp"
#include "barretenberg/ultra_honk/decider_prover.hpp"
#include "barretenberg/ultra_honk/decider_verifier.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

auto& engine = bb::numeric::get_debug_randomness();

namespace bb::stdlib::recursion::honk {
class BoomerangProtogalaxyRecursiveTests : public testing::Test {
  public:
    // Define types for the inner circuit, i.e. the circuit whose proof will be recursively verified
    using RecursiveFlavor = MegaRecursiveFlavor_<MegaCircuitBuilder>;
    using InnerFlavor = RecursiveFlavor::NativeFlavor;
    using InnerProver = UltraProver_<InnerFlavor>;
    using InnerVerifier = UltraVerifier_<InnerFlavor>;
    using InnerBuilder = InnerFlavor::CircuitBuilder;
    using InnerDeciderProvingKey = DeciderProvingKey_<InnerFlavor>;
    using InnerDeciderVerificationKey = ::bb::DeciderVerificationKey_<InnerFlavor>;
    using InnerVerificationKey = InnerFlavor::VerificationKey;
    using InnerCurve = bn254<InnerBuilder>;
    using Commitment = InnerFlavor::Commitment;
    using FF = InnerFlavor::FF;

    // Defines types for the outer circuit, i.e. the circuit of the recursive verifier
    using OuterBuilder = RecursiveFlavor::CircuitBuilder;
    using OuterFlavor = std::conditional_t<IsMegaBuilder<OuterBuilder>, MegaFlavor, UltraFlavor>;
    using OuterProver = UltraProver_<OuterFlavor>;
    using OuterVerifier = UltraVerifier_<OuterFlavor>;
    using OuterDeciderProvingKey = DeciderProvingKey_<OuterFlavor>;

    using RecursiveDeciderVerificationKeys =
        ::bb::stdlib::recursion::honk::RecursiveDeciderVerificationKeys_<RecursiveFlavor, 2>;
    using RecursiveDeciderVerificationKey = RecursiveDeciderVerificationKeys::DeciderVK;
    using RecursiveVerificationKey = RecursiveDeciderVerificationKeys::VerificationKey;
    using RecursiveVKAndHash = RecursiveDeciderVerificationKeys::VKAndHash;
    using FoldingRecursiveVerifier = ProtogalaxyRecursiveVerifier_<RecursiveDeciderVerificationKeys>;
    using DeciderRecursiveVerifier = DeciderRecursiveVerifier_<RecursiveFlavor>;
    using InnerDeciderProver = DeciderProver_<InnerFlavor>;
    using InnerDeciderVerifier = DeciderVerifier_<InnerFlavor>;
    using InnerDeciderVerificationKeys = DeciderVerificationKeys_<InnerFlavor, 2>;
    using InnerFoldingVerifier = ProtogalaxyVerifier_<InnerDeciderVerificationKeys>;
    using InnerFoldingProver = ProtogalaxyProver_<InnerFlavor>;
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

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

    static void test_recursive_folding(const size_t num_verifiers = 1)
    {
        // Create two arbitrary circuits for the first round of folding
        InnerBuilder builder1;
        create_function_circuit(builder1);
        InnerBuilder builder2;
        builder2.add_public_variable(FF(1));
        create_function_circuit(builder2);

        auto decider_pk_1 = std::make_shared<InnerDeciderProvingKey>(builder1);
        auto honk_vk_1 = std::make_shared<InnerVerificationKey>(decider_pk_1->get_precomputed());
        auto decider_vk_1 = std::make_shared<InnerDeciderVerificationKey>(honk_vk_1);
        auto decider_pk_2 = std::make_shared<InnerDeciderProvingKey>(builder2);
        auto honk_vk_2 = std::make_shared<InnerVerificationKey>(decider_pk_2->get_precomputed());
        auto decider_vk_2 = std::make_shared<InnerDeciderVerificationKey>(honk_vk_2);
        // Generate a folding proof
        InnerFoldingProver folding_prover({ decider_pk_1, decider_pk_2 },
                                          { decider_vk_1, decider_vk_2 },
                                          std::make_shared<typename InnerFoldingProver::Transcript>());
        auto folding_proof = folding_prover.prove();

        // Create a folding verifier circuit
        OuterBuilder folding_circuit;

        auto recursive_decider_vk_1 = std::make_shared<RecursiveDeciderVerificationKey>(&folding_circuit, decider_vk_1);
        auto recursive_vk_and_hash_2 = std::make_shared<RecursiveVKAndHash>(folding_circuit, decider_vk_2->vk);
        stdlib::Proof<OuterBuilder> stdlib_proof(folding_circuit, folding_proof.proof);

        auto verifier = FoldingRecursiveVerifier{ &folding_circuit,
                                                  recursive_decider_vk_1,
                                                  { recursive_vk_and_hash_2 },
                                                  std::make_shared<typename FoldingRecursiveVerifier::Transcript>() };
        std::shared_ptr<RecursiveDeciderVerificationKey> accumulator;
        for (size_t idx = 0; idx < num_verifiers; idx++) {
            verifier.transcript->enable_manifest();
            accumulator = verifier.verify_folding_proof(stdlib_proof);
            if (idx < num_verifiers - 1) { // else the transcript is null in the test below
                auto recursive_vk_and_hash = std::make_shared<RecursiveVKAndHash>(folding_circuit, decider_vk_1->vk);
                verifier =
                    FoldingRecursiveVerifier{ &folding_circuit,
                                              accumulator,
                                              { recursive_vk_and_hash },
                                              std::make_shared<typename FoldingRecursiveVerifier::Transcript>() };
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
            info("Dyadic size of verifier circuit: ", decider_pk->dyadic_size());
            auto honk_vk = std::make_shared<typename OuterFlavor::VerificationKey>(decider_pk->get_precomputed());
            OuterProver prover(decider_pk, honk_vk);
            OuterVerifier verifier(honk_vk);
            auto proof = prover.construct_proof();
            bool verified = verifier.verify_proof(proof);

            ASSERT(verified);
        }

        auto graph = cdg::MegaStaticAnalyzer(folding_circuit, false);
        auto variables_in_one_gate = graph.get_variables_in_one_gate();
        EXPECT_EQ(variables_in_one_gate.size(), 0);
        if (variables_in_one_gate.size() > 0) {
            auto fst_var_idx = std::vector<uint32_t>(variables_in_one_gate.cbegin(), variables_in_one_gate.cend())[0];
            graph.print_variable_in_one_gate(fst_var_idx);
        }
    }

    /**
     * @brief Perform two rounds of folding valid circuits and then recursive verify the final decider proof,
     * make sure the verifer circuits pass check_circuit(). Ensure that the algorithm of the recursive and native
     * verifiers are identical by checking the manifests
     */
    static void test_full_protogalaxy_recursive()
    {
        // using NativeVerifierCommitmentKey = typename InnerFlavor::VerifierCommitmentKey;
        //  Create two arbitrary circuits for the first round of folding
        InnerBuilder builder1;
        create_function_circuit(builder1);
        InnerBuilder builder2;
        builder2.add_public_variable(FF(1));
        create_function_circuit(builder2);

        auto decider_pk_1 = std::make_shared<InnerDeciderProvingKey>(builder1);
        auto honk_vk_1 = std::make_shared<InnerVerificationKey>(decider_pk_1->get_precomputed());
        auto decider_vk_1 = std::make_shared<InnerDeciderVerificationKey>(honk_vk_1);
        auto decider_pk_2 = std::make_shared<InnerDeciderProvingKey>(builder2);
        auto honk_vk_2 = std::make_shared<InnerVerificationKey>(decider_pk_2->get_precomputed());
        auto decider_vk_2 = std::make_shared<InnerDeciderVerificationKey>(honk_vk_2);
        // Generate a folding proof
        InnerFoldingProver folding_prover({ decider_pk_1, decider_pk_2 },
                                          { decider_vk_1, decider_vk_2 },
                                          std::make_shared<typename InnerFoldingProver::Transcript>());
        auto folding_proof = folding_prover.prove();

        // Create a folding verifier circuit
        OuterBuilder folding_circuit;
        auto recursive_decider_vk_1 = std::make_shared<RecursiveDeciderVerificationKey>(&folding_circuit, decider_vk_1);
        auto recursive_vk_and_hash_2 = std::make_shared<RecursiveVKAndHash>(folding_circuit, decider_vk_2->vk);
        stdlib::Proof<OuterBuilder> stdlib_proof(folding_circuit, folding_proof.proof);

        auto verifier = FoldingRecursiveVerifier{ &folding_circuit,
                                                  recursive_decider_vk_1,
                                                  { recursive_vk_and_hash_2 },
                                                  std::make_shared<typename FoldingRecursiveVerifier::Transcript>() };
        verifier.transcript->enable_manifest();
        auto recursive_verifier_accumulator = verifier.verify_folding_proof(stdlib_proof);
        auto native_verifier_acc =
            std::make_shared<InnerDeciderVerificationKey>(recursive_verifier_accumulator->get_value());
        info("Folding Recursive Verifier: num gates = ", folding_circuit.get_estimated_num_finalized_gates());

        // Check for a failure flag in the recursive verifier circuit
        EXPECT_EQ(folding_circuit.failed(), false) << folding_circuit.err();

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
        /*         pairing_points.P0.x.fix_witness();
                pairing_points.P0.y.fix_witness();
                pairing_points.P1.x.fix_witness();
                pairing_points.P1.y.fix_witness(); */
        auto graph = cdg::MegaStaticAnalyzer(decider_circuit, false);
        auto variables_in_one_gate = graph.get_variables_in_one_gate();
        EXPECT_EQ(variables_in_one_gate.size(), 0);
        if (variables_in_one_gate.size() > 0) {
            auto fst_var_idx = std::vector<uint32_t>(variables_in_one_gate.cbegin(), variables_in_one_gate.cend())[4];
            graph.print_variable_in_one_gate(fst_var_idx);
        }
    };
};

TEST_F(BoomerangProtogalaxyRecursiveTests, RecursiveFoldingTestOneVerifier)
{
    BoomerangProtogalaxyRecursiveTests::test_recursive_folding(/* num_verifiers= */ 1);
}

TEST_F(BoomerangProtogalaxyRecursiveTests, RecursiveFoldingTestTwoVerifiers)
{
    BoomerangProtogalaxyRecursiveTests::test_recursive_folding(/* num_verifiers= */ 2);
}

TEST_F(BoomerangProtogalaxyRecursiveTests, FullProtogalaxyRecursiveTest)
{
    BoomerangProtogalaxyRecursiveTests::test_full_protogalaxy_recursive();
}
} // namespace bb::stdlib::recursion::honk