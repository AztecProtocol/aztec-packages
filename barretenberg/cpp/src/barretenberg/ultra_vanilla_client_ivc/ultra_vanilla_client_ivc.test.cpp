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
};

TEST_F(UltraVanillaClientIVCTests, TwoCircuits)
{
    static constexpr size_t LOG_SIZE = 10;
    UltraVanillaClientIVC ivc(1 << LOG_SIZE);
    MockCircuitSource circuit_source{ { LOG_SIZE, LOG_SIZE } };
    EXPECT_TRUE(ivc.prove_and_verify(circuit_source));
};

TEST_F(UltraVanillaClientIVCTests, ThreeCircuits)
{
    static constexpr size_t LOG_SIZE = 10;
    UltraVanillaClientIVC ivc(1 << LOG_SIZE);
    MockCircuitSource circuit_source{ { LOG_SIZE, LOG_SIZE, LOG_SIZE } };
    EXPECT_TRUE(ivc.prove_and_verify(circuit_source));
};

/**
 * @brief Prove and verify accumulation of an arbitrary set of circuits using precomputed verification keys
 * @details The tests precomputed the keys via one pass of the ivc prover, then it usese then in a second pass.
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

// TODO(https://github.com/AztecProtocol/barretenberg/issues/1177) Implement failure tests