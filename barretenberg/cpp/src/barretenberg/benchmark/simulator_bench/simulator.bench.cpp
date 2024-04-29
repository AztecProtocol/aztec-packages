#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <benchmark/benchmark.h>

using namespace benchmark;
using namespace bb;

namespace {
template <typename RecursiveFlavor> class SimulatorFixture : public benchmark::Fixture {

  public:
    using Flavor = typename RecursiveFlavor::NativeFlavor;
    using ProverInstance = ProverInstance_<Flavor>;
    using Builder = typename Flavor::CircuitBuilder;
    using VerificationKey = typename Flavor::VerificationKey;
    using CircuitSimulator = typename RecursiveFlavor::CircuitBuilder;
    using SimulatingVerifier = stdlib::recursion::honk::UltraRecursiveVerifier_<RecursiveFlavor>;
    SimulatorFixture() = default;

    struct VerifierInput {
        HonkProof proof;
        std::shared_ptr<typename Flavor::VerificationKey> verification_key;
    };

    void SetUp([[maybe_unused]] const ::benchmark::State& state) override
    {
        bb::srs::init_crs_factory("../srs_db/ignition");
        bb::srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
    }

    static VerifierInput create_proof_goblin_builder(bool large = false)
    {

        auto builder = construct_mock_function_circuit(large);
        auto instance = std::make_shared<ProverInstance>(builder);
        UltraProver_<Flavor> prover(instance);
        auto ultra_proof = prover.construct_proof();
        auto verification_key = std::make_shared<VerificationKey>(instance->proving_key);
        return { ultra_proof, verification_key };
    }

    static Builder construct_mock_function_circuit(bool large = false)
    {
        using InnerCurve = bb::stdlib::bn254<Builder>;

        using fr_ct = InnerCurve::ScalarField;
        using point_ct = InnerCurve::AffineElement;
        using fr = typename InnerCurve::ScalarFieldNative;
        using point = typename InnerCurve::GroupNative::affine_element;
        Builder builder;

        // Add some arbitrary goblin-style ECC op gates via a batch mul
        size_t num_points = 5;
        std::vector<point_ct> circuit_points;
        std::vector<fr_ct> circuit_scalars;
        for (size_t i = 0; i < num_points; ++i) {
            circuit_points.push_back(point_ct::from_witness(&builder, point::random_element()));
            circuit_scalars.push_back(fr_ct::from_witness(&builder, fr::random_element()));
        }
        point_ct::batch_mul(circuit_points, circuit_scalars);

        // Determine number of times to execute the below operations that constitute the mock circuit logic. Note
        // that the circuit size does not scale linearly with number of iterations due to e.g. amortization of lookup

        const size_t NUM_ITERATIONS_LARGE = 12; // results in circuit size 2^19 (502238 gates)
        const size_t NUM_ITERATIONS_MEDIUM = 3; // results in circuit size 2^17 (124843 gates)
        const size_t NUM_ITERATIONS = large ? NUM_ITERATIONS_LARGE : NUM_ITERATIONS_MEDIUM;

        stdlib::generate_sha256_test_circuit(builder, NUM_ITERATIONS);             // min gates: ~39k
        stdlib::generate_ecdsa_verification_test_circuit(builder, NUM_ITERATIONS); // min gates: ~41k
        stdlib::generate_merkle_membership_test_circuit(builder, NUM_ITERATIONS);  // min gates: ~29k

        return builder;
    }
};

BENCHMARK_TEMPLATE_F(SimulatorFixture, GoblinNative, bb::GoblinUltraRecursiveFlavor_<bb::CircuitSimulatorBN254>)
(benchmark::State& state)
{
    auto verifier_input = SimulatorFixture::create_proof_goblin_builder();
    for (auto _ : state) {
        UltraVerifier_<typename SimulatorFixture::Flavor> ultra_verifier{ verifier_input.verification_key };
        ultra_verifier.verify_proof((verifier_input.proof));
    }
}

BENCHMARK_TEMPLATE_F(SimulatorFixture, GoblinSimulated, bb::GoblinUltraRecursiveFlavor_<bb::CircuitSimulatorBN254>)
(benchmark::State& state)
{
    auto verifier_input = SimulatorFixture::create_proof_goblin_builder();
    for (auto _ : state) {
        typename SimulatorFixture::CircuitSimulator simulator;
        typename SimulatorFixture::SimulatingVerifier ultra_verifier{ &simulator, verifier_input.verification_key };
        ultra_verifier.verify_proof((verifier_input.proof));
    }
}

BENCHMARK_TEMPLATE_F(SimulatorFixture, UltraNative, bb::UltraRecursiveFlavor_<bb::CircuitSimulatorBN254>)
(benchmark::State& state)
{
    auto verifier_input = SimulatorFixture::create_proof_goblin_builder();
    for (auto _ : state) {
        UltraVerifier_<typename SimulatorFixture::Flavor> ultra_verifier{ verifier_input.verification_key };
        ultra_verifier.verify_proof((verifier_input.proof));
    }
}

BENCHMARK_TEMPLATE_F(SimulatorFixture, UltraSimulated, bb::UltraRecursiveFlavor_<bb::CircuitSimulatorBN254>)
(benchmark::State& state)
{
    auto verifier_input = SimulatorFixture::create_proof_goblin_builder();
    for (auto _ : state) {
        typename SimulatorFixture::CircuitSimulator simulator;
        typename SimulatorFixture::SimulatingVerifier ultra_verifier{ &simulator, verifier_input.verification_key };
        ultra_verifier.verify_proof((verifier_input.proof));
    }
}

BENCHMARK_REGISTER_F(SimulatorFixture, GoblinSimulated)->Unit(benchmark::kMillisecond);
BENCHMARK_REGISTER_F(SimulatorFixture, UltraSimulated)->Unit(benchmark::kMillisecond);
BENCHMARK_REGISTER_F(SimulatorFixture, GoblinNative)->Unit(benchmark::kMillisecond);
BENCHMARK_REGISTER_F(SimulatorFixture, UltraNative)->Unit(benchmark::kMillisecond);

} // namespace
BENCHMARK_MAIN();