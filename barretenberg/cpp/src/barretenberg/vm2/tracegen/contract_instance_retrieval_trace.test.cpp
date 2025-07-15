#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>
#include <memory>
#include <vector>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/constraining/full_row.hpp"
#include "barretenberg/vm2/simulation/events/contract_instance_retrieval_event.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/contract_instance_retrieval_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using C = Column;
using simulation::ContractInstanceRetrievalEvent;

// Helper to create a test contract instance with all fields populated
ContractInstance create_test_contract_instance(uint32_t salt_value = 123)
{
    return ContractInstance{
        .salt = FF(salt_value),
        .deployer_addr = FF(0x123456789ULL),
        .current_class_id = FF(0xdeadbeefULL),
        .original_class_id = FF(0xcafebabeULL),
        .initialisation_hash = FF(0x11111111ULL),
        .public_keys =
            PublicKeys{
                .nullifier_key = { FF(0x100), FF(0x101) },
                .incoming_viewing_key = { FF(0x200), FF(0x201) },
                .outgoing_viewing_key = { FF(0x300), FF(0x301) },
                .tagging_key = { FF(0x400), FF(0x401) },
            },
    };
}

TEST(ContractInstanceRetrievalTraceGenTest, EmptyEvents)
{
    TestTraceContainer trace;
    ContractInstanceRetrievalTraceBuilder builder;

    builder.process({}, trace);

    // When there are no events, the trace sets selector to 0 at row 0
    // But since TraceContainer doesn't store zero values, get_num_rows() returns 0
    // We verify that reading row 0 returns 0 for the selector
    EXPECT_EQ(trace.get(C::contract_instance_retrieval_sel, 0), 0);
}

TEST(ContractInstanceRetrievalTraceGenTest, SingleEvent)
{
    TestTraceContainer trace;
    ContractInstanceRetrievalTraceBuilder builder;

    // Test constants
    const auto contract_address = FF(0xabcdef123456ULL);
    const auto nullifier_tree_root = FF(0x9999);
    const auto public_data_tree_root = FF(0x8888);
    const auto deployment_nullifier = FF(0x7777);
    const auto deployer_protocol_contract_address = FF(0x6666);
    const auto expected_rows = 2;

    auto contract_instance = create_test_contract_instance();

    builder.process(
        {
            ContractInstanceRetrievalEvent{
                .address = contract_address,
                .contract_instance = contract_instance,
                .nullifier_tree_root = nullifier_tree_root,
                .public_data_tree_root = public_data_tree_root,
                .deployment_nullifier = deployment_nullifier,
                .nullifier_exists = true,
                .deployer_protocol_contract_address = deployer_protocol_contract_address,
            },
        },
        trace);

    auto rows = trace.as_rows();

    // Skippable gadget row + 1 event row
    ASSERT_EQ(rows.size(), expected_rows);

    // Check skippable gadget row
    EXPECT_THAT(rows.at(0), ROW_FIELD_EQ(contract_instance_retrieval_sel, 0));

    // Check event row
    EXPECT_THAT(rows.at(1),
                AllOf(ROW_FIELD_EQ(contract_instance_retrieval_sel, 1),
                      ROW_FIELD_EQ(contract_instance_retrieval_address, contract_address),
                      ROW_FIELD_EQ(contract_instance_retrieval_exists, 1),

                      // Contract instance members
                      ROW_FIELD_EQ(contract_instance_retrieval_salt, 123),
                      ROW_FIELD_EQ(contract_instance_retrieval_deployer_addr, 0x123456789ULL),
                      ROW_FIELD_EQ(contract_instance_retrieval_current_class_id, 0xdeadbeefULL),
                      ROW_FIELD_EQ(contract_instance_retrieval_original_class_id, 0xcafebabeULL),
                      ROW_FIELD_EQ(contract_instance_retrieval_init_hash, 0x11111111ULL),

                      // Public keys
                      ROW_FIELD_EQ(contract_instance_retrieval_nullifier_key_x, 0x100),
                      ROW_FIELD_EQ(contract_instance_retrieval_nullifier_key_y, 0x101),
                      ROW_FIELD_EQ(contract_instance_retrieval_incoming_viewing_key_x, 0x200),
                      ROW_FIELD_EQ(contract_instance_retrieval_incoming_viewing_key_y, 0x201),
                      ROW_FIELD_EQ(contract_instance_retrieval_outgoing_viewing_key_x, 0x300),
                      ROW_FIELD_EQ(contract_instance_retrieval_outgoing_viewing_key_y, 0x301),
                      ROW_FIELD_EQ(contract_instance_retrieval_tagging_key_x, 0x400),
                      ROW_FIELD_EQ(contract_instance_retrieval_tagging_key_y, 0x401),

                      // Tree context
                      ROW_FIELD_EQ(contract_instance_retrieval_public_data_tree_root, public_data_tree_root),
                      ROW_FIELD_EQ(contract_instance_retrieval_nullifier_tree_root, nullifier_tree_root),

                      // Deployer protocol contract address
                      ROW_FIELD_EQ(contract_instance_retrieval_deployer_protocol_contract_address,
                                   deployer_protocol_contract_address)));
}

TEST(ContractInstanceRetrievalTraceGenTest, MultipleEvents)
{
    TestTraceContainer trace;
    ContractInstanceRetrievalTraceBuilder builder;

    // Test constants
    const auto num_events = 5;
    const auto base_address = 0x1000;
    const auto base_nullifier_tree_root = 0x2000;
    const auto base_public_data_tree_root = 0x3000;
    const auto base_deployment_nullifier = 0x4000;
    const auto base_deployer_protocol_contract_address = 0x5000;
    const auto base_salt = 1000;
    const auto expected_rows = num_events + 1; // +1 for skippable gadget row

    std::vector<ContractInstanceRetrievalEvent> events;

    // Create events with different data
    for (uint32_t i = 0; i < num_events; i++) {
        auto contract_instance = create_test_contract_instance(base_salt + i);

        events.push_back(ContractInstanceRetrievalEvent{
            .address = FF(base_address + i),
            .contract_instance = contract_instance,
            .nullifier_tree_root = FF(base_nullifier_tree_root + i),
            .public_data_tree_root = FF(base_public_data_tree_root + i),
            .deployment_nullifier = FF(base_deployment_nullifier + i),
            .nullifier_exists = (i % 2 == 0), // Alternate true/false
            .deployer_protocol_contract_address = FF(base_deployer_protocol_contract_address + i),
        });
    }

    builder.process(events, trace);
    auto rows = trace.as_rows();

    ASSERT_EQ(rows.size(), expected_rows);

    // Check each event row
    for (uint32_t i = 0; i < num_events; i++) {
        EXPECT_THAT(
            rows.at(i + 1),
            AllOf(ROW_FIELD_EQ(contract_instance_retrieval_sel, 1),
                  ROW_FIELD_EQ(contract_instance_retrieval_address, base_address + i),
                  ROW_FIELD_EQ(contract_instance_retrieval_exists, i % 2 == 0 ? 1 : 0),
                  ROW_FIELD_EQ(contract_instance_retrieval_salt, base_salt + i),
                  ROW_FIELD_EQ(contract_instance_retrieval_nullifier_tree_root, base_nullifier_tree_root + i),
                  ROW_FIELD_EQ(contract_instance_retrieval_public_data_tree_root, base_public_data_tree_root + i),
                  ROW_FIELD_EQ(contract_instance_retrieval_deployer_protocol_contract_address,
                               base_deployer_protocol_contract_address + i)));
    }
}

} // namespace
} // namespace bb::avm2::tracegen
