#pragma once

#include <cstdint>
#include <filesystem>
#include <string>
#include <vector>

#include "barretenberg/vm2/common/field.hpp"
#include "vm2_contracts/noir_abi.hpp"

namespace bb::avm2::contracts {

// A single function entry from a contract artifact: its name, ABI parameters, and (base64) bytecode.
struct FunctionArtifact {
    std::string name;
    std::vector<AbiParameter> parameters;
    std::string bytecode_base64; // Raw base64 string as stored in the artifact JSON.
};

// A compiled Noir contract artifact, loaded from the nargo+transpiler JSON output (the same shape as
// the TypeScript `ContractArtifact`). Provides the packed public bytecode and ABI-encoded calldata
// for named functions, which is everything the AVM public-tx tester needs to deploy and call it.
class ContractArtifact {
  public:
    // Loads an artifact from a JSON file on disk.
    static ContractArtifact load(const std::filesystem::path& json_path);
    // Loads a noir-contracts artifact by file name (e.g. "avm_test_contract-AvmTest.json"),
    // resolving it under the repo's noir-projects/noir-contracts/target directory.
    static ContractArtifact load_noir_contract(const std::string& artifact_filename);

    const std::string& name() const { return name_; }
    bool has_function(const std::string& function_name) const;
    const FunctionArtifact& get_function(const std::string& function_name) const;

    // Packed AVM bytecode of the `public_dispatch` entrypoint (base64-decoded).
    std::vector<uint8_t> public_dispatch_bytecode() const;

    // Builds calldata for a public call: [function_selector, ...encoded_args].
    std::vector<FF> make_calldata(const std::string& function_name, const std::vector<AbiValue>& args) const;

  private:
    std::string name_;
    std::vector<FunctionArtifact> functions_;
};

// Resolves the directory holding noir-contracts artifacts. Honors $AVM_CONTRACT_ARTIFACTS_DIR if set;
// otherwise walks up from the current working directory to find noir-projects/noir-contracts/target.
std::filesystem::path noir_contract_artifacts_dir();

} // namespace bb::avm2::contracts
