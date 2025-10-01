#include "aztec_process.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/common/base64.hpp"
#include "barretenberg/common/get_bytecode.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <nlohmann/json.hpp>
#include <sstream>
#include <thread>

#ifndef __wasm__
#include <fcntl.h>
#include <sys/wait.h>
#include <unistd.h>
#endif

#ifdef ENABLE_AVM_TRANSPILER
// Include avm_transpiler header
#include <avm_transpiler.h>
#endif

// External C function for VK generation
extern "C" int bbapi_compute_standalone_vk(const uint8_t* bytecode,
                                           size_t bytecode_len,
                                           uint8_t** out_vk,
                                           size_t* out_vk_len);

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
 * @brief Get cache directory path (~/.bb/vk_cache)
 */
std::filesystem::path get_cache_dir()
{
    const char* home = std::getenv("HOME");
    if (!home) {
        home = ".";
    }
    std::filesystem::path cache_dir = std::filesystem::path(home) / ".bb" / "vk_cache";
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
 * @brief Generate VK from bytecode and return as vector
 */
std::vector<uint8_t> generate_vk(const std::vector<uint8_t>& bytecode)
{
    uint8_t* vk_output_ptr = nullptr;
    size_t vk_output_len = 0;

    int result = bbapi_compute_standalone_vk(bytecode.data(), bytecode.size(), &vk_output_ptr, &vk_output_len);

    if (result != 0 || vk_output_ptr == nullptr) {
        throw_or_abort("VK generation failed");
    }

    std::vector<uint8_t> vk_data(vk_output_ptr, vk_output_ptr + vk_output_len);
    std::free(vk_output_ptr);

    return vk_data;
}

/**
 * @brief Get cached VK or generate if missing
 */
std::vector<uint8_t> get_or_generate_cached_vk(const std::filesystem::path& cache_dir,
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
    auto vk_data = generate_vk(bytecode);

    // Cache the VK
    write_file(vk_cache_path, vk_data);

    return vk_data;
}

#ifndef __wasm__
/**
 * @brief Worker process for VK generation
 */
void vk_worker_process(const std::filesystem::path& cache_dir,
                       const std::vector<nlohmann::json*>& functions,
                       size_t start_index,
                       size_t end_index,
                       bool force)
{
    for (size_t i = start_index; i < end_index; ++i) {
        const auto& function = *functions[i];
        std::string fn_name = function["name"].get<std::string>();

        info("\n--- ", fn_name, " ---");
        info("Processing function: ", fn_name, " (PID: ", getpid(), ")");

        try {
            // Get bytecode from function
            auto bytecode = extract_bytecode(function);

            // Generate and cache VK
            get_or_generate_cached_vk(cache_dir, bytecode, force);
        } catch (const std::exception& e) {
            std::cerr << "Error processing " << fn_name << ": " << e.what() << std::endl;
            std::exit(1);
        }
    }
}
#endif

/**
 * @brief Generate VKs for all functions (single-threaded or multi-process)
 */
void generate_vks_for_functions(const std::filesystem::path& cache_dir,
                                std::vector<nlohmann::json*>& functions,
                                bool force,
                                size_t jobs)
{
#ifdef __wasm__
    jobs = 1; // Force single-threaded in WASM
#endif

    if (jobs == 0) {
        jobs = std::thread::hardware_concurrency();
        if (jobs == 0)
            jobs = 1;
    }

    if (jobs == 1) {
        // Single-threaded processing
        for (auto* function : functions) {
            std::string fn_name = (*function)["name"].get<std::string>();

            info("\n--- ", fn_name, " ---");
            info("Processing function: ", fn_name, " (single-threaded)");

            // Get bytecode from function
            auto bytecode = extract_bytecode(*function);

            // Generate and cache VK
            get_or_generate_cached_vk(cache_dir, bytecode, force);
        }
        info("");
    } else {
#ifndef __wasm__
        // Multi-process processing
        size_t process_count = std::min(jobs, functions.size());
        size_t functions_per_process = (functions.size() + process_count - 1) / process_count;

        std::vector<std::pair<pid_t, int>> children; // (pid, pipe_read_fd)

        for (size_t i = 0; i < process_count; ++i) {
            size_t start_index = i * functions_per_process;
            size_t end_index = std::min((i + 1) * functions_per_process, functions.size());

            if (start_index >= functions.size())
                break;

            // Create pipe for child output
            int pipe_fds[2];
            if (pipe(pipe_fds) == -1) {
                throw_or_abort("Failed to create pipe");
            }

            pid_t pid = fork();
            if (pid == -1) {
                throw_or_abort("Failed to fork process");
            }

            if (pid == 0) {
                // Child process
                close(pipe_fds[0]); // Close read end

                // Redirect stdout/stderr to pipe
                dup2(pipe_fds[1], STDOUT_FILENO);
                dup2(pipe_fds[1], STDERR_FILENO);
                close(pipe_fds[1]);

                // Do the work
                vk_worker_process(cache_dir, functions, start_index, end_index, force);
                std::exit(0);
            } else {
                // Parent process
                close(pipe_fds[1]); // Close write end
                children.push_back({ pid, pipe_fds[0] });
            }
        }

        // Wait for children and collect output
        for (const auto& [pid, pipe_fd] : children) {
            // Wait for child
            int status;
            waitpid(pid, &status, 0);

            if (!WIFEXITED(status) || WEXITSTATUS(status) != 0) {
                close(pipe_fd);
                throw_or_abort("VK generation process failed");
            }

            // Read and print output
            char buffer[65536];
            ssize_t bytes_read = ::read(pipe_fd, buffer, sizeof(buffer) - 1);
            close(pipe_fd);

            if (bytes_read > 0) {
                buffer[bytes_read] = '\0';
                std::cout << buffer;
                if (buffer[bytes_read - 1] != '\n') {
                    std::cout << '\n';
                }
            }
        }
        info("");
#endif
    }

    // Update JSON with VKs from cache
    for (auto* function : functions) {
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

bool process_aztec_artifact(const std::string& input_path, const std::string& output_path, bool force, size_t jobs)
{
    try {
#ifdef ENABLE_AVM_TRANSPILER
        // Step 1: Transpile the artifact
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
        // If transpiler is not enabled, just copy the file
        if (input_path != output_path) {
            std::filesystem::copy_file(input_path, output_path, std::filesystem::copy_options::overwrite_existing);
        }
#endif

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
        generate_vks_for_functions(cache_dir, private_functions, force, jobs);

        // Write updated JSON back to file
        std::ofstream out_file(output_path);
        out_file << artifact_json.dump(2) << std::endl;
        out_file.close();

        info("Successfully processed: ", input_path, " -> ", output_path);
        return true;

    } catch (const std::exception& e) {
        info("Error processing artifact: ", e.what());
        return false;
    }
}

} // namespace bb
