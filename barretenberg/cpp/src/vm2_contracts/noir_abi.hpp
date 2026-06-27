#pragma once

#include <cstdint>
#include <memory>
#include <span>
#include <string>
#include <utility>
#include <variant>
#include <vector>

#include "barretenberg/vm2/common/field.hpp"

// Minimal C++ port of the TypeScript ABI machinery (`@aztec/stdlib/abi`) needed to build calldata
// for AVM public calls from a contract artifact: the function-selector hash and `encodeArguments`.
namespace bb::avm2::contracts {

// A Noir ABI type, parsed from a contract artifact's function ABI. Mirrors the `AbiType` union in
// `yarn-project/stdlib/src/abi/abi.ts`. Only the variants reachable from the ported tests are
// modelled fully; `String` is included for signature completeness.
struct AbiType {
    enum class Kind { Field, Boolean, Integer, String, Array, Struct };

    Kind kind = Kind::Field;
    // Integer.
    bool is_signed = false;
    uint32_t width = 0;
    // Array / String.
    uint32_t length = 0;
    std::shared_ptr<AbiType> element; // Array element type.
    // Struct.
    std::string path;                                    // e.g. "...::AztecAddress".
    std::vector<std::pair<std::string, AbiType>> fields; // (name, type), in declaration order.
};

// A named ABI parameter.
struct AbiParameter {
    std::string name;
    AbiType type;
};

// A dynamically-typed argument value, mirroring the JS values the TS `encodeArguments` accepts.
// It is either a scalar field (covering field / boolean / integer / single-field-struct args such
// as AztecAddress) or an ordered list (covering arrays and general structs).
class AbiValue {
  public:
    AbiValue(FF scalar)
        : value_(scalar)
    {}
    AbiValue(std::vector<AbiValue> items)
        : value_(std::move(items))
    {}

    static AbiValue boolean(bool b) { return AbiValue(b ? FF(1) : FF(0)); }
    static AbiValue integer(uint64_t v) { return AbiValue(FF(v)); }
    static AbiValue array(std::vector<AbiValue> items) { return AbiValue(std::move(items)); }
    // Convenience for the common "array of fields" argument.
    static AbiValue fields(std::span<const FF> items);
    // A `str<N>` argument; encoded as one field per character (zero-padded to the ABI length).
    static AbiValue string(std::string value);

    bool is_scalar() const { return std::holds_alternative<FF>(value_); }
    bool is_string() const { return std::holds_alternative<std::string>(value_); }
    const FF& scalar() const { return std::get<FF>(value_); }
    const std::string& as_string() const { return std::get<std::string>(value_); }
    const std::vector<AbiValue>& items() const { return std::get<std::vector<AbiValue>>(value_); }

  private:
    std::variant<FF, std::string, std::vector<AbiValue>> value_;
};

// The Noir type-signature string for a type, matching `FunctionSignatureDecoder` (no parameter
// names): field->"Field", uN/iN, "bool", "[T;N]", struct->"(t1,t2,...)", "str<N>".
std::string type_signature(const AbiType& type);

// Poseidon2 hash of a byte buffer, matching `poseidon2HashBytes`: 31-byte little-endian chunks
// hashed together.
FF poseidon2_hash_bytes(std::span<const uint8_t> bytes);

// The 4-byte function selector (as a field), matching `FunctionSelector.fromNameAndParameters`:
// the low 32 bits of poseidon2_hash_bytes(signature).
FF compute_function_selector(const std::string& name, const std::vector<AbiParameter>& parameters);

// Flattens arguments into fields per their ABI types, matching `encodeArguments`.
std::vector<FF> encode_arguments(const std::vector<AbiParameter>& parameters, const std::vector<AbiValue>& args);

// Hash of a function's (already-encoded) arguments, matching `computeVarArgsHash` (0 if empty).
FF compute_args_hash(std::span<const FF> encoded_args);

// A contract's initialization hash from its constructor selector and encoded args, matching
// `computeInitializationHash`. Contracts with an initializer recompute and check this on construction.
FF compute_initialization_hash(const FF& constructor_selector, std::span<const FF> encoded_args);

} // namespace bb::avm2::contracts
