/**
 * @file api_avm.cpp
 * @brief AVM API implementation with lazy dynamic loading
 *
 * This file provides the AVM API functions that are called by the rest of the codebase.
 * It attempts to dynamically load libvm2.so/dylib at runtime. If the library is found,
 * calls are delegated to the real implementation. If not found, helpful error messages
 * are thrown.
 */
#include "barretenberg/api/api_avm.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/vm2/i_avm_api.hpp"
#include "barretenberg/vm2_stub/dynamic_library.hpp"
#include <cstdlib>
#include <filesystem>
#include <vector>

#ifdef __APPLE__
#define VM2_LIB_NAME "libvm2.dylib"
#else
#define VM2_LIB_NAME "libvm2.so"
#endif

namespace bb {

namespace {

// Get the directory containing the bb executable
std::filesystem::path get_executable_dir()
{
    Dl_info info;
    if (dladdr(reinterpret_cast<void*>(&get_executable_dir), &info) != 0 && info.dli_fname != nullptr) {
        return std::filesystem::path(info.dli_fname).parent_path();
    }
    return std::filesystem::current_path();
}

// Get list of paths to search for libvm2
std::vector<std::filesystem::path> get_search_paths()
{
    std::vector<std::filesystem::path> paths;

    // 1. Environment variable
    if (const char* env_path = std::getenv("VM2_LIB_PATH")) {
        paths.emplace_back(env_path);
    }

    // 2. Same directory as executable
    paths.push_back(get_executable_dir());

    // 3. Current directory (for development)
    paths.push_back(std::filesystem::current_path());

    return paths;
}

} // namespace

// Track the loaded library path
static std::string g_avm_library_path;

// Lazy-load the AVM API - exported for use by other modules
IAvmApi* get_or_load_avm_api()
{
    static IAvmApi* instance = []() -> IAvmApi* {
        auto search_paths = get_search_paths();

        for (const auto& dir : search_paths) {
            auto lib_path = dir / VM2_LIB_NAME;

            if (!std::filesystem::exists(lib_path)) {
                continue;
            }

            auto lib = DynamicLibrary::load(lib_path.string());
            if (!lib) {
                continue;
            }

            // Get the factory function
            using FactoryFn = IAvmApi* (*)();
            auto factory = lib->get_symbol<FactoryFn>("create_avm_api");
            if (!factory) {
                continue;
            }

            // Create the instance
            IAvmApi* api = (*factory)();
            if (api != nullptr) {
                // Keep library open by moving it to static storage
                static auto kept_lib = std::move(*lib);
                (void)kept_lib;
                // Store the path for later retrieval
                g_avm_library_path = lib_path.string();
                return api;
            }
        }

        return nullptr;
    }();

    return instance;
}

std::string get_avm_library_path()
{
    // Ensure lazy loading has been attempted
    get_or_load_avm_api();
    return g_avm_library_path;
}

// AVM availability is determined at runtime
const bool avm_enabled = (get_or_load_avm_api() != nullptr);

void avm_prove(const std::filesystem::path& inputs_path, const std::filesystem::path& output_path)
{
    auto* api = get_or_load_avm_api();
    if (api != nullptr) {
        api->prove(inputs_path, output_path);
        return;
    }
    throw_or_abort("AVM is not supported. Please provide libvm2.so/dylib for full AVM support.");
}

void avm_check_circuit(const std::filesystem::path& inputs_path)
{
    auto* api = get_or_load_avm_api();
    if (api != nullptr) {
        api->check_circuit(inputs_path);
        return;
    }
    throw_or_abort("AVM is not supported. Please provide libvm2.so/dylib for full AVM support.");
}

bool avm_verify(const std::filesystem::path& proof_path,
                const std::filesystem::path& public_inputs_path,
                const std::filesystem::path& vk_path)
{
    auto* api = get_or_load_avm_api();
    if (api != nullptr) {
        return api->verify(proof_path, public_inputs_path, vk_path);
    }
    throw_or_abort("AVM is not supported. Please provide libvm2.so/dylib for full AVM support.");
}

void avm_simulate(const std::filesystem::path& inputs_path)
{
    auto* api = get_or_load_avm_api();
    if (api != nullptr) {
        api->simulate(inputs_path);
        return;
    }
    throw_or_abort("AVM is not supported. Please provide libvm2.so/dylib for full AVM support.");
}

} // namespace bb
