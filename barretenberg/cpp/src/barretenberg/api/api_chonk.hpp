#pragma once
#include "barretenberg/api/api.hpp"
#include <filesystem>
#include <stdexcept>
#include <string>
#include <vector>

namespace bb {

/**
 * @brief CLI API for Chonk (Aztec's client-side proving).
 *
 * @details Processes private function execution steps from TypeScript, accumulates them via Chonk,
 * and produces proofs that can be verified on-chain.
 *
 * **Production flow (Aztec private execution):**
 * ```
 * TypeScript (private function calls)
 *   → msgpack encode to ivc-inputs.msgpack
 *   → ChonkAPI::prove() loads and accumulates all steps
 *   → Chonk proof + VK written to output directory
 * ```
 *
 * **Key entry points:**
 * - `prove()`: Main production entry - loads execution steps, runs IVC, outputs proof
 * - `verify()`: Verifies a Chonk proof against a verification key
 * - `write_vk()`: Computes verification key for standalone or IVC circuits
 * - `check_precomputed_vks()`: Validates that precomputed VKs match computed ones
 *
 * @see PrivateExecutionSteps for the input format
 * @see Chonk for the underlying IVC implementation
 */
class ChonkAPI : public API {

  public:
    /**
     * @brief Main production entry point: generate a Chonk proof from private execution steps.
     *
     * @details Loads execution steps from ivc-inputs.msgpack, accumulates each circuit via Chonk,
     * and writes the final proof (and optionally VK) to the output directory.
     *
     * @param flags Runtime flags (vk_policy, write_vk, etc.)
     * @param input_path Path to ivc-inputs.msgpack containing PrivateExecutionStepRaw entries
     * @param output_dir Directory to write proof (and vk if flags.write_vk is set)
     */
    void prove(const Flags& flags, const std::filesystem::path& input_path, const std::filesystem::path& output_dir);

    /**
     * @brief Verify a Chonk proof against a verification key.
     *
     * @param proof_path Path to the serialized Chonk proof
     * @param vk_path Path to the verification key
     * @return true if proof verifies successfully
     */
    bool verify(const Flags& flags,
                const std::filesystem::path& public_inputs_path,
                const std::filesystem::path& proof_path,
                const std::filesystem::path& vk_path) override;

    /**
     * @brief Test/debug function: prove and verify in one call (bypasses serialization).
     */
    bool prove_and_verify(const std::filesystem::path& input_path);

    /**
     * @brief Output gate count statistics for a circuit.
     */
    void gates(const Flags& flags, const std::filesystem::path& bytecode_path) override;

    void write_solidity_verifier(const Flags& flags,
                                 const std::filesystem::path& output_path,
                                 const std::filesystem::path& vk_path) override;

    /**
     * @brief Compute and write a verification key.
     *
     * @details Two modes controlled by flags.verifier_type:
     * - "standalone": VK for a single circuit to be accumulated by Chonk
     * - "ivc": VK for the Chonk hiding kernel (requires last circuit's bytecode to parameterize
     *   the hiding kernel with the correct public inputs count)
     *
     * @param bytecode_path Path to circuit bytecode (ACIR)
     * @param output_path Directory to write the VK
     */
    void write_vk(const Flags& flags,
                  const std::filesystem::path& bytecode_path,
                  const std::filesystem::path& output_path) override;

    /**
     * @brief Validate that precomputed VKs in ivc-inputs.msgpack match computed VKs.
     *
     * @details Iterates through all execution steps and verifies each precomputed VK.
     * If flags.vk_policy is REWRITE, mismatched VKs are updated in place.
     *
     * @param input_path Path to ivc-inputs.msgpack
     * @return true if all VKs match (or were successfully rewritten)
     */
    bool check_precomputed_vks(const Flags& flags, const std::filesystem::path& input_path);

    bool check(const Flags& flags,
               const std::filesystem::path& bytecode_path,
               const std::filesystem::path& witness_path) override;
};

void chonk_gate_count(const std::string& bytecode_path, bool include_gates_per_opcode);

std::vector<uint8_t> decompress(const void* bytes, size_t size);

} // namespace bb
