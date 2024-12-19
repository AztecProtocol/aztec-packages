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
    using VK = Flavor::VerificationKey;
    using PK = DeciderProvingKey_<Flavor>;

    /**
     * @brief A test utility for generating alternating mock app and kernel circuits and precomputing verification keys
     *
     */
    class MockCircuitSource : public CircuitSource<Flavor> {
        std::vector<size_t> _sizes;
        std::vector<std::shared_ptr<VK>> _vks;
        uint32_t step{ 0 };

      public:
        MockCircuitSource(const std::vector<size_t>& sizes)
            : _sizes(sizes)
        {
            std::fill_n(std::back_inserter(_vks), sizes.size(), nullptr);
        }

        MockCircuitSource(const MockCircuitSource& source_without_sizes, std::vector<std::shared_ptr<VK>> vks)
            : _sizes(source_without_sizes._sizes)
            , _vks(vks)
        {}

        Output next() override
        {
            Builder circuit;
            MockCircuits::construct_arithmetic_circuit(circuit, _sizes[step]);
            const auto& vk = _vks[step];
            ++step;
            return { circuit, vk };
        }

        size_t num_circuits() const override
        {
            ASSERT(_sizes.size() == _vks.size());
            return _sizes.size();
        }
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
    MockCircuitSource circuit_source{ { LOG_SIZE, LOG_SIZE } };
    EXPECT_TRUE(ivc.prove_and_verify(circuit_source));
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
    MockCircuitSource circuit_source{ { LOG_SIZE, LOG_SIZE, LOG_SIZE, LOG_SIZE } };
    EXPECT_TRUE(ivc.prove_and_verify(circuit_source));
};

/**
 * @brief Prove and verify accumulation of an arbitrary set of circuits using precomputed verification keys
 *
 */
TEST_F(UltraVanillaClientIVCTests, PrecomputedVerificationKeys)
{

    static constexpr size_t LOG_SIZE = 10;

    UltraVanillaClientIVC ivc(1 << LOG_SIZE);
    MockCircuitSource circuit_source_no_vks{ { LOG_SIZE, LOG_SIZE } };
    auto vks = ivc.compute_vks(circuit_source_no_vks);
    MockCircuitSource circuit_source_with_vks{ circuit_source_no_vks, vks };
    EXPECT_TRUE(ivc.prove_and_verify(circuit_source_with_vks));
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
