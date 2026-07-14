#include "vm2_contracts/noir_abi_json.hpp"

#include <cstdint>
#include <string>
#include <vector>

#include "barretenberg/common/throw_or_abort.hpp"

namespace bb::avm2::contracts {

namespace {

// Parses a JSON scalar (decimal string or unsigned number) into a field. Inputs are assumed to fit in
// 64 bits, which holds for the integer-typed fixture data fed through here (byte arrays / u64 limbs).
FF scalar_from_json(const nlohmann::json& value)
{
    if (value.is_string()) {
        return FF(static_cast<uint64_t>(std::stoull(value.get<std::string>())));
    }
    if (value.is_number_unsigned()) {
        return FF(value.get<uint64_t>());
    }
    if (value.is_boolean()) {
        return value.get<bool>() ? FF(1) : FF(0);
    }
    throw_or_abort("abi_value_from_json: expected a numeric/boolean scalar");
}

} // namespace

AbiValue abi_value_from_json(const AbiType& type, const nlohmann::json& value)
{
    switch (type.kind) {
    case AbiType::Kind::Field:
    case AbiType::Kind::Integer:
        return AbiValue(scalar_from_json(value));
    case AbiType::Kind::Boolean:
        return AbiValue::boolean(value.get<bool>());
    case AbiType::Kind::Array: {
        if (!value.is_array() || value.size() != type.length) {
            throw_or_abort("abi_value_from_json: array length mismatch");
        }
        std::vector<AbiValue> items;
        items.reserve(value.size());
        for (const auto& element : value) {
            items.push_back(abi_value_from_json(*type.element, element));
        }
        return AbiValue::array(std::move(items));
    }
    case AbiType::Kind::Struct: {
        if (!value.is_object()) {
            throw_or_abort("abi_value_from_json: expected object for struct");
        }
        std::vector<AbiValue> items;
        items.reserve(type.fields.size());
        for (const auto& [field_name, field_type] : type.fields) {
            if (!value.contains(field_name)) {
                throw_or_abort("abi_value_from_json: missing struct field " + field_name);
            }
            items.push_back(abi_value_from_json(field_type, value.at(field_name)));
        }
        return AbiValue::array(std::move(items));
    }
    case AbiType::Kind::String:
        return AbiValue::string(value.get<std::string>());
    }
    throw_or_abort("abi_value_from_json: unhandled ABI kind");
}

} // namespace bb::avm2::contracts
