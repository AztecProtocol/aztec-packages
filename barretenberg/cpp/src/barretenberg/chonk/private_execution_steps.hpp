#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <cstdint>
#include <filesystem>
#include <string>
#include <vector>

namespace bb {

/**
 * @brief This is the msgpack encoding of the objects returned by the following typescript:
 *   const stepToStruct = (step: PrivateExecutionStep) => {
 *    return {
 *       bytecode: step.bytecode,
 *       witness: serializeWitness(step.witness),
 *       vk: step.vk,
 *       functionName: step.functionName
 *     };
 *   };
 *  await fs.writeFile(path, encode(executionSteps.map(stepToStruct)));
 *  See format notes below.
 */
struct PrivateExecutionStepRaw {
    // Represents bincode.
    std::vector<uint8_t> bytecode;
    // Represents bincoded witness data.
    std::vector<uint8_t> witness;
    // Represents a legacy-serialized vk.
    std::vector<uint8_t> vk;
    // Represents the function name.
    std::string function_name;

    // Unrolled from MSGPACK_FIELDS for custom name for function_name.
    void msgpack(auto pack_fn) { pack_fn(NVP(bytecode, witness, vk), "functionName", function_name); };
    void self_decompress();
    static std::vector<PrivateExecutionStepRaw> load_and_decompress(const std::filesystem::path& input_path);
    static std::vector<PrivateExecutionStepRaw> load(const std::filesystem::path& input_path);
    static std::vector<PrivateExecutionStepRaw> parse_uncompressed(const std::vector<uint8_t>& buf);
    static void compress_and_save(std::vector<PrivateExecutionStepRaw>&& steps,
                                  const std::filesystem::path& output_path);
};

/**
 * @brief Parsed private execution steps ready for Chonk accumulation.
 *
 * @details After deserializing from msgpack, this struct holds the decoded ACIR programs,
 * their witnesses, precomputed VKs, and function names. The accumulate() method runs the
 * complete IVC accumulation over all steps.
 *
 * Data flow:
 *   TypeScript (Aztec client) → msgpack encode → ivc-inputs.msgpack
 *     → PrivateExecutionStepRaw::load_and_decompress()
 *     → PrivateExecutionSteps::parse()
 *     → PrivateExecutionSteps::accumulate()
 *     → Chonk IVC proof
 *
 *
 */
struct PrivateExecutionSteps {
    std::vector<acir_format::AcirProgram> folding_stack;                 ///< ACIR programs with witnesses
    std::vector<std::string> function_names;                             ///< Function names for logging
    std::vector<std::shared_ptr<Chonk::HidingKernelVK>> precomputed_vks; ///< Precomputed VKs (performance)

    /**
     * @brief Creates a Chonk instance and accumulates each circuit in the folding stack.
     * Uses precomputed VKs when available for performance. The returned Chonk instance
     * is ready to call prove() to generate the final IVC proof.
     *
     * @return Shared pointer to Chonk instance with accumulated state
     */
    std::shared_ptr<Chonk> accumulate();

    /**
     * @brief Converts PrivateExecutionStepRaw entries (which contain raw bytecode/witness bytes)
     * into structured AcirProgram objects ready for circuit construction.
     *
     * @param steps Raw execution steps (will be moved from)
     */
    void parse(std::vector<PrivateExecutionStepRaw>&& steps);
};
} // namespace bb
