/**
 * @file i_avm_api.hpp
 * @brief Abstract interface for AVM operations
 *
 * This interface allows runtime selection between:
 * - Real AVM implementation (from dynamically loaded libvm2.so/dylib)
 * - Stub implementation (static fallback that throws runtime errors)
 */
#pragma once

#include "barretenberg/dsl/acir_format/honk_recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include <filesystem>

// Ensure Builder is defined in acir_format namespace (it's defined in avm2_recursion_constraint.hpp but not all files
// include it)
namespace acir_format {
using Builder = bb::UltraCircuitBuilder;
} // namespace acir_format

namespace bb {

/**
 * @brief Abstract interface for AVM operations
 *
 * Implementations:
 * - AvmApiImpl (in libvm2.so): Full AVM support
 * - AvmApiStub (in vm2_stub): Throws "AVM not available" errors
 */
class IAvmApi {
  protected:
    IAvmApi() = default;

  public:
    virtual ~IAvmApi() = default;

    // Interface is not copyable or movable
    IAvmApi(const IAvmApi&) = delete;
    IAvmApi& operator=(const IAvmApi&) = delete;
    IAvmApi(IAvmApi&&) = delete;
    IAvmApi& operator=(IAvmApi&&) = delete;

    /**
     * @brief Writes an avm proof and corresponding verification key to files
     *
     * @param inputs_path Path to serialized avm public inputs and hints
     * @param output_path Directory to write proof and vk files
     */
    virtual void prove(const std::filesystem::path& inputs_path, const std::filesystem::path& output_path) = 0;

    /**
     * @brief Validates circuit construction without proving
     *
     * @param inputs_path Path to serialized avm inputs
     */
    virtual void check_circuit(const std::filesystem::path& inputs_path) = 0;

    /**
     * @brief Verifies an avm proof
     *
     * @param proof_path Path to serialized proof
     * @param public_inputs_path Path to serialized public inputs
     * @param vk_path Path to serialized verification key
     * @return true if proof is valid, false otherwise
     */
    virtual bool verify(const std::filesystem::path& proof_path,
                        const std::filesystem::path& public_inputs_path,
                        const std::filesystem::path& vk_path) = 0;

    /**
     * @brief Simulates a public transaction
     *
     * @param inputs_path Path to serialized avm inputs
     */
    virtual void simulate(const std::filesystem::path& inputs_path) = 0;

    /**
     * @brief Creates AVM recursion constraints for circuit
     *
     * @param builder Circuit builder
     * @param input Recursion constraint specification
     * @param has_valid_witness_assignments Whether witness values are valid
     * @return Recursion constraint output with IPA claim and pairing points
     */
    virtual acir_format::HonkRecursionConstraintOutput<acir_format::Builder> create_recursion_constraints(
        acir_format::Builder& builder,
        const acir_format::RecursionConstraint& input,
        bool has_valid_witness_assignments) = 0;

    /**
     * @brief Check if this is the real implementation or stub
     *
     * @return true for real AVM, false for stub
     */
    virtual bool is_available() const = 0;
};

} // namespace bb
