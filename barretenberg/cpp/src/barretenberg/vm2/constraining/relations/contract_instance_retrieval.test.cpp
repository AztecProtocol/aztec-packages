#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>
#include <memory>
#include <vector>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/contract_instance_retrieval.hpp"
#include "barretenberg/vm2/generated/relations/lookups_contract_instance_retrieval.hpp"
#include "barretenberg/vm2/simulation/events/contract_instance_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/contract_instance_retrieval_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using simulation::ContractInstanceRetrievalEvent;
using simulation::EventEmitter;
using tracegen::ContractInstanceRetrievalTraceBuilder;
using tracegen::PrecomputedTraceBuilder;
using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using contract_instance_retrieval = bb::avm2::contract_instance_retrieval<FF>;

// Helper to create a test contract instance
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

TEST(ContractInstanceRetrievalConstrainingTest, EmptyRow)
{
    check_relation<contract_instance_retrieval>(testing::empty_trace());
}

TEST(ContractInstanceRetrievalConstrainingTest, TraceContinuityConstraint)
{
    // Test subrelation 1: TRACE_CONTINUITY
    // (1 - sel) * (1 - precomputed.first_row) * sel' = 0
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        { { C::contract_instance_retrieval_sel, 1 } }, // Active row
        { { C::contract_instance_retrieval_sel, 0 } }, // Inactive row - should be ok
    });

    check_relation<contract_instance_retrieval>(trace, contract_instance_retrieval::SR_TRACE_CONTINUITY);

    // Test all active rows
    trace.set(C::contract_instance_retrieval_sel, 2, 1);
    check_relation<contract_instance_retrieval>(trace, contract_instance_retrieval::SR_TRACE_CONTINUITY);

    // Negative test: invalid trace continuity - inactive row followed by active row
    trace.set(C::contract_instance_retrieval_sel, 1, 0); // Make row 1 inactive
    trace.set(C::contract_instance_retrieval_sel, 2, 1); // Keep row 2 active
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<contract_instance_retrieval>(trace, contract_instance_retrieval::SR_TRACE_CONTINUITY),
        "TRACE_CONTINUITY");
}

TEST(ContractInstanceRetrievalConstrainingTest, CompleteValidTrace)
{
    // Test constants
    const auto contract_address = FF(0x1234567890abcdefULL);
    const auto nullifier_tree_root = FF(0xaabbccdd);
    const auto public_data_tree_root = FF(0xeeff1122);
    const auto timestamp = 12345;
    const auto deployer_contract_address = FF(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS);
    const auto exists = true;
    const auto salt = FF(0x555);
    const auto deployer_addr = FF(0x123456789ULL);
    const auto current_class_id = FF(0xdeadbeefULL);
    const auto original_class_id = FF(0xcafebabeULL);
    const auto init_hash = FF(0x11111111ULL);
    const auto nullifier_key_x = FF(0x100);
    const auto nullifier_key_y = FF(0x101);
    const auto incoming_viewing_key_x = FF(0x200);
    const auto incoming_viewing_key_y = FF(0x201);
    const auto outgoing_viewing_key_x = FF(0x300);
    const auto outgoing_viewing_key_y = FF(0x301);
    const auto tagging_key_x = FF(0x400);
    const auto tagging_key_y = FF(0x401);

    // Test complete valid trace with all constraints
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        { { C::contract_instance_retrieval_sel, 1 },
          { C::contract_instance_retrieval_address, contract_address },
          { C::contract_instance_retrieval_exists, exists ? 1 : 0 },
          { C::contract_instance_retrieval_salt, salt },
          { C::contract_instance_retrieval_deployer_addr, deployer_addr },
          { C::contract_instance_retrieval_current_class_id, current_class_id },
          { C::contract_instance_retrieval_original_class_id, original_class_id },
          { C::contract_instance_retrieval_init_hash, init_hash },
          { C::contract_instance_retrieval_timestamp, timestamp },
          { C::contract_instance_retrieval_public_data_tree_root, public_data_tree_root },
          { C::contract_instance_retrieval_nullifier_tree_root, nullifier_tree_root },
          { C::contract_instance_retrieval_nullifier_key_x, nullifier_key_x },
          { C::contract_instance_retrieval_nullifier_key_y, nullifier_key_y },
          { C::contract_instance_retrieval_incoming_viewing_key_x, incoming_viewing_key_x },
          { C::contract_instance_retrieval_incoming_viewing_key_y, incoming_viewing_key_y },
          { C::contract_instance_retrieval_outgoing_viewing_key_x, outgoing_viewing_key_x },
          { C::contract_instance_retrieval_outgoing_viewing_key_y, outgoing_viewing_key_y },
          { C::contract_instance_retrieval_tagging_key_x, tagging_key_x },
          { C::contract_instance_retrieval_tagging_key_y, tagging_key_y },
          { C::contract_instance_retrieval_deployer_protocol_contract_address, deployer_contract_address } },
    });

    check_relation<contract_instance_retrieval>(trace);
}

TEST(ContractInstanceRetrievalConstrainingTest, MultipleInstancesTrace)
{
    // Test constants
    const auto num_instances = 3;
    const auto base_address = 0x1000;
    const auto base_nullifier_tree_root = 0x2000;
    const auto base_public_data_tree_root = 0x3000;
    const auto base_timestamp = 1000;
    const auto base_salt = 100;
    const auto deployer_contract_address = FF(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS);

    // Test multiple contract instances in sequence
    std::vector<std::vector<std::pair<C, FF>>> trace_data;

    // First row
    trace_data.push_back({ { C::precomputed_first_row, 1 } });

    // Create multiple instance rows
    for (uint32_t i = 0; i < num_instances; i++) {
        auto contract_instance = create_test_contract_instance(base_salt + i);

        trace_data.push_back({
            { C::contract_instance_retrieval_sel, 1 },
            { C::contract_instance_retrieval_address, FF(base_address + i) },
            { C::contract_instance_retrieval_exists, (i % 2 == 0) ? 1 : 0 }, // Alternate exists
            { C::contract_instance_retrieval_salt, contract_instance.salt },
            { C::contract_instance_retrieval_deployer_addr, contract_instance.deployer_addr },
            { C::contract_instance_retrieval_current_class_id, contract_instance.current_class_id },
            { C::contract_instance_retrieval_original_class_id, contract_instance.original_class_id },
            { C::contract_instance_retrieval_init_hash, contract_instance.initialisation_hash },
            { C::contract_instance_retrieval_timestamp, base_timestamp + i },
            { C::contract_instance_retrieval_public_data_tree_root, FF(base_public_data_tree_root + i) },
            { C::contract_instance_retrieval_nullifier_tree_root, FF(base_nullifier_tree_root + i) },
            { C::contract_instance_retrieval_nullifier_key_x, contract_instance.public_keys.nullifier_key.x },
            { C::contract_instance_retrieval_nullifier_key_y, contract_instance.public_keys.nullifier_key.y },
            { C::contract_instance_retrieval_incoming_viewing_key_x,
              contract_instance.public_keys.incoming_viewing_key.x },
            { C::contract_instance_retrieval_incoming_viewing_key_y,
              contract_instance.public_keys.incoming_viewing_key.y },
            { C::contract_instance_retrieval_outgoing_viewing_key_x,
              contract_instance.public_keys.outgoing_viewing_key.x },
            { C::contract_instance_retrieval_outgoing_viewing_key_y,
              contract_instance.public_keys.outgoing_viewing_key.y },
            { C::contract_instance_retrieval_tagging_key_x, contract_instance.public_keys.tagging_key.x },
            { C::contract_instance_retrieval_tagging_key_y, contract_instance.public_keys.tagging_key.y },
            { C::contract_instance_retrieval_deployer_protocol_contract_address, deployer_contract_address },
        });
    }

    TestTraceContainer trace(trace_data);
    check_relation<contract_instance_retrieval>(trace);
}

TEST(ContractInstanceRetrievalConstrainingTest, NonExistentInstanceTrace)
{
    // Test constants
    const auto contract_address = FF(0x99999999);
    const auto nullifier_tree_root = FF(0xffffff);
    const auto public_data_tree_root = FF(0xeeeeee);
    const auto timestamp = 99999;
    const auto deployer_contract_address = FF(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS);
    const auto exists = false;
    const auto zero_value = FF(0);

    // Test trace for non-existent contract instance
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        { { C::contract_instance_retrieval_sel, 1 },
          { C::contract_instance_retrieval_address, contract_address },
          { C::contract_instance_retrieval_exists, exists ? 1 : 0 },
          { C::contract_instance_retrieval_salt, zero_value },
          { C::contract_instance_retrieval_deployer_addr, zero_value },
          { C::contract_instance_retrieval_current_class_id, zero_value },
          { C::contract_instance_retrieval_original_class_id, zero_value },
          { C::contract_instance_retrieval_init_hash, zero_value },
          { C::contract_instance_retrieval_timestamp, timestamp },
          { C::contract_instance_retrieval_public_data_tree_root, public_data_tree_root },
          { C::contract_instance_retrieval_nullifier_tree_root, nullifier_tree_root },
          { C::contract_instance_retrieval_nullifier_key_x, zero_value },
          { C::contract_instance_retrieval_nullifier_key_y, zero_value },
          { C::contract_instance_retrieval_incoming_viewing_key_x, zero_value },
          { C::contract_instance_retrieval_incoming_viewing_key_y, zero_value },
          { C::contract_instance_retrieval_outgoing_viewing_key_x, zero_value },
          { C::contract_instance_retrieval_outgoing_viewing_key_y, zero_value },
          { C::contract_instance_retrieval_tagging_key_x, zero_value },
          { C::contract_instance_retrieval_tagging_key_y, zero_value },
          { C::contract_instance_retrieval_deployer_protocol_contract_address, deployer_contract_address } },
    });

    check_relation<contract_instance_retrieval>(trace);
}

TEST(ContractInstanceRetrievalConstrainingTest, MaximumFieldValuesTrace)
{
    // Test constants
    const auto max_field = FF(-1); // Maximum field value
    const auto max_timestamp = UINT64_MAX;
    const auto deployer_contract_address = FF(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS);

    // Test trace with maximum field values
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        { { C::contract_instance_retrieval_sel, 1 },
          { C::contract_instance_retrieval_address, max_field },
          { C::contract_instance_retrieval_exists, 1 },
          { C::contract_instance_retrieval_salt, max_field },
          { C::contract_instance_retrieval_deployer_addr, max_field },
          { C::contract_instance_retrieval_current_class_id, max_field },
          { C::contract_instance_retrieval_original_class_id, max_field },
          { C::contract_instance_retrieval_init_hash, max_field },
          { C::contract_instance_retrieval_timestamp, max_timestamp },
          { C::contract_instance_retrieval_public_data_tree_root, max_field },
          { C::contract_instance_retrieval_nullifier_tree_root, max_field },
          { C::contract_instance_retrieval_nullifier_key_x, max_field },
          { C::contract_instance_retrieval_nullifier_key_y, max_field },
          { C::contract_instance_retrieval_incoming_viewing_key_x, max_field },
          { C::contract_instance_retrieval_incoming_viewing_key_y, max_field },
          { C::contract_instance_retrieval_outgoing_viewing_key_x, max_field },
          { C::contract_instance_retrieval_outgoing_viewing_key_y, max_field },
          { C::contract_instance_retrieval_tagging_key_x, max_field },
          { C::contract_instance_retrieval_tagging_key_y, max_field },
          { C::contract_instance_retrieval_deployer_protocol_contract_address, deployer_contract_address } },
    });

    check_relation<contract_instance_retrieval>(trace);
}

// Integration-style tests using tracegen components
TEST(ContractInstanceRetrievalConstrainingTest, IntegrationTracegenValidInstance)
{
    // Test constants
    const auto contract_address = FF(0x1234567890abcdefULL);
    const auto nullifier_tree_root = FF(0xaabbccdd);
    const auto public_data_tree_root = FF(0xeeff1122);
    const auto timestamp = 12345;
    const auto deployment_nullifier = FF(0x7777);
    const auto deployer_protocol_contract_address = FF(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS);

    // Use real tracegen to generate a valid trace
    EventEmitter<ContractInstanceRetrievalEvent> emitter;
    auto contract_instance = create_test_contract_instance();

    ContractInstanceRetrievalEvent event = { .address = contract_address,
                                             .contract_instance = contract_instance,
                                             .nullifier_tree_root = nullifier_tree_root,
                                             .public_data_tree_root = public_data_tree_root,
                                             .timestamp = timestamp,
                                             .deployment_nullifier = deployment_nullifier,
                                             .nullifier_exists = true,
                                             .deployer_protocol_contract_address = deployer_protocol_contract_address,
                                             .error = false };

    emitter.emit(std::move(event));
    auto events = emitter.dump_events();

    TestTraceContainer trace;
    ContractInstanceRetrievalTraceBuilder builder;
    builder.process(events, trace);

    // Add precomputed table entries
    PrecomputedTraceBuilder precomputed_builder;
    precomputed_builder.process_misc(trace, trace.get_num_rows());
    precomputed_builder.process_get_contract_instance_table(trace);
    precomputed_builder.process_sel_range_8(trace);

    // Manually populate destination tables for lookup interactions
    auto contract_instance_data = create_test_contract_instance();

    // For deployment nullifier read lookup
    std::vector<std::pair<C, FF>> nullifier_data = { { C::nullifier_check_sel, 1 },
                                                     { C::nullifier_check_exists, 1 },
                                                     { C::nullifier_check_nullifier, contract_address },
                                                     { C::nullifier_check_root, nullifier_tree_root },
                                                     { C::nullifier_check_address, deployer_protocol_contract_address },
                                                     { C::nullifier_check_should_silo, 1 } };
    trace.set(1, std::span(nullifier_data));

    // For address derivation lookup
    std::vector<std::pair<C, FF>> address_derivation_data = {
        { C::address_derivation_sel, 1 },
        { C::address_derivation_address, contract_address },
        { C::address_derivation_salt, contract_instance_data.salt },
        { C::address_derivation_deployer_addr, contract_instance_data.deployer_addr },
        { C::address_derivation_class_id, contract_instance_data.original_class_id },
        { C::address_derivation_init_hash, contract_instance_data.initialisation_hash },
        { C::address_derivation_nullifier_key_x, contract_instance_data.public_keys.nullifier_key.x },
        { C::address_derivation_nullifier_key_y, contract_instance_data.public_keys.nullifier_key.y },
        { C::address_derivation_incoming_viewing_key_x, contract_instance_data.public_keys.incoming_viewing_key.x },
        { C::address_derivation_incoming_viewing_key_y, contract_instance_data.public_keys.incoming_viewing_key.y },
        { C::address_derivation_outgoing_viewing_key_x, contract_instance_data.public_keys.outgoing_viewing_key.x },
        { C::address_derivation_outgoing_viewing_key_y, contract_instance_data.public_keys.outgoing_viewing_key.y },
        { C::address_derivation_tagging_key_x, contract_instance_data.public_keys.tagging_key.x },
        { C::address_derivation_tagging_key_y, contract_instance_data.public_keys.tagging_key.y }
    };
    trace.set(1, std::span(address_derivation_data));

    // For update check lookup
    std::vector<std::pair<C, FF>> update_check_data = {
        { C::update_check_sel, 1 },
        { C::update_check_address, contract_address },
        { C::update_check_current_class_id, contract_instance_data.current_class_id },
        { C::update_check_original_class_id, contract_instance_data.original_class_id },
        { C::update_check_public_data_tree_root, public_data_tree_root },
        { C::update_check_timestamp, timestamp }
    };
    trace.set(1, std::span(update_check_data));

    check_relation<contract_instance_retrieval>(trace);

    // Test lookup interactions
    check_interaction<ContractInstanceRetrievalTraceBuilder,
                      lookup_contract_instance_retrieval_deployment_nullifier_read_settings>(trace);
    check_interaction<ContractInstanceRetrievalTraceBuilder,
                      lookup_contract_instance_retrieval_address_derivation_settings>(trace);
    check_interaction<ContractInstanceRetrievalTraceBuilder, lookup_contract_instance_retrieval_update_check_settings>(
        trace);
}

TEST(ContractInstanceRetrievalConstrainingTest, IntegrationTracegenNonExistentInstance)
{
    // Test constants
    const auto contract_address = FF(0x999999999ULL);
    const auto nullifier_tree_root = FF(0xffffff);
    const auto public_data_tree_root = FF(0xeeeeee);
    const auto timestamp = 99999;
    const auto deployment_nullifier = FF(0x8888);
    const auto deployer_protocol_contract_address = FF(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS);

    // Use real tracegen to generate a valid trace for non-existent instance
    EventEmitter<ContractInstanceRetrievalEvent> emitter;
    auto contract_instance = create_test_contract_instance();

    ContractInstanceRetrievalEvent event = { .address = contract_address,
                                             .contract_instance = contract_instance,
                                             .nullifier_tree_root = nullifier_tree_root,
                                             .public_data_tree_root = public_data_tree_root,
                                             .timestamp = timestamp,
                                             .deployment_nullifier = deployment_nullifier,
                                             .nullifier_exists = false, // Non-existent
                                             .deployer_protocol_contract_address = deployer_protocol_contract_address,
                                             .error = false };

    emitter.emit(std::move(event));
    auto events = emitter.dump_events();

    TestTraceContainer trace;
    ContractInstanceRetrievalTraceBuilder builder;
    builder.process(events, trace);

    // Add precomputed table entries
    PrecomputedTraceBuilder precomputed_builder;
    precomputed_builder.process_misc(trace, trace.get_num_rows());
    precomputed_builder.process_get_contract_instance_table(trace);
    precomputed_builder.process_sel_range_8(trace);

    // Manually populate destination tables for lookup interactions
    auto contract_instance_data = create_test_contract_instance();

    // For deployment nullifier read lookup
    std::vector<std::pair<C, FF>> nullifier_data = { { C::nullifier_check_sel, 1 },
                                                     { C::nullifier_check_exists, 0 }, // Non-existent
                                                     { C::nullifier_check_nullifier, contract_address },
                                                     { C::nullifier_check_root, nullifier_tree_root },
                                                     { C::nullifier_check_address, deployer_protocol_contract_address },
                                                     { C::nullifier_check_should_silo, 1 } };
    trace.set(1, std::span(nullifier_data));

    // For address derivation lookup (only populated when nullifier exists)
    std::vector<std::pair<C, FF>> address_derivation_data = {
        { C::address_derivation_sel, 0 }, // Not selected since nullifier doesn't exist
        { C::address_derivation_address, contract_address },
        { C::address_derivation_salt, contract_instance_data.salt },
        { C::address_derivation_deployer_addr, contract_instance_data.deployer_addr },
        { C::address_derivation_class_id, contract_instance_data.original_class_id },
        { C::address_derivation_init_hash, contract_instance_data.initialisation_hash },
        { C::address_derivation_nullifier_key_x, contract_instance_data.public_keys.nullifier_key.x },
        { C::address_derivation_nullifier_key_y, contract_instance_data.public_keys.nullifier_key.y },
        { C::address_derivation_incoming_viewing_key_x, contract_instance_data.public_keys.incoming_viewing_key.x },
        { C::address_derivation_incoming_viewing_key_y, contract_instance_data.public_keys.incoming_viewing_key.y },
        { C::address_derivation_outgoing_viewing_key_x, contract_instance_data.public_keys.outgoing_viewing_key.x },
        { C::address_derivation_outgoing_viewing_key_y, contract_instance_data.public_keys.outgoing_viewing_key.y },
        { C::address_derivation_tagging_key_x, contract_instance_data.public_keys.tagging_key.x },
        { C::address_derivation_tagging_key_y, contract_instance_data.public_keys.tagging_key.y }
    };
    trace.set(1, std::span(address_derivation_data));

    // For update check lookup (only populated when nullifier exists)
    std::vector<std::pair<C, FF>> update_check_data = {
        { C::update_check_sel, 0 }, // Not selected since nullifier doesn't exist
        { C::update_check_address, contract_address },
        { C::update_check_current_class_id, contract_instance_data.current_class_id },
        { C::update_check_original_class_id, contract_instance_data.original_class_id },
        { C::update_check_public_data_tree_root, public_data_tree_root },
        { C::update_check_timestamp, timestamp }
    };
    trace.set(1, std::span(update_check_data));

    check_relation<contract_instance_retrieval>(trace);

    // Test lookup interactions
    check_interaction<ContractInstanceRetrievalTraceBuilder,
                      lookup_contract_instance_retrieval_deployment_nullifier_read_settings>(trace);
    check_interaction<ContractInstanceRetrievalTraceBuilder,
                      lookup_contract_instance_retrieval_address_derivation_settings>(trace);
    check_interaction<ContractInstanceRetrievalTraceBuilder, lookup_contract_instance_retrieval_update_check_settings>(
        trace);
}

TEST(ContractInstanceRetrievalConstrainingTest, IntegrationTracegenMultipleInstances)
{
    // Test constants
    const auto num_instances = 3;
    const auto base_address = 0x1000;
    const auto base_nullifier_tree_root = 0x2000;
    const auto base_public_data_tree_root = 0x3000;
    const auto base_timestamp = 1000;
    const auto base_salt = 100;
    const auto deployer_protocol_contract_address = FF(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS);

    // Use real tracegen to generate multiple instances
    EventEmitter<ContractInstanceRetrievalEvent> emitter;

    for (uint32_t i = 0; i < num_instances; i++) {
        auto contract_instance = create_test_contract_instance(base_salt + i);

        ContractInstanceRetrievalEvent event = { .address = FF(base_address + i),
                                                 .contract_instance = contract_instance,
                                                 .nullifier_tree_root = FF(base_nullifier_tree_root + i),
                                                 .public_data_tree_root = FF(base_public_data_tree_root + i),
                                                 .timestamp = base_timestamp + i,
                                                 .deployment_nullifier = FF(base_address + i),
                                                 .nullifier_exists = (i % 2 == 0), // Alternate exists
                                                 .deployer_protocol_contract_address =
                                                     deployer_protocol_contract_address,
                                                 .error = false };

        emitter.emit(std::move(event));
    }

    auto events = emitter.dump_events();

    TestTraceContainer trace;
    ContractInstanceRetrievalTraceBuilder builder;
    builder.process(events, trace);

    // Add precomputed table entries
    PrecomputedTraceBuilder precomputed_builder;
    precomputed_builder.process_misc(trace, trace.get_num_rows());
    precomputed_builder.process_get_contract_instance_table(trace);
    precomputed_builder.process_sel_range_8(trace);

    // Manually populate destination tables for lookup interactions
    for (uint32_t i = 0; i < num_instances; i++) {
        auto contract_instance_data = create_test_contract_instance(base_salt + i);
        uint32_t row = i + 1; // Skip row 0 (skippable gadget)

        // For deployment nullifier read lookup
        std::vector<std::pair<C, FF>> nullifier_data = {
            { C::nullifier_check_sel, 1 },
            { C::nullifier_check_exists, (i % 2 == 0) ? 1 : 0 }, // Alternate exists
            { C::nullifier_check_nullifier, FF(base_address + i) },
            { C::nullifier_check_root, FF(base_nullifier_tree_root + i) },
            { C::nullifier_check_address, deployer_protocol_contract_address },
            { C::nullifier_check_should_silo, 1 }
        };
        trace.set(row, std::span(nullifier_data));

        // For address derivation lookup (only when nullifier exists)
        std::vector<std::pair<C, FF>> address_derivation_data = {
            { C::address_derivation_sel, (i % 2 == 0) ? 1 : 0 }, // Only when exists
            { C::address_derivation_address, FF(base_address + i) },
            { C::address_derivation_salt, contract_instance_data.salt },
            { C::address_derivation_deployer_addr, contract_instance_data.deployer_addr },
            { C::address_derivation_class_id, contract_instance_data.original_class_id },
            { C::address_derivation_init_hash, contract_instance_data.initialisation_hash },
            { C::address_derivation_nullifier_key_x, contract_instance_data.public_keys.nullifier_key.x },
            { C::address_derivation_nullifier_key_y, contract_instance_data.public_keys.nullifier_key.y },
            { C::address_derivation_incoming_viewing_key_x, contract_instance_data.public_keys.incoming_viewing_key.x },
            { C::address_derivation_incoming_viewing_key_y, contract_instance_data.public_keys.incoming_viewing_key.y },
            { C::address_derivation_outgoing_viewing_key_x, contract_instance_data.public_keys.outgoing_viewing_key.x },
            { C::address_derivation_outgoing_viewing_key_y, contract_instance_data.public_keys.outgoing_viewing_key.y },
            { C::address_derivation_tagging_key_x, contract_instance_data.public_keys.tagging_key.x },
            { C::address_derivation_tagging_key_y, contract_instance_data.public_keys.tagging_key.y }
        };
        trace.set(row, std::span(address_derivation_data));

        // For update check lookup (only when nullifier exists)
        std::vector<std::pair<C, FF>> update_check_data = {
            { C::update_check_sel, (i % 2 == 0) ? 1 : 0 }, // Only when exists
            { C::update_check_address, FF(base_address + i) },
            { C::update_check_current_class_id, contract_instance_data.current_class_id },
            { C::update_check_original_class_id, contract_instance_data.original_class_id },
            { C::update_check_public_data_tree_root, FF(base_public_data_tree_root + i) },
            { C::update_check_timestamp, base_timestamp + i }
        };
        trace.set(row, std::span(update_check_data));
    }

    check_relation<contract_instance_retrieval>(trace);

    // Test lookup interactions
    check_interaction<ContractInstanceRetrievalTraceBuilder,
                      lookup_contract_instance_retrieval_deployment_nullifier_read_settings>(trace);
    check_interaction<ContractInstanceRetrievalTraceBuilder,
                      lookup_contract_instance_retrieval_address_derivation_settings>(trace);
    check_interaction<ContractInstanceRetrievalTraceBuilder, lookup_contract_instance_retrieval_update_check_settings>(
        trace);
}

// Negative tests
TEST(ContractInstanceRetrievalConstrainingTest, NegativeInvalidSelectorBinary)
{
    // Test constants
    const auto invalid_selector = FF(2); // Invalid selector value

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        { { C::contract_instance_retrieval_sel, invalid_selector } },
    });

    EXPECT_THROW_WITH_MESSAGE(check_relation<contract_instance_retrieval>(trace, static_cast<size_t>(0)), "0");
}

TEST(ContractInstanceRetrievalConstrainingTest, NegativeInvalidTraceContinuity)
{
    // Test invalid trace continuity
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        { { C::contract_instance_retrieval_sel, 0 } }, // Inactive row
        { { C::contract_instance_retrieval_sel, 1 } }, // Active row after inactive - invalid
    });

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<contract_instance_retrieval>(trace, contract_instance_retrieval::SR_TRACE_CONTINUITY),
        "TRACE_CONTINUITY");
}

TEST(ContractInstanceRetrievalConstrainingTest, NegativeWrongDeployerAddress)
{
    // Test constants
    const auto wrong_deployer_address = FF(0x999);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        { { C::contract_instance_retrieval_sel, 1 },
          { C::contract_instance_retrieval_deployer_protocol_contract_address, wrong_deployer_address } },
    });

    EXPECT_THROW_WITH_MESSAGE(check_relation<contract_instance_retrieval>(trace, static_cast<size_t>(2)), "2");
}

} // namespace
} // namespace bb::avm2::constraining
