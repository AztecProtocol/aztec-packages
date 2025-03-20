#include "./graph.hpp"
#include "barretenberg/stdlib/goblin_verifier/goblin_recursive_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_verification_keys_comparator.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

using namespace bb::stdlib::recursion::honk;
using namespace bb;
using namespace cdg;
using Builder = GoblinRecursiveVerifier::Builder;
using ECCVMVK = GoblinVerifier::ECCVMVerificationKey;
using TranslatorVK = GoblinVerifier::TranslatorVerificationKey;

using OuterFlavor = UltraFlavor;
using OuterProver = UltraProver_<OuterFlavor>;
using OuterVerifier = UltraVerifier_<OuterFlavor>;
using OuterDeciderProvingKey = DeciderProvingKey_<OuterFlavor>;

struct ProverOutput {
    GoblinProof proof;
    GoblinVerifier::VerifierInput verfier_input;
};

static MegaCircuitBuilder construct_mock_circuit(std::shared_ptr<ECCOpQueue> op_queue)
{
    MegaCircuitBuilder circuit{ op_queue };
    MockCircuits::construct_arithmetic_circuit(circuit, /*target_log2_dyadic_size=*/8);
    MockCircuits::construct_goblin_ecc_op_circuit(circuit);
    return circuit;
}

static ProverOutput create_goblin_prover_output(const size_t NUM_CIRCUITS = 3)
{
    GoblinProver goblin;

    // Construct and accumulate multiple circuits
    for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
        auto circuit = construct_mock_circuit(goblin.op_queue);
        goblin.prove_merge(circuit); // appends a recurisve merge verifier if a merge proof exists
    }

    // Output is a goblin proof plus ECCVM/Translator verification keys
    return { goblin.prove(),
                { std::make_shared<ECCVMVK>(goblin.get_eccvm_proving_key()),
                std::make_shared<TranslatorVK>(goblin.get_translator_proving_key()) } };
}


HEAVY_TEST(boomerang_goblin, test_1) {
    bb::srs::init_crs_factory(bb::srs::get_ignition_crs_path());
    bb::srs::init_grumpkin_crs_factory(bb::srs::get_grumpkin_crs_path());
    auto [proof, verifier_input] = create_goblin_prover_output();

    Builder builder;
    GoblinRecursiveVerifier verifier{ &builder, verifier_input };
    verifier.verify(proof);

    {
        auto proving_key = std::make_shared<OuterDeciderProvingKey>(builder);
        OuterProver prover(proving_key);
        auto verification_key = std::make_shared<typename OuterFlavor::VerificationKey>(proving_key->proving_key);
        OuterVerifier verifier(verification_key);
        auto proof = prover.construct_proof();
        [[maybe_unused]]bool verified = verifier.verify_proof(proof);
    }
    info("graph creation started...");
    auto graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    graph.print_connected_components();
}