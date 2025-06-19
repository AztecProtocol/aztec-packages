#include "barretenberg/boomerang_value_detection/graph.hpp"
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
#include "barretenberg/stdlib/protogalaxy_verifier/protogalaxy_recursive_verifier.hpp"
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
        InnerFoldingProver folding_prover({ decider_pk_1, decider_pk_2 }, { decider_vk_1, decider_vk_2 });
        InnerFoldingVerifier folding_verifier({ decider_vk_1, decider_vk_2 });

        auto [prover_accumulator, folding_proof] = folding_prover.prove();
        auto verifier_accumulator = folding_verifier.verify_folding_proof(folding_proof);
        return { prover_accumulator, verifier_accumulator };
    }

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
        InnerFoldingProver folding_prover({ decider_pk_1, decider_pk_2 }, { decider_vk_1, decider_vk_2 });
        auto folding_proof = folding_prover.prove();

        // Create a folding verifier circuit
        OuterBuilder folding_circuit;

        auto recursive_decider_vk_1 = std::make_shared<RecursiveDeciderVerificationKey>(&folding_circuit, decider_vk_1);
        auto recursive_decider_vk_2 =
            std::make_shared<RecursiveVerificationKey>(&folding_circuit, decider_vk_2->verification_key);
        StdlibProof<OuterBuilder> stdlib_proof =
            bb::convert_native_proof_to_stdlib(&folding_circuit, folding_proof.proof);

        auto verifier =
            FoldingRecursiveVerifier{ &folding_circuit, recursive_decider_vk_1, { recursive_decider_vk_2 } };
        std::shared_ptr<RecursiveDeciderVerificationKey> accumulator;
        for (size_t idx = 0; idx < num_verifiers; idx++) {
            accumulator = verifier.verify_folding_proof(stdlib_proof);
            if (idx < num_verifiers - 1) { // else the transcript is null in the test below
                verifier = FoldingRecursiveVerifier{ &folding_circuit,
                                                     accumulator,
                                                     { std::make_shared<RecursiveVerificationKey>(
                                                         &folding_circuit, decider_vk_1->verification_key) } };
            }
        }
        info("Folding Recursive Verifier: num gates unfinalized = ", folding_circuit.num_gates);
        EXPECT_EQ(folding_circuit.failed(), false) << folding_circuit.err();

        // Perform native folding verification and ensure it returns the same result (either true or false) as
        // calling check_circuit on the recursive folding verifier
        InnerFoldingVerifier native_folding_verifier({ decider_vk_1, decider_vk_2 });
        std::shared_ptr<InnerDeciderVerificationKey> native_accumulator;
        native_folding_verifier.verify_folding_proof(folding_proof.proof);
        for (size_t idx = 0; idx < num_verifiers; idx++) {
            native_accumulator = native_folding_verifier.verify_folding_proof(folding_proof.proof);
            if (idx < num_verifiers - 1) { // else the transcript is null in the test below
                native_folding_verifier = InnerFoldingVerifier{ { native_accumulator, decider_vk_1 } };
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
    }
};
} // namespace bb::stdlib::recursion::honk