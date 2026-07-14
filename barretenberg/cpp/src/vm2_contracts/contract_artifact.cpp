#include "vm2_contracts/contract_artifact.hpp"

#include <cstdlib>
#include <fstream>

#include <nlohmann/json.hpp>

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/base64.hpp"
#include "barretenberg/common/throw_or_abort.hpp"

namespace bb::avm2::contracts {

namespace {

using json = nlohmann::json;

AbiType parse_abi_type(const json& type)
{
    AbiType result;
    const std::string kind = type.at("kind").get<std::string>();
    if (kind == "field") {
        result.kind = AbiType::Kind::Field;
    } else if (kind == "boolean") {
        result.kind = AbiType::Kind::Boolean;
    } else if (kind == "integer") {
        result.kind = AbiType::Kind::Integer;
        result.is_signed = type.at("sign").get<std::string>() == "signed";
        result.width = type.at("width").get<uint32_t>();
    } else if (kind == "string") {
        result.kind = AbiType::Kind::String;
        result.length = type.at("length").get<uint32_t>();
    } else if (kind == "array") {
        result.kind = AbiType::Kind::Array;
        result.length = type.at("length").get<uint32_t>();
        result.element = std::make_shared<AbiType>(parse_abi_type(type.at("type")));
    } else if (kind == "struct") {
        result.kind = AbiType::Kind::Struct;
        result.path = type.value("path", "");
        for (const auto& field : type.at("fields")) {
            result.fields.emplace_back(field.at("name").get<std::string>(), parse_abi_type(field.at("type")));
        }
    } else {
        throw_or_abort("unknown ABI type kind: " + kind);
    }
    return result;
}

} // namespace

ContractArtifact ContractArtifact::load(const std::filesystem::path& json_path)
{
    std::ifstream stream(json_path);
    if (!stream.is_open()) {
        throw_or_abort("could not open contract artifact: " + json_path.string());
    }
    json doc;
    stream >> doc;

    ContractArtifact artifact;
    artifact.name_ = doc.value("name", "");
    for (const auto& function : doc.at("functions")) {
        FunctionArtifact fn;
        fn.name = function.at("name").get<std::string>();
        fn.bytecode_base64 = function.value("bytecode", "");
        if (function.contains("abi") && function.at("abi").contains("parameters")) {
            for (const auto& param : function.at("abi").at("parameters")) {
                fn.parameters.push_back(AbiParameter{ .name = param.at("name").get<std::string>(),
                                                      .type = parse_abi_type(param.at("type")) });
            }
        }
        artifact.functions_.push_back(std::move(fn));
    }
    return artifact;
}

ContractArtifact ContractArtifact::load_noir_contract(const std::string& artifact_filename)
{
    return load(noir_contract_artifacts_dir() / artifact_filename);
}

bool ContractArtifact::has_function(const std::string& function_name) const
{
    for (const auto& fn : functions_) {
        if (fn.name == function_name) {
            return true;
        }
    }
    return false;
}

const FunctionArtifact& ContractArtifact::get_function(const std::string& function_name) const
{
    for (const auto& fn : functions_) {
        if (fn.name == function_name) {
            return fn;
        }
    }
    throw_or_abort("function not found in artifact " + name_ + ": " + function_name);
}

std::vector<uint8_t> ContractArtifact::public_dispatch_bytecode() const
{
    const FunctionArtifact& fn = get_function("public_dispatch");
    // AVM public bytecode is base64-encoded but NOT gzipped, so plain base64 decoding suffices.
    const std::string decoded = base64_decode(fn.bytecode_base64);
    return std::vector<uint8_t>(decoded.begin(), decoded.end());
}

std::vector<FF> ContractArtifact::make_calldata(const std::string& function_name,
                                                const std::vector<AbiValue>& args) const
{
    const FunctionArtifact& fn = get_function(function_name);
    std::vector<FF> calldata;
    calldata.push_back(compute_function_selector(fn.name, fn.parameters));
    const std::vector<FF> encoded = encode_arguments(fn.parameters, args);
    calldata.insert(calldata.end(), encoded.begin(), encoded.end());
    return calldata;
}

std::filesystem::path noir_contract_artifacts_dir()
{
    if (const char* override_dir = std::getenv("AVM_CONTRACT_ARTIFACTS_DIR")) {
        return std::filesystem::path(override_dir);
    }
    const std::filesystem::path relative = "noir-projects/noir-contracts/target";
    std::filesystem::path dir = std::filesystem::current_path();
    for (int i = 0; i < 12; ++i) {
        if (std::filesystem::exists(dir / relative)) {
            return dir / relative;
        }
        if (dir == dir.root_path()) {
            break;
        }
        dir = dir.parent_path();
    }
    throw_or_abort("could not locate noir-projects/noir-contracts/target from " +
                   std::filesystem::current_path().string() + " (set AVM_CONTRACT_ARTIFACTS_DIR to override)");
}

} // namespace bb::avm2::contracts
