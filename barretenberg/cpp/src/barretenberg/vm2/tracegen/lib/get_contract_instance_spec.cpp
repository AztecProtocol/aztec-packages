#include "barretenberg/vm2/tracegen/lib/get_contract_instance_spec.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::tracegen {

// See ASCII table in `get_contract_instance.pil` for reference.
GetContractInstanceSpec::Table GetContractInstanceSpec::get_table(uint8_t member_enum)
{
    // default for invalid enum
    Table table = {
        .is_valid_member_enum = false,
        .is_deployer = false,
        .is_class_id = false,
        .is_init_hash = false,
    };

    switch (static_cast<ContractInstanceMember>(member_enum)) {
    case ContractInstanceMember::DEPLOYER:
        table.is_valid_member_enum = true;
        table.is_deployer = true;
        return table;
    case ContractInstanceMember::CLASS_ID:
        table.is_valid_member_enum = true;
        table.is_class_id = true;
        return table;
    case ContractInstanceMember::INIT_HASH:
        table.is_valid_member_enum = true;
        table.is_init_hash = true;
        return table;
    default:
        // Invalid enum - return defaults (all false)
        return table;
    }
}

} // namespace bb::avm2::tracegen
