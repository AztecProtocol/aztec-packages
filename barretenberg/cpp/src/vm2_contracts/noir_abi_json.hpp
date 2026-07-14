#pragma once

#include <nlohmann/json.hpp>

#include "vm2_contracts/noir_abi.hpp"

namespace bb::avm2::contracts {

// Recursively builds an AbiValue from a JSON value, driven by an ABI type tree. Used to feed
// fixture data (e.g. the storage-proof account_proof.json) into a contract call:
//   - integer / field: a JSON decimal string or unsigned number (values must fit in 64 bits),
//   - boolean: a JSON bool,
//   - array: a JSON list (length must match the ABI),
//   - struct: a JSON object keyed by field name (fields consumed in ABI declaration order).
AbiValue abi_value_from_json(const AbiType& type, const nlohmann::json& value);

} // namespace bb::avm2::contracts
