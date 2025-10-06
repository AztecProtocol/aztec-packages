#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

struct GetProtocolContractDerivedAddressEvent {
    AztecAddress canonical_address = 0;
    AztecAddress derived_address = 0;
    // Need the next derived address and leaf hash because it is an indexed merkle tree
    // todo(ilyas): once we are a regular tree, remove these
    AztecAddress next_derived_address = 0;
    FF leaf_hash = 0;
    FF protocol_contract_tree_root = 0;
};

} // namespace bb::avm2::simulation
