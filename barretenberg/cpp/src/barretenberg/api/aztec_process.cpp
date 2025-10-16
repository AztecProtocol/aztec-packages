#ifndef __wasm__
#include "aztec_process.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/bbapi/bbapi_client_ivc.hpp"
#include "barretenberg/common/base64.hpp"
#include "barretenberg/common/get_bytecode.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/common/version.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <nlohmann/json.hpp>
#include <sstream>

#ifdef ENABLE_AVM_TRANSPILER
// Include avm_transpiler header
#include <avm_transpiler.h>
#endif

namespace bb {

namespace {

/**
 * @brief Extract and decode bytecode from a function JSON object
 */
std::vector<uint8_t> extract_bytecode(const nlohmann::json& function)
{
    if (!function.contains("bytecode")) {
        throw_or_abort("Function missing bytecode field");
    }

    const auto& base64_bytecode = function["bytecode"].get<std::string>();
    return decode_bytecode(base64_bytecode);
}

/**
 * @brief Compute SHA256 hash of bytecode and return as hex string
 */
std::string compute_bytecode_hash(const std::vector<uint8_t>& bytecode)
{
    auto hash = crypto::sha256(bytecode);
    std::ostringstream oss;
    for (auto byte : hash) {
        oss << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(byte);
    }
    return oss.str();
}

/**
 * @brief Get cache directory path (~/.bb/vk_cache/<version>)
 */
std::filesystem::path get_cache_dir()
{
    const char* home = std::getenv("HOME");
    if (!home) {
        home = ".";
    }
    std::filesystem::path cache_dir = std::filesystem::path(home) / ".bb" / BB_VERSION_PLACEHOLDER / "vk_cache";
    std::filesystem::create_directories(cache_dir);
    return cache_dir;
}

/**
 * @brief Check if a function is a private constrained function
 */
bool is_private_constrained_function(const nlohmann::json& function)
{
    bool is_public = false;
    bool is_unconstrained = false;

    // Check custom_attributes for "public"
    if (function.contains("custom_attributes") && function["custom_attributes"].is_array()) {
        for (const auto& attr : function["custom_attributes"]) {
            if (attr.is_string() && attr.get<std::string>() == "public") {
                is_public = true;
                break;
            }
        }
    }

    // Check is_unconstrained
    if (function.contains("is_unconstrained") && function["is_unconstrained"].is_boolean()) {
        is_unconstrained = function["is_unconstrained"].get<bool>();
    }

    return !is_public && !is_unconstrained;
}

/**
 * @brief Get cached VK or generate if missing
 */
std::vector<uint8_t> get_or_generate_cached_vk(const std::filesystem::path& cache_dir,
                                               const std::string& circuit_name,
                                               const std::vector<uint8_t>& bytecode,
                                               bool force)
{
    std::string hash_str = compute_bytecode_hash(bytecode);
    std::filesystem::path vk_cache_path = cache_dir / (hash_str + ".vk");

    // Check cache unless force is true
    if (!force && std::filesystem::exists(vk_cache_path)) {
        info("Verification key already in cache: ", hash_str);
        return read_file(vk_cache_path);
    }

    // Generate new VK
    info("Generating verification key: ", hash_str);
    auto response =
        bbapi::ClientIvcComputeStandaloneVk{ .circuit = { .name = circuit_name, .bytecode = bytecode } }.execute();

    // Cache the VK
    write_file(vk_cache_path, response.bytes);

    return response.bytes;
}

/**
 * @brief Generate VKs for all functions in parallel
 */
void generate_vks_for_functions(const std::filesystem::path& cache_dir,
                                std::vector<nlohmann::json*>& functions,
                                bool force)
{
    // Generate VKs in parallel (logging removed to avoid data races)
    parallel_for(functions.size(), [&](size_t i) {
        auto* function = functions[i];
        std::string fn_name = (*function)["name"].get<std::string>();

        // Get bytecode from function
        auto bytecode = extract_bytecode(*function);

        // Generate and cache VK (this will log internally if needed)
        get_or_generate_cached_vk(cache_dir, fn_name, bytecode, force);
    });

    // Update JSON with VKs from cache (sequential is fine here, it's fast)
    for (auto* function : functions) {
        std::string fn_name = (*function)["name"].get<std::string>();

        // Get bytecode to compute hash
        auto bytecode = extract_bytecode(*function);

        // Read VK from cache
        std::string hash_str = compute_bytecode_hash(bytecode);
        std::filesystem::path vk_cache_path = cache_dir / (hash_str + ".vk");
        auto vk_data = read_file(vk_cache_path);

        // Encode to base64 and store in JSON
        std::string encoded_vk = base64_encode(vk_data.data(), vk_data.size(), false);
        (*function)["verification_key"] = encoded_vk;
    }
}

} // anonymous namespace

/**
 * @brief Transpile the artifact file (or copy if transpiler not enabled)
 */
bool transpile_artifact([[maybe_unused]] const std::string& input_path, [[maybe_unused]] const std::string& output_path)
{
#ifdef ENABLE_AVM_TRANSPILER
    info("Transpiling: ", input_path, " -> ", output_path);

    auto result = avm_transpile_file(input_path.c_str(), output_path.c_str());

    if (result.success == 0) {
        if (result.error_message) {
            std::string error_msg(result.error_message);
            if (error_msg == "Contract already transpiled") {
                // Already transpiled, copy if different paths
                if (input_path != output_path) {
                    std::filesystem::copy_file(
                        input_path, output_path, std::filesystem::copy_options::overwrite_existing);
                }
            } else {
                info("Transpilation failed: ", error_msg);
                avm_free_result(&result);
                return false;
            }
        } else {
            info("Transpilation failed");
            avm_free_result(&result);
            return false;
        }
    }

    avm_free_result(&result);

    info("Transpiled: ", input_path, " -> ", output_path);
#else
    throw_or_abort("AVM Transpiler is not enabled. Please enable it to use bb aztec_process.");
#endif
    return true;
}

bool process_aztec_artifact(const std::string& input_path, const std::string& output_path, bool force)
{
    if (!transpile_artifact(input_path, output_path)) {
        return false;
    }

    // Verify output exists
    if (!std::filesystem::exists(output_path)) {
        throw_or_abort("Output file does not exist after transpilation");
    }

    // Step 2: Generate verification keys
    auto cache_dir = get_cache_dir();
    info("Generating verification keys for functions in ", std::filesystem::path(output_path).filename().string());
    info("Cache directory: ", cache_dir.string());

    // Read and parse artifact JSON
    auto artifact_content = read_file(output_path);
    std::string artifact_str(artifact_content.begin(), artifact_content.end());
    auto artifact_json = nlohmann::json::parse(artifact_str);

    if (!artifact_json.contains("functions")) {
        info("Warning: No functions found in artifact");
        return true;
    }

    // Filter to private constrained functions
    std::vector<nlohmann::json*> private_functions;
    for (auto& function : artifact_json["functions"]) {
        if (is_private_constrained_function(function)) {
            private_functions.push_back(&function);
        }
    }

    if (private_functions.empty()) {
        info("No private constrained functions found");
        return true;
    }

    // Generate VKs
    generate_vks_for_functions(cache_dir, private_functions, force);

    // Write updated JSON back to file
    std::ofstream out_file(output_path);
    out_file << artifact_json.dump(2) << std::endl;
    out_file.close();

    info("Successfully processed: ", input_path, " -> ", output_path);
    return true;
}

std::vector<std::string> find_contract_artifacts(const std::string& search_path)
{
    std::vector<std::string> artifacts;

    // Recursively search for .json files in target/ directories, excluding cache/
    for (const auto& entry : std::filesystem::recursive_directory_iterator(search_path)) {
        if (!entry.is_regular_file()) {
            continue;
        }

        const auto& path = entry.path();

        // Must be a .json file
        if (path.extension() != ".json") {
            continue;
        }

        // Must be in a target/ directory
        std::string path_str = path.string();
        if (path_str.find("/target/") == std::string::npos && path_str.find("\\target\\") == std::string::npos) {
            continue;
        }

        // Exclude cache directories and function artifact temporaries
        if (path_str.find("/cache/") != std::string::npos || path_str.find("\\cache\\") != std::string::npos ||
            path_str.find(".function_artifact_") != std::string::npos) {
            continue;
        }

        artifacts.push_back(path.string());
    }

    return artifacts;
}

bool process_all_artifacts(const std::string& search_path, bool force)
{
    auto artifacts = find_contract_artifacts(search_path);

    if (artifacts.empty()) {
        info("No contract artifacts found. Please compile your contracts first with 'nargo compile'.");
        return false;
    }

    info("Found ", artifacts.size(), " contract artifact(s) to process");

    bool all_success = true;
    for (const auto& artifact : artifacts) {
        // Process in-place (input == output)
        if (!process_aztec_artifact(artifact, artifact, force)) {
            all_success = false;
        }
    }

    if (all_success) {
        info("Contract postprocessing complete!");
    }

    return all_success;
}

} // namespace bb
#endif
