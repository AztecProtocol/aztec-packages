/**
 * @file bbapi_aztec.cpp
 * @brief The derivation of a contract class from a contract artifact, and of the genesis nullifiers from the protocol
 *        contracts' artifacts. This file is the specification: other implementations call it.
 *
 * Class id = poseidon2(DOM_SEP__CONTRACT_CLASS_ID, artifact hash, private functions root, public bytecode commitment).
 *
 * - Function type: the `abi_private`, `abi_public` or `abi_utility` custom attribute.
 * - Selector: the last 4 bytes of the poseidon2 hash of the signature `name(T1,T2,...)`, packed 31 bytes per field
 *   little-endian, where the first parameter is dropped when it is the injected `*ContextInputs` struct.
 * - Private functions root: a poseidon2 tree of height FUNCTION_TREE_HEIGHT (zero leaf poseidon2(0, 0), nodes
 *   poseidon2(DOM_SEP__MERKLE_HASH, l, r)) over poseidon2(DOM_SEP__PRIVATE_FUNCTION_LEAF, selector, vk hash), sorted by
 *   selector. The vk hash is the poseidon2 hash of the MegaApp verification key as fields.
 * - Public bytecode commitment: of the `public_dispatch` bytecode (empty without one).
 * - Artifact hash: sha256(1 ‖ private tree root ‖ utility tree root ‖ metadata hash), where every sha256 is reduced
 *   into the field and:
 *   - each function tree is a sha256 tree (nodes sha256(l ‖ r), zero leaf 0) of height ⌈log2 n⌉, root 0 when empty,
 *     over sha256(1 ‖ selector ‖ sha256(canonical([return type]), or of [] without one) ‖ sha256(bytecode)), sorted
 *     by selector. A utility function's return type is `abi.return_type.abi_type`; any other function's is the
 *     `return_type` field of the struct `<contract>::<function>_abi` in `outputs.structs.functions`;
 *   - the metadata hash is sha256(canonical({ name, outputs })), with `outputs.structs.events` and
 *     `outputs.structs.functions` sorted by `path`, descending.
 *   Canonical JSON is compact, with object keys sorted.
 */
#include "barretenberg/bbapi/bbapi_aztec.hpp"
#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/aztec/contract_hashing.hpp"
#include "barretenberg/bbapi/bbapi_handlers.hpp"
#include "barretenberg/bbapi/bbapi_ultra_honk.hpp"
#include "barretenberg/bbapi/bbapi_wire_convert.hpp"
#include "barretenberg/common/base64.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"

#include <algorithm>
#include <map>
// nlohmann/json has sign-conversion warnings that fail with -Werror in WASM builds
#ifdef __clang__
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wsign-conversion"
#endif
#include <nlohmann/json.hpp>
#ifdef __clang__
#pragma clang diagnostic pop
#endif

namespace bb::bbapi {

namespace {

using json = nlohmann::json;
using Poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

constexpr uint8_t ARTIFACT_HASH_VERSION = 1;

enum class FunctionType { PRIVATE, PUBLIC, UTILITY };

struct ArtifactFunction {
    const json* abi;
    FunctionType type;
    uint32_t selector;
};

std::vector<uint8_t> bytes_of(const fr& value)
{
    return to_buffer(value);
}

fr sha256_fr(const std::vector<uint8_t>& preimage)
{
    return fr(from_buffer<uint256_t>(crypto::sha256(preimage), 0) % fr::modulus);
}

fr sha256_fr(const std::string& preimage)
{
    return sha256_fr(std::vector<uint8_t>(preimage.begin(), preimage.end()));
}

std::vector<uint8_t> base64_bytes(const json& value)
{
    auto decoded = base64_decode(value.get<std::string>());
    return { decoded.begin(), decoded.end() };
}

/** @brief The root of a tree of @p height whose first leaves are @p layer and the rest @p zero. */
template <typename HashPair> fr merkle_root(std::vector<fr> layer, size_t height, fr zero, HashPair hash_pair)
{
    if (layer.size() > (size_t(1) << height)) {
        throw_or_abort("merkle_root: too many leaves for the tree height");
    }
    for (size_t level = 0; level < height; level++) {
        if (layer.size() % 2 == 1) {
            layer.push_back(zero);
        }
        std::vector<fr> next;
        for (size_t i = 0; i < layer.size(); i += 2) {
            next.push_back(hash_pair(layer[i], layer[i + 1]));
        }
        layer = std::move(next);
        zero = hash_pair(zero, zero);
    }
    return layer.empty() ? zero : layer[0];
}

FunctionType function_type(const json& fn)
{
    const auto& attributes = fn.at("custom_attributes");
    auto has = [&](const char* attribute) { return std::ranges::find(attributes, attribute) != attributes.end(); };
    if (has("abi_private")) {
        return FunctionType::PRIVATE;
    }
    if (has("abi_public")) {
        return FunctionType::PUBLIC;
    }
    if (has("abi_utility")) {
        return FunctionType::UTILITY;
    }
    throw_or_abort("Invalid function type for contract function " + fn.at("name").get<std::string>());
}

std::string abi_type_signature(const json& type)
{
    const auto kind = type.at("kind").get<std::string>();
    if (kind == "field") {
        return "Field";
    }
    if (kind == "integer") {
        return (type.at("sign") == "signed" ? "i" : "u") + std::to_string(type.at("width").get<uint64_t>());
    }
    if (kind == "boolean") {
        return "bool";
    }
    if (kind == "array") {
        return "[" + abi_type_signature(type.at("type")) + ";" + std::to_string(type.at("length").get<uint64_t>()) +
               "]";
    }
    if (kind == "string") {
        return "str<" + std::to_string(type.at("length").get<uint64_t>()) + ">";
    }
    if (kind == "struct") {
        std::string fields;
        for (const auto& field : type.at("fields")) {
            fields += (fields.empty() ? "" : ",") + abi_type_signature(field.at("type"));
        }
        return "(" + fields + ")";
    }
    throw_or_abort("Unsupported ABI type in a function signature: " + kind);
}

uint32_t function_selector(const json& fn)
{
    const auto& parameters = fn.at("abi").at("parameters");
    auto first = parameters.begin();
    if (first != parameters.end() && (*first).at("type").at("kind") == "struct" &&
        (*first).at("type").at("path").get<std::string>().find("ContextInputs") != std::string::npos) {
        ++first;
    }
    std::string signature = fn.at("name").get<std::string>() + "(";
    for (auto it = first; it != parameters.end(); ++it) {
        signature += (it == first ? "" : ",") + abi_type_signature((*it).at("type"));
    }
    signature += ")";

    std::vector<fr> fields;
    for (size_t i = 0; i < signature.size(); i += 31) {
        uint256_t chunk = 0;
        for (size_t k = 0; k < 31 && i + k < signature.size(); k++) {
            chunk |= uint256_t(static_cast<uint8_t>(signature[i + k])) << (8 * k);
        }
        fields.emplace_back(chunk);
    }
    return static_cast<uint32_t>(uint256_t(Poseidon2::hash(fields)).data[0]);
}

json return_type(const json& artifact, const ArtifactFunction& fn)
{
    if (fn.type == FunctionType::UTILITY) {
        const auto& abi_return = fn.abi->at("abi").value("return_type", json());
        return abi_return.is_null() ? json() : abi_return.at("abi_type");
    }
    const auto path = artifact.at("name").get<std::string>() + "::" + fn.abi->at("name").get<std::string>() + "_abi";
    for (const auto& abi_struct : artifact.at("outputs").at("structs").value("functions", json::array())) {
        if (abi_struct.at("kind") == "struct" && abi_struct.at("path") == path) {
            for (const auto& field : abi_struct.at("fields")) {
                if (field.at("name") == "return_type") {
                    return field.at("type");
                }
            }
        }
    }
    return json();
}

fr artifact_function_tree_root(const json& artifact, const std::vector<ArtifactFunction>& fns, FunctionType type)
{
    std::vector<fr> leaves;
    for (const auto& fn : fns) {
        if (fn.type != type) {
            continue;
        }
        const json returned = return_type(artifact, fn);
        const json return_types = returned.is_null() ? json::array() : json::array({ returned });
        std::vector<uint8_t> preimage = { ARTIFACT_HASH_VERSION };
        write(preimage, fn.selector);
        for (const auto& hash : { sha256_fr(return_types.dump()), sha256_fr(base64_bytes(fn.abi->at("bytecode"))) }) {
            auto bytes = bytes_of(hash);
            preimage.insert(preimage.end(), bytes.begin(), bytes.end());
        }
        leaves.push_back(sha256_fr(preimage));
    }
    if (leaves.empty()) {
        return fr(0);
    }
    size_t height = 0;
    while ((size_t(1) << height) < leaves.size()) {
        height++;
    }
    return merkle_root(std::move(leaves), height, fr(0), [](const fr& l, const fr& r) {
        auto preimage = bytes_of(l);
        auto right = bytes_of(r);
        preimage.insert(preimage.end(), right.begin(), right.end());
        return sha256_fr(preimage);
    });
}

fr artifact_metadata_hash(const json& artifact)
{
    json outputs = artifact.at("outputs");
    for (const char* key : { "events", "functions" }) {
        auto& structs = outputs.at("structs");
        if (structs.contains(key)) {
            auto& list = structs[key];
            std::sort(list.begin(), list.end(), [](const json& a, const json& b) {
                return a.at("path").get<std::string>() > b.at("path").get<std::string>();
            });
        }
    }
    return sha256_fr(json{ { "name", artifact.at("name") }, { "outputs", outputs } }.dump());
}

} // namespace

AztecContractClass compute_aztec_contract_class(std::string_view artifact_json)
{
    const json artifact = json::parse(artifact_json);

    std::vector<ArtifactFunction> fns;
    for (const auto& fn : artifact.at("functions")) {
        const FunctionType type = function_type(fn);
        // Public functions are reached through public_dispatch, and their parameters may use types (tuples) that a
        // selector cannot encode, so only private and utility functions get one.
        fns.push_back(
            { .abi = &fn, .type = type, .selector = type == FunctionType::PUBLIC ? 0 : function_selector(fn) });
    }
    std::ranges::sort(fns, {}, &ArtifactFunction::selector);

    std::vector<uint8_t> public_bytecode;
    std::vector<fr> private_function_leaves;
    for (const auto& fn : fns) {
        if (fn.type == FunctionType::PUBLIC && fn.abi->at("name") == "public_dispatch") {
            public_bytecode = base64_bytes(fn.abi->at("bytecode"));
        } else if (fn.type == FunctionType::PRIVATE) {
            if (!fn.abi->contains("verification_key")) {
                throw_or_abort("Private function " + fn.abi->at("name").get<std::string>() +
                               " must have a verification key");
            }
            BBApiRequest request;
            auto vk_fields =
                MegaAppVkAsFields{ .verification_key = base64_bytes(fn.abi->at("verification_key")) }.execute(request);
            private_function_leaves.push_back(Poseidon2::hash(
                { DOM_SEP__PRIVATE_FUNCTION_LEAF, fr(fn.selector), Poseidon2::hash(vk_fields.fields) }));
        }
    }

    AztecContractClass klass;
    klass.private_functions_root =
        merkle_root(std::move(private_function_leaves),
                    FUNCTION_TREE_HEIGHT,
                    Poseidon2::hash({ fr(0), fr(0) }),
                    [](const fr& l, const fr& r) { return Poseidon2::hash({ DOM_SEP__MERKLE_HASH, l, r }); });

    std::vector<uint8_t> artifact_preimage = { ARTIFACT_HASH_VERSION };
    for (const auto& part : { artifact_function_tree_root(artifact, fns, FunctionType::PRIVATE),
                              artifact_function_tree_root(artifact, fns, FunctionType::UTILITY),
                              artifact_metadata_hash(artifact) }) {
        auto bytes = bytes_of(part);
        artifact_preimage.insert(artifact_preimage.end(), bytes.begin(), bytes.end());
    }
    klass.artifact_hash = sha256_fr(artifact_preimage);
    klass.public_bytecode_commitment = aztec::compute_public_bytecode_commitment(public_bytecode);
    klass.id = aztec::compute_contract_class_id(
        klass.artifact_hash, klass.private_functions_root, klass.public_bytecode_commitment);
    return klass;
}

std::vector<fr> compute_aztec_protocol_genesis_nullifiers(std::span<const std::string_view> artifacts_json)
{
    std::map<std::string, fr> addresses = {
        { "ContractInstanceRegistry", fr(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS) },
        { "ContractClassRegistry", fr(CONTRACT_CLASS_REGISTRY_CONTRACT_ADDRESS) },
        { "FeeJuice", fr(FEE_JUICE_ADDRESS) },
    };
    if (artifacts_json.size() != addresses.size()) {
        throw_or_abort("Expected the artifacts of ContractInstanceRegistry, ContractClassRegistry and FeeJuice");
    }
    std::vector<fr> nullifiers;
    for (const auto& artifact_json : artifacts_json) {
        const auto name = json::parse(artifact_json).at("name").get<std::string>();
        auto address = addresses.find(name);
        if (address == addresses.end()) {
            throw_or_abort("Not a protocol contract with a genesis registration: " + name);
        }
        const fr class_id = compute_aztec_contract_class(artifact_json).id;
        nullifiers.push_back(aztec::silo_nullifier(CONTRACT_CLASS_REGISTRY_CONTRACT_ADDRESS, class_id));
        nullifiers.push_back(aztec::silo_nullifier(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS, address->second));
        addresses.erase(address);
    }
    std::ranges::sort(nullifiers, [](const fr& a, const fr& b) { return uint256_t(a) < uint256_t(b); });
    return nullifiers;
}

void handle_aztec_contract_class(BBApiRequest& /*ctx*/,
                                 wire::BbAztecContractClass&& cmd,
                                 Responder<wire::BbAztecContractClassResponse> respond)
{
    auto klass = compute_aztec_contract_class(
        std::string_view(reinterpret_cast<const char*>(cmd.artifact.data()), cmd.artifact.size()));
    respond.ok({ .artifact_hash = fr_to_wire(klass.artifact_hash),
                 .private_functions_root = fr_to_wire(klass.private_functions_root),
                 .public_bytecode_commitment = fr_to_wire(klass.public_bytecode_commitment),
                 .id = fr_to_wire(klass.id) });
}

void handle_aztec_protocol_genesis_nullifiers(BBApiRequest& /*ctx*/,
                                              wire::BbAztecProtocolGenesisNullifiers&& cmd,
                                              Responder<wire::BbAztecProtocolGenesisNullifiersResponse> respond)
{
    std::vector<std::string_view> artifacts;
    for (const auto& artifact : cmd.artifacts) {
        artifacts.emplace_back(reinterpret_cast<const char*>(artifact.data()), artifact.size());
    }
    respond.ok({ .nullifiers = fr_vec_to_wire(compute_aztec_protocol_genesis_nullifiers(artifacts)) });
}

} // namespace bb::bbapi
