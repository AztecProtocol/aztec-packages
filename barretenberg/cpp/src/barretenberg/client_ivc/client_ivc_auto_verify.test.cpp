#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <gtest/gtest.h>

using namespace bb;

// TODO(https://github.com/AztecProtocol/barretenberg/issues/1101): These tests are for the auto_verify_mode version of
// ClientIVC and can be removed altogether when that functionality is removed.
class ClientIVCAutoVerifyTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite()
    {
        srs::init_crs_factory("../srs_db/ignition");
        srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
    }

    using Flavor = ClientIVC::Flavor;
    using FF = typename Flavor::FF;
    using VerificationKey = Flavor::VerificationKey;
    using Builder = ClientIVC::ClientCircuit;
    using DeciderProvingKey = ClientIVC::DeciderProvingKey;
    using DeciderVerificationKey = ClientIVC::DeciderVerificationKey;
    using FoldProof = ClientIVC::FoldProof;
    using DeciderProver = ClientIVC::DeciderProver;
    using DeciderVerifier = ClientIVC::DeciderVerifier;
    using DeciderProvingKeys = DeciderProvingKeys_<Flavor>;
    using FoldingProver = ProtogalaxyProver_<DeciderProvingKeys>;
    using DeciderVerificationKeys = DeciderVerificationKeys_<Flavor>;
    using FoldingVerifier = ProtogalaxyVerifier_<DeciderVerificationKeys>;

    /**
     * @brief Construct mock circuit with arithmetic gates and goblin ops
     * @details Currently default sized to 2^16 to match kernel. (Note: dummy op gates added to avoid non-zero
     * polynomials will bump size to next power of 2)
     *
     */
    static Builder create_mock_circuit(ClientIVC& ivc, bool is_kernel, size_t log2_num_gates = 16)
    {
        Builder circuit{ ivc.goblin.op_queue };
        MockCircuits::construct_arithmetic_circuit(circuit, log2_num_gates);

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/911): We require goblin ops to be added to the
        // function circuit because we cannot support zero commtiments. While the builder handles this at
        // finalisation stage via the add_gates_to_ensure_all_polys_are_non_zero function for other MegaHonk
        // circuits (where we don't explicitly need to add goblin ops), in ClientIVC merge proving happens prior to
        // folding where the absense of goblin ecc ops will result in zero commitments.
        MockCircuits::construct_goblin_ecc_op_circuit(circuit);

        circuit.databus_propagation_data.is_kernel = is_kernel;
        return circuit;
    }
};

/**
 * @brief A simple-as-possible test demonstrating IVC for two mock circuits
 *
 */
TEST_F(ClientIVCAutoVerifyTests, Basic)
{
    ClientIVC ivc{ {}, /*auto_verify_mode=*/true };

    // Initialize the IVC with an arbitrary circuit
    Builder circuit_0 = create_mock_circuit(ivc, /*is_kernel=*/false);
    ivc.accumulate(circuit_0);

    // Create another circuit and accumulate
    Builder circuit_1 = create_mock_circuit(ivc, /*is_kernel=*/true);
    ivc.accumulate(circuit_1);

    EXPECT_TRUE(ivc.prove_and_verify());
};

/**
 * @brief The number of circuits processed can be odd as long as the last one is a kernel
 *
 */
TEST_F(ClientIVCAutoVerifyTests, BasicOdd)
{
    ClientIVC ivc{ {}, /*auto_verify_mode=*/true };

    // Initialize the IVC with an arbitrary circuit
    Builder circuit_0 = create_mock_circuit(ivc, /*is_kernel=*/false);
    ivc.accumulate(circuit_0);

    // Create another circuit and accumulate
    Builder circuit_1 = create_mock_circuit(ivc, /*is_kernel=*/true);
    ivc.accumulate(circuit_1);

    // Create another circuit and accumulate
    Builder circuit_2 = create_mock_circuit(ivc, /*is_kernel=*/true);
    ivc.accumulate(circuit_2);

    EXPECT_TRUE(ivc.prove_and_verify());
};

/**
 * @brief Prove and verify accumulation of an arbitrary set of circuits
 *
 */
TEST_F(ClientIVCAutoVerifyTests, BasicLarge)
{
    ClientIVC ivc{ {}, /*auto_verify_mode=*/true };

    // Construct a set of arbitrary circuits
    size_t NUM_CIRCUITS = 6;
    std::vector<Builder> circuits;
    for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
        bool is_kernel = (idx % 2 == 1); // every second circuit is a kernel
        circuits.emplace_back(create_mock_circuit(ivc, is_kernel));
    }

    // Accumulate each circuit
    for (auto& circuit : circuits) {
        ivc.accumulate(circuit);
    }

    EXPECT_TRUE(ivc.prove_and_verify());
};

/**
 * @brief Using a structured trace allows for the accumulation of circuits of varying size
 *
 */
TEST_F(ClientIVCAutoVerifyTests, BasicStructured)
{
    ClientIVC ivc{ { SMALL_TEST_STRUCTURE }, /*auto_verify_mode=*/true };

    // Construct some circuits of varying size
    Builder circuit_0 = create_mock_circuit(ivc, /*is_kernel=*/false, /*log2_num_gates=*/5);
    Builder circuit_1 = create_mock_circuit(ivc, /*is_kernel=*/true, /*log2_num_gates=*/8);
    Builder circuit_2 = create_mock_circuit(ivc, /*is_kernel=*/false, /*log2_num_gates=*/11);
    Builder circuit_3 = create_mock_circuit(ivc, /*is_kernel=*/true, /*log2_num_gates=*/11);

    // The circuits can be accumulated as normal due to the structured trace
    ivc.accumulate(circuit_0);
    ivc.accumulate(circuit_1);
    ivc.accumulate(circuit_2);
    ivc.accumulate(circuit_3);

    EXPECT_TRUE(ivc.prove_and_verify());
};

/**
 * @brief Prove and verify accumulation of an arbitrary set of circuits using precomputed verification keys
 *
 */
TEST_F(ClientIVCAutoVerifyTests, PrecomputedVerificationKeys)
{
    ClientIVC ivc{ {}, /*auto_verify_mode=*/true };

    // Construct a set of arbitrary circuits
    size_t NUM_CIRCUITS = 4;
    std::vector<Builder> circuits;
    for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
        bool is_kernel = (idx % 2 == 1); // every second circuit is a kernel
        circuits.emplace_back(create_mock_circuit(ivc, is_kernel));
    }

    // Precompute the verification keys that will be needed for the IVC
    auto precomputed_vkeys = ivc.precompute_folding_verification_keys(circuits);

    // Accumulate each circuit using the precomputed VKs
    for (auto [circuit, precomputed_vk] : zip_view(circuits, precomputed_vkeys)) {
        ivc.accumulate(circuit, /*one_circuit=*/false, precomputed_vk);
    }

    EXPECT_TRUE(ivc.prove_and_verify());
};

/**
 * @brief Perform accumulation with a structured trace and precomputed verification keys
 *
 */
TEST_F(ClientIVCAutoVerifyTests, StructuredPrecomputedVKs)
{
    ClientIVC ivc{ { SMALL_TEST_STRUCTURE }, /*auto_verify_mode=*/true };

    // Construct a set of arbitrary circuits
    size_t NUM_CIRCUITS = 4;
    std::vector<Builder> circuits;
    for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
        bool is_kernel = (idx % 2 == 1); // every second circuit is a kernel
        circuits.emplace_back(create_mock_circuit(ivc, is_kernel, /*log2_num_gates=*/5));
    }

    // Precompute the (structured) verification keys that will be needed for the IVC
    auto precomputed_vkeys = ivc.precompute_folding_verification_keys(circuits);

    // Accumulate each circuit
    for (auto [circuit, precomputed_vk] : zip_view(circuits, precomputed_vkeys)) {
        ivc.accumulate(circuit, /*one_circuit=*/false, precomputed_vk);
    }

    EXPECT_TRUE(ivc.prove_and_verify());
};
