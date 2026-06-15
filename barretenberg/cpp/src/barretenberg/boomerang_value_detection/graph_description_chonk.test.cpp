#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/chonk_verifier.hpp"
#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/srs/global_crs.hpp"

using namespace bb;

class ChonkWitnessDuplicateTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    using CircuitProducer = PrivateFunctionExecutionMockCircuitProducer;
    using RecursiveBuilder = UltraCircuitBuilder;
    using ChonkVerifier = ChonkRecursiveVerifier;
    using StdlibProof = ChonkStdlibProof;
    using VKAndHash = MegaZKFlavor::VKAndHash;

    static constexpr size_t NUM_APP_CIRCUITS = 2;
    static constexpr size_t SMALL_LOG_2_NUM_GATES = 5;

    struct ChonkProverOutput {
        ChonkProof proof;
        std::shared_ptr<VKAndHash> vk_and_hash;
    };

    static ChonkProverOutput construct_chonk_prover_output()
    {
        CircuitProducer circuit_producer(NUM_APP_CIRCUITS, /*large_first_app=*/false);
        Chonk ivc{ circuit_producer.circuit_kinds() };
        TestSettings settings{ .log2_num_gates = SMALL_LOG_2_NUM_GATES };

        for (size_t idx = 0; idx < circuit_producer.total_num_circuits; ++idx) {
            circuit_producer.construct_and_accumulate_next_circuit(ivc, settings);
        }

        return { ivc.prove(), ivc.get_hiding_kernel_vk_and_hash() };
    }
};

TEST_F(ChonkWitnessDuplicateTests, InitKernelWitnessDuplicates)
{
    CircuitProducer circuit_producer(NUM_APP_CIRCUITS);
    Chonk ivc{ circuit_producer.circuit_kinds() };
    TestSettings settings{ .log2_num_gates = SMALL_LOG_2_NUM_GATES };

    circuit_producer.construct_and_accumulate_next_circuit(ivc, settings);

    auto kernel_circuit =
        circuit_producer.create_next_circuit(ivc, settings.log2_num_gates, settings.num_public_inputs);
    auto vk = CircuitProducer::make_circuit_verification_key(ivc.current_kind(), kernel_circuit);

    info("Init kernel: num gates = ", kernel_circuit.num_gates());

    auto analyzer = cdg::MegaStaticAnalyzer(kernel_circuit);
    analyzer.fill_witness_duplicate_map({}, cdg::WitnessDuplicateFilterMode::TRIAGE_VALUE_FILTERS);
    EXPECT_TRUE(analyzer.get_witness_duplicate_map().empty());

    ivc.accumulate(kernel_circuit, vk);
}

TEST_F(ChonkWitnessDuplicateTests, TailKernelWitnessDuplicates)
{
    CircuitProducer circuit_producer(NUM_APP_CIRCUITS);
    const size_t num_circuits = circuit_producer.total_num_circuits;
    Chonk ivc{ circuit_producer.circuit_kinds() };
    TestSettings settings{ .log2_num_gates = SMALL_LOG_2_NUM_GATES };

    for (size_t j = 0; j < num_circuits - 2; ++j) {
        circuit_producer.construct_and_accumulate_next_circuit(ivc, settings);
    }

    auto kernel_circuit =
        circuit_producer.create_next_circuit(ivc, settings.log2_num_gates, settings.num_public_inputs);
    auto vk = CircuitProducer::make_circuit_verification_key(ivc.current_kind(), kernel_circuit);

    info("Tail kernel: num gates = ", kernel_circuit.num_gates());

    auto analyzer = cdg::MegaStaticAnalyzer(kernel_circuit);
    analyzer.fill_witness_duplicate_map({}, cdg::WitnessDuplicateFilterMode::TRIAGE_VALUE_FILTERS);
    EXPECT_TRUE(analyzer.get_witness_duplicate_map().empty());

    ivc.accumulate(kernel_circuit, vk);
}

TEST_F(ChonkWitnessDuplicateTests, HidingKernelWitnessDuplicates)
{
    CircuitProducer circuit_producer(NUM_APP_CIRCUITS);
    const size_t num_circuits = circuit_producer.total_num_circuits;
    Chonk ivc{ circuit_producer.circuit_kinds() };
    TestSettings settings{ .log2_num_gates = SMALL_LOG_2_NUM_GATES };

    for (size_t j = 0; j < num_circuits - 1; ++j) {
        circuit_producer.construct_and_accumulate_next_circuit(ivc, settings);
    }

    auto kernel_circuit = circuit_producer.create_next_circuit(ivc);
    auto vk = CircuitProducer::make_circuit_verification_key(ivc.current_kind(), kernel_circuit);

    info("Hiding kernel: num gates = ", kernel_circuit.num_gates());

    auto analyzer = cdg::MegaStaticAnalyzer(kernel_circuit);
    analyzer.fill_witness_duplicate_map({}, cdg::WitnessDuplicateFilterMode::TRIAGE_VALUE_FILTERS);
    EXPECT_TRUE(analyzer.get_witness_duplicate_map().empty());

    ivc.accumulate(kernel_circuit, vk);
}

TEST_F(ChonkWitnessDuplicateTests, RecursiveVerifierWitnessDuplicates)
{
    auto [proof, native_vk_and_hash] = construct_chonk_prover_output();

    RecursiveBuilder builder;
    auto recursive_vk_and_hash = std::make_shared<ChonkVerifier::VKAndHash>(builder, native_vk_and_hash->vk);
    ChonkVerifier verifier{ recursive_vk_and_hash };

    StdlibProof stdlib_proof(builder, proof);
    auto output = verifier.verify(stdlib_proof);

    EXPECT_FALSE(builder.failed()) << builder.err();
    EXPECT_TRUE(output.all_checks_passed);
    EXPECT_TRUE(CircuitChecker::check(builder));

    info("Chonk recursive verifier: finalized num gates = ", builder.get_num_finalized_gates_inefficient());

    auto analyzer = cdg::StaticAnalyzer(builder);
    analyzer.fill_witness_duplicate_map({}, cdg::WitnessDuplicateFilterMode::TRIAGE_VALUE_FILTERS);
    EXPECT_TRUE(analyzer.get_witness_duplicate_map().empty());
}
