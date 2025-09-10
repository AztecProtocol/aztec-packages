// GENERATED FILE - DO NOT EDIT, RUN yarn generate in yarn-project/protocol-contracts
#pragma once

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"

#include <unordered_map>

namespace bb::avm2 {

using CanonicalAddress = AztecAddress;
using DerivedAddress = AztecAddress;

extern const std::unordered_map<CanonicalAddress, DerivedAddress> derived_addresses;

} // namespace bb::avm2
