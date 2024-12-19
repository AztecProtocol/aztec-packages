#include "barretenberg/ultra_vanilla_client_ivc/ultra_vanilla_client_ivc.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/protogalaxy/folding_test_utils.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <gtest/gtest.h>

using namespace bb;

class UltraVanillaClientIVCTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite()
    {
        srs::init_crs_factory("../srs_db/ignition");
        srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
    }

    using Flavor = UltraVanillaClientIVC::Flavor;
    using Builder = UltraCircuitBuilder;
    using FF = typename Flavor::FF;
    using VerificationKey = Flavor::VerificationKey;

    /**
     * @brief A test utility for generating alternating mock app and kernel circuits and precomputing verification keys
     *
     */
    class MockCircuitProducer {
        using Circuit = UltraVanillaClientIVC::Circuit;

      public:
        Circuit create_next_circuit(size_t log2_num_gates = 16)
        {
            Circuit circuit;
            MockCircuits::construct_arithmetic_circuit(circuit, log2_num_gates);
            return circuit;
        }

        // auto precompute_verification_keys(const size_t num_circuits,
        //                                   TraceSettings trace_settings,
        //                                   size_t log2_num_gates = 16)
        // {
        //     UltraVanillaClientIVC ivc{
        //         trace_settings
        //     }; // temporary IVC instance needed to produce the complete kernel circuits

        //     std::vector<std::shared_ptr<VerificationKey>> vkeys;

        //     for (size_t idx = 0; idx < num_circuits; ++idx) {
        //         Circuit circuit = create_next_circuit(ivc, log2_num_gates); // create the next circuit
        //         ivc.accumulate(circuit);                                          // accumulate the circuit
        //         vkeys.emplace_back(ivc.honk_vk);                                  // save the VK for the circuit
        //     }
        //     is_kernel = false;

        //     return vkeys;
        // }
    };

    // /**
    //  * @brief Tamper with a proof by finding the first non-zero value and incrementing it by 1
    //  *
    //  */
    // static void tamper_with_proof(FoldProof& proof)
    // {
    //     for (auto& val : proof) {
    //         if (val > 0) {
    //             val += 1;
    //             break;
    //         }
    //     }
    // }
};

/**
 * @brief A simple-as-possible test demonstrating IVC for two mock circuits
 * @details When accumulating only two circuits, only a single round of folding is performed thus no recursive
 * verfication occurs.
 *
 */
TEST_F(UltraVanillaClientIVCTests, Basic)
{
    static constexpr size_t LOG_SIZE = 10;
    UltraVanillaClientIVC ivc(1 << LOG_SIZE);

    MockCircuitProducer circuit_producer;

    std::vector<Builder> circuits{ circuit_producer.create_next_circuit(LOG_SIZE),
                                   circuit_producer.create_next_circuit(LOG_SIZE) };

    std::vector<std::optional<std::shared_ptr<VerificationKey>>> vks{ std::nullopt, std::nullopt };

    EXPECT_TRUE(ivc.prove_and_verify(circuits, vks));
};

/**
 * @brief A simple test demonstrating IVC for four mock circuits, which is slightly more than minimal.
 * @details When accumulating only four circuits, we execute all the functionality of a full UltraVanillaClientIVC
 run.
 *
 */
TEST_F(UltraVanillaClientIVCTests, BasicFour)
{
    static constexpr size_t LOG_SIZE = 10;
    UltraVanillaClientIVC ivc(1 << LOG_SIZE);

    MockCircuitProducer circuit_producer;

    std::vector<Builder> circuits{ circuit_producer.create_next_circuit(LOG_SIZE),
                                   circuit_producer.create_next_circuit(LOG_SIZE),
                                   circuit_producer.create_next_circuit(LOG_SIZE),
                                   circuit_producer.create_next_circuit(LOG_SIZE) };

    std::vector<std::optional<std::shared_ptr<VerificationKey>>> vks{
        std::nullopt, std::nullopt, std::nullopt, std::nullopt
    };

    EXPECT_TRUE(ivc.prove_and_verify(circuits, vks));
};

/**
 * @brief Prove and verify accumulation of an arbitrary set of circuits using precomputed verification keys
 *
 */
TEST_F(UltraVanillaClientIVCTests, PrecomputedVerificationKeys)
{
    UltraVanillaClientIVC ivc;

    size_t NUM_CIRCUITS = 4;

    MockCircuitProducer circuit_producer;

    auto precomputed_vks = circuit_producer.precompute_verification_keys(NUM_CIRCUITS, TraceSettings{});

    // Construct and accumulate set of circuits using the precomputed vkeys
    for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
        auto circuit = circuit_producer.create_next_circuit(ivc);
        ivc.accumulate(circuit, /*one_circuit=*/false, precomputed_vks[idx]);
    }

    EXPECT_TRUE(ivc.prove_and_verify());
};

// /**
//  * @brief Check that the IVC fails if an intermediate fold proof is invalid
//  * @details When accumulating 4 circuits, there are 3 fold proofs to verify (the first two are recursively verfied
//  and
//  * the 3rd is verified as part of the IVC proof). Check that if any of one of these proofs is invalid, the IVC will
//  * fail.
//  *
//  */
// TEST_F(UltraVanillaClientIVCTests, BadProofFailure)
// {
//     // Confirm that the IVC verifies if nothing is tampered with
//     {
//         UltraVanillaClientIVC ivc{ { SMALL_TEST_STRUCTURE } };

//         MockCircuitProducer circuit_producer;

//         // Construct and accumulate a set of mocked private function execution circuits
//         size_t NUM_CIRCUITS = 4;
//         for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
//             auto circuit = circuit_producer.create_next_circuit(ivc, /*log2_num_gates=*/5);
//             ivc.accumulate(circuit);
//         }
//         EXPECT_TRUE(ivc.prove_and_verify());
//     }

//     // The IVC throws an exception if the FIRST fold proof is tampered with
//     {
//         UltraVanillaClientIVC ivc{ { SMALL_TEST_STRUCTURE } };

//         MockCircuitProducer circuit_producer;

//         // Construct and accumulate a set of mocked private function execution circuits
//         size_t NUM_CIRCUITS = 4;
//         for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
//             if (idx == 3) { // At idx = 3, we've tampered with the one of the folding proofs so create the recursive
//                             // folding verifier will throw an error.
//                 EXPECT_ANY_THROW(circuit_producer.create_next_circuit(ivc, /*log2_num_gates=*/5));
//                 break;
//             }
//             auto circuit = circuit_producer.create_next_circuit(ivc, /*log2_num_gates=*/5);
//             ivc.accumulate(circuit);

//             if (idx == 2) {
//                 EXPECT_EQ(ivc.verification_queue.size(), 2);        // two proofs after 3 calls to accumulation
//                 tamper_with_proof(ivc.verification_queue[0].proof); // tamper with first proof
//             }
//         }
//     }

//     // The IVC fails if the SECOND fold proof is tampered with
//     {
//         UltraVanillaClientIVC ivc{ { SMALL_TEST_STRUCTURE } };

//         MockCircuitProducer circuit_producer;

//         // Construct and accumulate a set of mocked private function execution circuits
//         size_t NUM_CIRCUITS = 4;
//         for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
//             if (idx == 3) { // At idx = 3, we've tampered with the one of the folding proofs so create the recursive
//                             // folding verifier will throw an error.
//                 EXPECT_ANY_THROW(circuit_producer.create_next_circuit(ivc, /*log2_num_gates=*/5));
//                 break;
//             }
//             auto circuit = circuit_producer.create_next_circuit(ivc, /*log2_num_gates=*/5);
//             ivc.accumulate(circuit);

//             if (idx == 2) {
//                 EXPECT_EQ(ivc.verification_queue.size(), 2);        // two proofs after 3 calls to accumulation
//                 tamper_with_proof(ivc.verification_queue[1].proof); // tamper with second proof
//             }
//         }
//     }

//     // The IVC fails if the 3rd/FINAL fold proof is tampered with
//     {
//         UltraVanillaClientIVC ivc{ { SMALL_TEST_STRUCTURE } };

//         MockCircuitProducer circuit_producer;

//         // Construct and accumulate a set of mocked private function execution circuits
//         size_t NUM_CIRCUITS = 4;
//         for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
//             auto circuit = circuit_producer.create_next_circuit(ivc, /*log2_num_gates=*/5);
//             ivc.accumulate(circuit);
//         }

//         // Only a single proof should be present in the queue when verification of the IVC is performed
//         EXPECT_EQ(ivc.verification_queue.size(), 1);
//         tamper_with_proof(ivc.verification_queue[0].proof); // tamper with the final fold proof

//         EXPECT_ANY_THROW(ivc.prove_and_verify());
//     }

//     EXPECT_TRUE(true);
// };
