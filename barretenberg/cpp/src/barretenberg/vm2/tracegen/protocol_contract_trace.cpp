#include "barretenberg/vm2/tracegen/protocol_contract_trace.hpp"

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/generated/relations/lookups_protocol_contract.hpp"

namespace bb::avm2::tracegen {

void ProtocolContractTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::GetProtocolContractDerivedAddressEvent>::Container& events,
    TraceContainer& trace)
{

    using C = Column;

    uint32_t row = 0;
    for (const auto& event : events) {
        trace.set(row,
                  { { { C::protocol_contract_sel, 1 },
                      { C::protocol_contract_canonical_address, event.canonical_address },
                      { C::protocol_contract_derived_address, event.derived_address },
                      { C::protocol_contract_next_derived_address, event.next_derived_address },
                      { C::protocol_contract_leaf_hash, event.leaf_hash },
                      { C::protocol_contract_root, event.protocol_contract_tree_root },
                      { C::protocol_contract_tree_depth, PROTOCOL_CONTRACT_TREE_HEIGHT } } });

        row++;
    }
}

const InteractionDefinition ProtocolContractTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_protocol_contract_merkle_check_settings, InteractionType::LookupGeneric>()
        .add<lookup_protocol_contract_leaf_hash_settings, InteractionType::LookupGeneric>();

} // namespace bb::avm2::tracegen
