/**
 * @file avm_api_impl.hpp
 * @brief Real AVM implementation (loaded from libvm2.so/dylib)
 */
#pragma once

#include "barretenberg/vm2/i_avm_api.hpp"

namespace bb {

/**
 * @brief Real AVM implementation with full functionality
 *
 * This implementation forwards to the actual AVM proving/verification logic.
 * Built into libvm2.so/dylib and loaded at runtime.
 */
class AvmApiImpl : public IAvmApi {
  public:
    /**
     * @brief Construct AVM API instance
     *
     * CRS initialization is deferred to update_crs() which is called after bb initializes its CRS.
     */
    AvmApiImpl();

    void prove(const std::filesystem::path& inputs_path, const std::filesystem::path& output_path) override;

    void check_circuit(const std::filesystem::path& inputs_path) override;

    bool verify(const std::filesystem::path& proof_path,
                const std::filesystem::path& public_inputs_path,
                const std::filesystem::path& vk_path) override;

    void simulate(const std::filesystem::path& inputs_path) override;

    acir_format::HonkRecursionConstraintOutput<acir_format::Builder> create_recursion_constraints(
        acir_format::Builder& builder,
        const acir_format::RecursionConstraint& input,
        bool has_valid_witness_assignments) override;

    bool is_available() const override { return true; }

    void update_crs(void* bn254_crs_factory_ptr, void* grumpkin_crs_factory_ptr) override;
};

} // namespace bb

// C interface for dynamic loading
extern "C" {
/**
 * @brief Factory function for creating AVM API instance
 *
 * This is the entry point called via dlsym when loading libvm2.so/dylib.
 * Returns a new heap-allocated AvmApiImpl instance.
 * CRS initialization happens later via the update_crs() method.
 */
bb::IAvmApi* create_avm_api();
}
