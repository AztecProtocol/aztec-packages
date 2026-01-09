#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::fuzzer {

/**
 * Real protocol contracts list matching yarn-project/protocol-contracts/src/protocol_contract_data.ts
 * These are the derived addresses computed from the protocol contract instances.
 *
 * Generated values (keep in sync with protocol_contract_data.ts):
 * - AuthRegistry:              0x01826d76ce89e55a92c5470eb557bf162dd7d767ae4ee175005a7fa4e99fb6e1
 * - ContractInstanceRegistry:  0x01fe9f10f75d1144d4f639cd1343f21dd6704d625862c656289d8d469260c8ec
 * - ContractClassRegistry:     0x0644acbac1f08ca31c11c7ba5a499d5712df7328bef937abc2218939480888fd
 * - MultiCallEntrypoint:       0x1942206ea40e346bc3d1199bd18d3fb195b9e55783555257ecec39cff517f07c
 * - FeeJuice:                  0x1372bed10ea17c9fa328aee7dde99c400acb65317dba45c38e27038ac01753a9
 * - Router:                    0x12b0c529d7c93c7bc94d3e08cf26c39c810762a91d2bbce2fc294706fe86028e
 * - Slots 7-11:                0x0 (reserved for future protocol contracts)
 */
inline ProtocolContracts get_protocol_contracts_list()
{
    return ProtocolContracts{
        .derived_addresses = {
            // Index 0: AuthRegistry (canonical address 1)
            AztecAddress(uint256_t("0x01826d76ce89e55a92c5470eb557bf162dd7d767ae4ee175005a7fa4e99fb6e1")),
            // Index 1: ContractInstanceRegistry (canonical address 2)
            AztecAddress(uint256_t("0x01fe9f10f75d1144d4f639cd1343f21dd6704d625862c656289d8d469260c8ec")),
            // Index 2: ContractClassRegistry (canonical address 3)
            AztecAddress(uint256_t("0x0644acbac1f08ca31c11c7ba5a499d5712df7328bef937abc2218939480888fd")),
            // Index 3: MultiCallEntrypoint (canonical address 4)
            AztecAddress(uint256_t("0x1942206ea40e346bc3d1199bd18d3fb195b9e55783555257ecec39cff517f07c")),
            // Index 4: FeeJuice (canonical address 5)
            AztecAddress(uint256_t("0x1372bed10ea17c9fa328aee7dde99c400acb65317dba45c38e27038ac01753a9")),
            // Index 5: Router (canonical address 6)
            AztecAddress(uint256_t("0x12b0c529d7c93c7bc94d3e08cf26c39c810762a91d2bbce2fc294706fe86028e")),
            // Indices 6-10: Reserved slots (canonical addresses 7-11)
            AztecAddress::zero(),
            AztecAddress::zero(),
            AztecAddress::zero(),
            AztecAddress::zero(),
            AztecAddress::zero(),
        },
    };
}

} // namespace bb::avm2::fuzzer
