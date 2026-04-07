#include "barretenberg/chonk/chonk_v2.hpp"
#include "barretenberg/chonk/mock_circuit_producer_v2.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include <gtest/gtest.h>

using namespace bb;

class ChonkV2Test : public ::testing::Test {
  protected:
    void SetUp() override
    {
        bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
        // MegaV2Flavor requires a larger stack due to template instantiation with larger entity types.
        // The default 8MB stack is insufficient for the permutation argument computation on large circuits.
        // This is set via the test runner (ulimit -s) or the CMake test properties.
    }
};

// Test that ProverInstance_<MegaV2Flavor> works with a simple circuit containing Poseidon2 op gates
TEST_F(ChonkV2Test, TypeSizes)
{
    info("sizeof(MegaFlavor::ProverPolynomials): ", sizeof(MegaFlavor::ProverPolynomials));
    info("sizeof(MegaV2Flavor::ProverPolynomials): ", sizeof(MegaV2Flavor::ProverPolynomials));
    info("sizeof(MegaFlavor::AllValues): ", sizeof(MegaFlavor::AllValues));
    info("sizeof(MegaV2Flavor::AllValues): ", sizeof(MegaV2Flavor::AllValues));
    info("sizeof(Polynomial<fr>): ", sizeof(Polynomial<fr>));
    info("sizeof(fr): ", sizeof(fr));
}

// Measure block sizes for each circuit in the IVC chain
TEST_F(ChonkV2Test, BlockSizeAnalysis)
{
    constexpr size_t NUM_APP_CIRCUITS = 2;

    // --- Standard Chonk (MegaFlavor) ---
    {
        info("=== STANDARD CHONK (MegaFlavor) ===");
        PrivateFunctionExecutionMockCircuitProducer circuit_producer(NUM_APP_CIRCUITS, /*large_first_app=*/false);
        const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
        Chonk ivc{ NUM_CIRCUITS };

        for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {
            auto circuit = circuit_producer.create_next_circuit(ivc);
            circuit.finalize_circuit(true);
            circuit.blocks.compute_offsets();

            size_t total = circuit.blocks.get_total_size();
            size_t dyadic = circuit.get_circuit_subgroup_size(total);
            size_t p2_ext = circuit.blocks.poseidon2_external.size();
            size_t p2_int = circuit.blocks.poseidon2_internal.size();
            size_t p2_total = p2_ext + p2_int;
            size_t num_hashes = p2_total / 64; // each permutation = 64 rows (8 ext + 56 int)

            info("Circuit ", circuit_idx + 1, "/", NUM_CIRCUITS, " (", circuit_idx == 0 ? "app" : "kernel",
                 "): total=", total, " dyadic=", dyadic, " poseidon2_ext=", p2_ext, " poseidon2_int=", p2_int,
                 " poseidon2_total=", p2_total, " (~", num_hashes, " hashes, ",
                 (p2_total * 100) / total, "% of trace)");

            auto vk = PrivateFunctionExecutionMockCircuitProducer::get_verification_key(circuit);
            ivc.accumulate(circuit, vk);
        }
    }

    // --- ChonkV2 (MegaV2Flavor) ---
    {
        info("\n=== CHONK V2 (MegaV2Flavor) ===");
        PrivateFunctionExecutionMockCircuitProducerV2 circuit_producer(NUM_APP_CIRCUITS, /*large_first_app=*/false);
        const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
        ChonkV2 ivc{ NUM_CIRCUITS };

        for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {
            auto circuit = circuit_producer.create_next_circuit(ivc);
            circuit.finalize_circuit(true);
            circuit.blocks.compute_offsets();

            size_t total = circuit.blocks.get_total_size();
            size_t dyadic = circuit.get_circuit_subgroup_size(total);
            size_t p2_ext = circuit.blocks.poseidon2_external.size();
            size_t p2_int = circuit.blocks.poseidon2_internal.size();
            size_t p2_op = circuit.blocks.poseidon2_op.size();
            size_t p2_total = p2_ext + p2_int;
            size_t num_hashes = p2_total / 64;

            info("Circuit ", circuit_idx + 1, "/", NUM_CIRCUITS,
                 ": total=", total, " dyadic=", dyadic, " poseidon2_ext=", p2_ext, " poseidon2_int=", p2_int,
                 " poseidon2_total=", p2_total, " (~", num_hashes, " hashes, ",
                 (p2_total * 100) / total, "% of trace)",
                 " poseidon2_op=", p2_op, " (deferred)");

            auto vk = PrivateFunctionExecutionMockCircuitProducerV2::get_verification_key(circuit);
            ivc.accumulate_v2(circuit, vk);
        }
    }
}

TEST_F(ChonkV2Test, ProverInstanceBasic)
{
    MegaCircuitBuilder builder;
    auto poseidon2_op_queue = std::make_shared<Poseidon2OpQueue>();
    builder.poseidon2_op_queue = poseidon2_op_queue;

    // Add a few Poseidon2 deferred hashes
    for (size_t i = 0; i < 3; i++) {
        std::array<uint32_t, 4> input = { builder.add_variable(fr::random_element()),
                                           builder.add_variable(fr::random_element()),
                                           builder.add_variable(fr::random_element()),
                                           builder.add_variable(fr::random_element()) };
        builder.queue_poseidon2_permutation(input);
    }

    // Add some basic arithmetic to have non-trivial content
    // Add enough arithmetic gates to ensure a reasonable trace size
    auto val = fr::random_element();
    for (size_t i = 0; i < 100; i++) {
        auto a = builder.add_variable(val);
        val = val + fr(1);
        auto b = builder.add_variable(val);
        val = val + fr(1);
        auto c = builder.add_variable(builder.get_variable(a) + builder.get_variable(b));
        builder.create_add_gate({ a, b, c, 1, 1, -1, 0 });
    }

    // Test KernelV2IO::add_default separately
    info("Adding KernelV2IO defaults...");
    stdlib::recursion::honk::KernelV2IO::add_default(builder);
    info("KernelV2IO defaults added");

    info("Builder: poseidon2_op block size = ", builder.blocks.poseidon2_op.size());
    info("Builder: poseidon2_op_queue ops = ", poseidon2_op_queue->get_total_num_ops());

    // Create ProverInstance — this is where it might crash
    // Pre-finalize exactly as in the passing test
    builder.finalize_circuit(true);
    builder.blocks.compute_offsets();
    info("Total trace size: ", builder.blocks.get_total_size());
    info("Dyadic size: ", builder.get_circuit_subgroup_size(builder.blocks.get_total_size()));
    for (auto [label, block] : zip_view(builder.blocks.get_labels(), builder.blocks.get())) {
        if (block.size() > 0)
            info("  Block ", label, ": size=", block.size(), " offset=", block.trace_offset());
    }
    // Use real ProverInstance — the manual test confirmed allocation order is correct
    info("Creating ProverInstance<MegaV2Flavor>...");
    auto prover_instance = std::make_shared<ProverInstance_<MegaV2Flavor>>(builder);
    info("ProverInstance created, dyadic size = ", prover_instance->dyadic_size());

    // Create VK
    info("Creating VK...");
    auto vk = std::make_shared<MegaV2Flavor::VerificationKey>(prover_instance->get_precomputed());
    info("VK created");

    // Create prover and prove
    info("Creating prover...");
    UltraProver_<MegaV2Flavor> prover(prover_instance, vk);
    auto proof = prover.construct_proof();
    info("Proof constructed, size = ", proof.size());

    EXPECT_GT(proof.size(), 0UL);
}

// Reproducer for OOB crash in compute_permutation_argument_polynomials<MegaV2Flavor>
// Uses construct_mock_app_circuit which creates a large circuit (~73MB).
TEST_F(ChonkV2Test, LargeCircuitProverInstance)
{
    MegaCircuitBuilder builder;
    auto op_queue = std::make_shared<ECCOpQueue>();
    builder.op_queue = op_queue;
    auto poseidon2_op_queue = std::make_shared<Poseidon2OpQueue>();
    builder.poseidon2_op_queue = poseidon2_op_queue;

    // Create a large mock app circuit (same as what SingleAppCircuit uses)
    GoblinMockCircuits::construct_mock_app_circuit(builder, /*large=*/false);
    stdlib::recursion::honk::KernelV2IO::add_default(builder);

    // Add some deferred Poseidon2 hashes
    for (size_t i = 0; i < 10; i++) {
        std::array<uint32_t, 4> input = { builder.add_variable(fr::random_element()),
                                           builder.add_variable(fr::random_element()),
                                           builder.add_variable(fr::random_element()),
                                           builder.add_variable(fr::random_element()) };
        builder.queue_poseidon2_permutation(input);
    }

    builder.finalize_circuit(true);
    builder.blocks.compute_offsets();

    info("Total trace size: ", builder.blocks.get_total_size());
    info("Dyadic size: ", builder.get_circuit_subgroup_size(builder.blocks.get_total_size()));
    for (auto [label, block] : zip_view(builder.blocks.get_labels(), builder.blocks.get())) {
        if (block.size() > 0)
            info("  Block ", label, ": size=", block.size(), " offset=", block.trace_offset());
    }

    info("Creating ProverInstance<MegaV2Flavor>...");
    auto prover_instance = std::make_shared<ProverInstance_<MegaV2Flavor>>(builder);
    info("ProverInstance created, dyadic size = ", prover_instance->dyadic_size());

    EXPECT_GT(prover_instance->dyadic_size(), 0UL);
}

// Two app circuits with large first app (matches benchmark configuration)
TEST_F(ChonkV2Test, TwoAppCircuits)
{
    constexpr size_t NUM_APP_CIRCUITS = 2;
    PrivateFunctionExecutionMockCircuitProducerV2 circuit_producer(NUM_APP_CIRCUITS, /*large_first_app=*/false);
    const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
    ChonkV2 ivc{ NUM_CIRCUITS };

    for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {
        info("Creating circuit ", circuit_idx + 1, " of ", NUM_CIRCUITS);
        auto circuit = circuit_producer.create_next_circuit(ivc);
        info("Circuit created");

        info("Creating VK...");
        auto vk = PrivateFunctionExecutionMockCircuitProducerV2::get_verification_key(circuit);
        info("VK created");

        ivc.accumulate_v2(circuit, vk);
        info("Circuit accumulated");
    }

    info("Constructing proof...");
    auto proof = ivc.prove();
    info("Proof constructed, size: ", proof.size());
}

// Full IVC test (may be slow)
TEST_F(ChonkV2Test, SingleAppCircuit)
{
    constexpr size_t NUM_APP_CIRCUITS = 1;
    PrivateFunctionExecutionMockCircuitProducerV2 circuit_producer(NUM_APP_CIRCUITS, /*large_first_app=*/false);
    const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
    ChonkV2 ivc{ NUM_CIRCUITS };

    for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {
        info("Creating circuit ", circuit_idx + 1, " of ", NUM_CIRCUITS);
        auto circuit = circuit_producer.create_next_circuit(ivc);
        info("Circuit created");

        info("Creating VK...");
        auto vk = PrivateFunctionExecutionMockCircuitProducerV2::get_verification_key(circuit);
        info("VK created");

        ivc.accumulate_v2(circuit, vk);
        info("Circuit accumulated");
    }

    info("Constructing proof...");
    auto proof = ivc.prove();
    info("Proof constructed, size: ", proof.size());
}
