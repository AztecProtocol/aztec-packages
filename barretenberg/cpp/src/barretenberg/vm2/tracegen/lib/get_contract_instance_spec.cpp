#include "barretenberg/vm2/tracegen/lib/get_contract_instance_spec.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::tracegen {

/**
 * @brief Look up the precomputed table entry for a given member enum value.
 *
 * Returns boolean selectors indicating whether the enum is valid and which member it selects.
 * See the ASCII table in get_contract_instance.pil for the full mapping.
 *
 * @param member_enum The member enum value (0=deployer, 1=class_id, 2=init_hash, 3=immutables_hash, 4+=invalid).
 * @return A Table struct with is_valid_member_enum and the per-member selector flags.
 */
GetContractInstanceSpec::Table GetContractInstanceSpec::get_table(uint8_t member_enum)
{
    // default for invalid enum
    Table table = {
        .is_valid_member_enum = false,
        .is_deployer = false,
        .is_class_id = false,
        .is_init_hash = false,
        .is_immutables_hash = false,
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
    case ContractInstanceMember::IMMUTABLES_HASH:
        table.is_valid_member_enum = true;
        table.is_immutables_hash = true;
        return table;
    default:
        // Invalid enum - return defaults (all false)
        return table;
    }
}

} // namespace bb::avm2::tracegen
