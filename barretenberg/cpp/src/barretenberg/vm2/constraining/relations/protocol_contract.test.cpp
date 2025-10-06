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
#include "barretenberg/vm2/generated/relations/lookups_protocol_contract.hpp"
#include "barretenberg/vm2/generated/relations/protocol_contract.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/protocol_contract_event.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/protocol_contract_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using simulation::EventEmitter;
using simulation::GetProtocolContractDerivedAddressEvent;
using tracegen::PrecomputedTraceBuilder;
using tracegen::ProtocolContractTraceBuilder;
using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using protocol_contract = bb::avm2::protocol_contract<FF>;

TEST(ProtocolContractConstrainingTest, EmptyRow)
{
    check_relation<protocol_contract>(testing::empty_trace());
}

TEST(ProtocolContractConstrainingTest, CompleteValidTrace)
{
    // Test constants
    const auto canonical_address = AztecAddress(0xabcdef123456ULL);
    const auto derived_address = AztecAddress(0xfedcba654321ULL);
    const auto next_derived_address = AztecAddress(0x111222333444ULL);
    const auto leaf_hash = FF(0x9999888877776666ULL);
    const auto protocol_contract_tree_root = FF(0xdeadbeefcafebabeULL);

    // Test complete valid trace with all constraints
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        { { C::protocol_contract_sel, 1 },
          { C::protocol_contract_canonical_address, canonical_address },
          { C::protocol_contract_derived_address, derived_address },
          { C::protocol_contract_next_derived_address, next_derived_address },
          { C::protocol_contract_leaf_hash, leaf_hash },
          { C::protocol_contract_pi_index, AVM_PUBLIC_INPUTS_PROTOCOL_CONTRACT_TREE_ROOT },
          { C::protocol_contract_root, protocol_contract_tree_root },
          { C::protocol_contract_tree_depth, PROTOCOL_CONTRACT_TREE_HEIGHT } },
        // Poseidon
        { { C::poseidon2_hash_start, 1 },
          { C::poseidon2_hash_end, 1 },
          { C::poseidon2_hash_input_0, derived_address },
          { C::poseidon2_hash_input_1, next_derived_address },
          { C::poseidon2_hash_input_2, FF(0) }, // precomputed.zero
          { C::poseidon2_hash_output, leaf_hash } },
        // Merkle Check
        { { C::merkle_check_start, 1 },
          { C::merkle_check_read_node, leaf_hash },
          { C::merkle_check_index, canonical_address },
          { C::merkle_check_path_len, PROTOCOL_CONTRACT_TREE_HEIGHT },
          { C::merkle_check_read_root, protocol_contract_tree_root } },
    });

    trace.set(C::public_inputs_cols_0_, AVM_PUBLIC_INPUTS_PROTOCOL_CONTRACT_TREE_ROOT, protocol_contract_tree_root);
    trace.set(C::public_inputs_sel, AVM_PUBLIC_INPUTS_PROTOCOL_CONTRACT_TREE_ROOT, 1);
    trace.set(C::precomputed_clk,
              AVM_PUBLIC_INPUTS_PROTOCOL_CONTRACT_TREE_ROOT,
              AVM_PUBLIC_INPUTS_PROTOCOL_CONTRACT_TREE_ROOT);

    check_relation<protocol_contract>(trace);
    check_all_interactions<ProtocolContractTraceBuilder>(trace);
}

TEST(ProtocolContractConstrainingTest, MultipleProtocolContracts)
{
    // Test constants
    const auto num_contracts = 3;
    const auto base_canonical_address = 0x1000;
    const auto base_derived_address = 0x2000;
    const auto base_next_derived_address = 0x3000;
    const auto base_leaf_hash = 0x4000;
    const auto base_tree_root = 0x5000;

    // Test multiple protocol contracts in sequence
    std::vector<std::vector<std::pair<C, FF>>> trace_data;

    // First row
    trace_data.push_back({ { C::precomputed_first_row, 1 } });

    // Create multiple protocol contract rows
    for (uint32_t i = 0; i < num_contracts; i++) {
        trace_data.push_back({
            { C::protocol_contract_sel, 1 },
            { C::protocol_contract_canonical_address, FF(base_canonical_address + i) },
            { C::protocol_contract_derived_address, FF(base_derived_address + i) },
            { C::protocol_contract_next_derived_address, FF(base_next_derived_address + i) },
            { C::protocol_contract_leaf_hash, FF(base_leaf_hash + i) },
            { C::protocol_contract_pi_index, AVM_PUBLIC_INPUTS_PROTOCOL_CONTRACT_TREE_ROOT },
            { C::protocol_contract_root, FF(base_tree_root + i) },
            { C::protocol_contract_tree_depth, PROTOCOL_CONTRACT_TREE_HEIGHT },
        });
    }

    TestTraceContainer trace(trace_data);
    check_relation<protocol_contract>(trace);
}

TEST(ProtocolContractConstrainingTest, VariedTreeRoots)
{
    // Test with different protocol contract tree roots to ensure proper handling
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        {
            { C::protocol_contract_sel, 1 },
            { C::protocol_contract_canonical_address, 0x100 },
            { C::protocol_contract_derived_address, 0x200 },
            { C::protocol_contract_next_derived_address, 0x300 },
            { C::protocol_contract_leaf_hash, 0x400 },
            { C::protocol_contract_pi_index, AVM_PUBLIC_INPUTS_PROTOCOL_CONTRACT_TREE_ROOT },
            { C::protocol_contract_root, 0xAAAAAAAA },
            { C::protocol_contract_tree_depth, PROTOCOL_CONTRACT_TREE_HEIGHT },
        },
        {
            { C::protocol_contract_sel, 1 },
            { C::protocol_contract_canonical_address, 0x500 },
            { C::protocol_contract_derived_address, 0x600 },
            { C::protocol_contract_next_derived_address, 0x700 },
            { C::protocol_contract_leaf_hash, 0x800 },
            { C::protocol_contract_pi_index, AVM_PUBLIC_INPUTS_PROTOCOL_CONTRACT_TREE_ROOT },
            { C::protocol_contract_root, 0xBBBBBBBB },
            { C::protocol_contract_tree_depth, PROTOCOL_CONTRACT_TREE_HEIGHT },
        },
        {
            { C::protocol_contract_sel, 1 },
            { C::protocol_contract_canonical_address, 0x900 },
            { C::protocol_contract_derived_address, 0xA00 },
            { C::protocol_contract_next_derived_address, 0xB00 },
            { C::protocol_contract_leaf_hash, 0xC00 },
            { C::protocol_contract_pi_index, AVM_PUBLIC_INPUTS_PROTOCOL_CONTRACT_TREE_ROOT },
            { C::protocol_contract_root, 0xCCCCCCCC },
            { C::protocol_contract_tree_depth, PROTOCOL_CONTRACT_TREE_HEIGHT },
        },
    });

    check_relation<protocol_contract>(trace);
}

} // namespace
} // namespace bb::avm2::constraining
