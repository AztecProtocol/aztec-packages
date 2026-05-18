#pragma once

#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace acir_format {
struct AcirFormat;
}

namespace bb {
class IVCBase;
}

namespace bb::bbapi {

/**
 * @enum VkPolicy
 * @brief Policy for handling verification keys during IVC accumulation
 */
enum class VkPolicy {
    DEFAULT,   // Use the provided VK as-is (default behavior)
    CHECK,     // Verify the provided VK matches the computed VK, throw error if mismatch
    RECOMPUTE, // Always ignore the provided VK and treat it as nullptr
    REWRITE    // Check the VK and rewrite the input file with correct VK if mismatch (for check command)
};

#ifndef __wasm__
class ChonkBatchVerifierService;
#endif

struct BBApiRequest {
    // Current depth of the IVC stack for this request
    uint32_t ivc_stack_depth = 0;
    std::shared_ptr<IVCBase> ivc_in_progress;
    // Name of the last loaded circuit
    std::string loaded_circuit_name;
    // Store the parsed constraint system to get ahead of parsing before accumulate
    std::shared_ptr<acir_format::AcirFormat> loaded_circuit_constraints;
    // Store the verification key passed with the circuit
    std::vector<uint8_t> loaded_circuit_vk;
    // Policy for handling verification keys during accumulation
    VkPolicy vk_policy = VkPolicy::DEFAULT;
    // Error message - empty string means no error
    std::string error_message;
#ifndef __wasm__
    // Batch verifier service instance (persists across RPC calls)
    std::shared_ptr<ChonkBatchVerifierService> batch_verifier_service;
#endif
};

BBApiRequest& get_global_request();

/**
 * @brief Macro to set error in BBApiRequest and return default response
 */
#define BBAPI_ERROR(request, msg)                                                                                      \
    do {                                                                                                               \
        (request).error_message = (msg);                                                                               \
        return {};                                                                                                     \
    } while (0)

} // namespace bb::bbapi
