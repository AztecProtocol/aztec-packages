#include "vm2_contracts/noir_abi.hpp"

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"

namespace bb::avm2::contracts {

namespace {

using Poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

void encode_value(const AbiType& type, const AbiValue& value, std::vector<FF>& out)
{
    switch (type.kind) {
    case AbiType::Kind::Field:
    case AbiType::Kind::Boolean:
    case AbiType::Kind::Integer:
        out.push_back(value.scalar());
        break;
    case AbiType::Kind::Array: {
        const auto& items = value.items();
        BB_ASSERT_EQ(items.size(), static_cast<size_t>(type.length), "ABI array length mismatch");
        for (const auto& item : items) {
            encode_value(*type.element, item, out);
        }
        break;
    }
    case AbiType::Kind::Struct: {
        // AztecAddress / ContractClassId / other single-field wrapper structs are conventionally
        // passed as a bare scalar; encode it directly into the wrapped field.
        if (type.fields.size() == 1 && value.is_scalar()) {
            encode_value(type.fields[0].second, value, out);
            break;
        }
        const auto& items = value.items();
        BB_ASSERT_EQ(items.size(), type.fields.size(), "ABI struct field count mismatch");
        for (size_t i = 0; i < type.fields.size(); ++i) {
            encode_value(type.fields[i].second, items[i], out);
        }
        break;
    }
    case AbiType::Kind::String: {
        const std::string& str = value.as_string();
        BB_ASSERT(str.size() <= static_cast<size_t>(type.length), "ABI string longer than its declared length");
        for (size_t i = 0; i < type.length; ++i) {
            out.push_back(i < str.size() ? FF(static_cast<uint8_t>(str[i])) : FF(0));
        }
        break;
    }
    }
}

} // namespace

AbiValue AbiValue::fields(std::span<const FF> items)
{
    std::vector<AbiValue> values;
    values.reserve(items.size());
    for (const auto& item : items) {
        values.emplace_back(item);
    }
    return AbiValue(std::move(values));
}

AbiValue AbiValue::string(std::string value)
{
    AbiValue v(FF(0));
    v.value_ = std::move(value);
    return v;
}

std::string type_signature(const AbiType& type)
{
    switch (type.kind) {
    case AbiType::Kind::Field:
        return "Field";
    case AbiType::Kind::Boolean:
        return "bool";
    case AbiType::Kind::Integer:
        return (type.is_signed ? "i" : "u") + std::to_string(type.width);
    case AbiType::Kind::String:
        return "str<" + std::to_string(type.length) + ">";
    case AbiType::Kind::Array:
        return "[" + type_signature(*type.element) + ";" + std::to_string(type.length) + "]";
    case AbiType::Kind::Struct: {
        std::string sig = "(";
        for (size_t i = 0; i < type.fields.size(); ++i) {
            if (i != 0) {
                sig += ",";
            }
            sig += type_signature(type.fields[i].second);
        }
        sig += ")";
        return sig;
    }
    }
    throw_or_abort("unhandled ABI type kind in type_signature");
}

FF poseidon2_hash_bytes(std::span<const uint8_t> bytes)
{
    std::vector<FF> input_fields;
    for (size_t i = 0; i < bytes.size(); i += 31) {
        // Each 31-byte chunk is interpreted little-endian (matching `poseidon2HashBytes`).
        uint256_t acc = 0;
        for (size_t j = 0; j < 31 && i + j < bytes.size(); ++j) {
            acc += uint256_t(bytes[i + j]) << (8 * j);
        }
        input_fields.push_back(FF(acc));
    }
    return Poseidon2::hash(input_fields);
}

FF compute_function_selector(const std::string& name, const std::vector<AbiParameter>& parameters)
{
    std::string signature = name + "(";
    for (size_t i = 0; i < parameters.size(); ++i) {
        if (i != 0) {
            signature += ",";
        }
        signature += type_signature(parameters[i].type);
    }
    signature += ")";

    const FF hash = poseidon2_hash_bytes(
        std::span<const uint8_t>(reinterpret_cast<const uint8_t*>(signature.data()), signature.size()));
    // The selector is the last 4 big-endian bytes of the hash, i.e. its low 32 bits.
    const uint32_t selector = static_cast<uint32_t>(static_cast<uint256_t>(hash).data[0]);
    return FF(selector);
}

std::vector<FF> encode_arguments(const std::vector<AbiParameter>& parameters, const std::vector<AbiValue>& args)
{
    BB_ASSERT_EQ(args.size(), parameters.size(), "argument count does not match ABI parameter count");
    std::vector<FF> out;
    for (size_t i = 0; i < parameters.size(); ++i) {
        encode_value(parameters[i].type, args[i], out);
    }
    return out;
}

FF compute_args_hash(std::span<const FF> encoded_args)
{
    if (encoded_args.empty()) {
        return FF(0);
    }
    // DomainSeparator::FUNCTION_ARGS.
    std::vector<FF> input = { FF(3576554347ULL) };
    input.insert(input.end(), encoded_args.begin(), encoded_args.end());
    return Poseidon2::hash(input);
}

FF compute_initialization_hash(const FF& constructor_selector, std::span<const FF> encoded_args)
{
    // DomainSeparator::INITIALIZER.
    return Poseidon2::hash({ FF(385396519ULL), constructor_selector, compute_args_hash(encoded_args) });
}

} // namespace bb::avm2::contracts
