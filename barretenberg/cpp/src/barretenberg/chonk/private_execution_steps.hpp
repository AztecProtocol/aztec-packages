#include "barretenberg/chonk/circuit_input.hpp"
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
    CircuitKind kind = CircuitKind::None;
    // Whether bytecode and witness hold gzip data. Not serialized: load() sets it, since the file stores them
    // compressed.
    bool compressed = false;

    // Unrolled from SERIALIZATION_FIELDS for custom name for function_name.
    void msgpack(auto pack_fn) { pack_fn(NVP(bytecode, witness, vk), "functionName", function_name, NVP(kind)); };
    /**
     * @brief Decompress bytecode and witness in place; does nothing if they are not compressed.
     */
    void self_decompress();
    static std::vector<PrivateExecutionStepRaw> load_and_decompress(const std::filesystem::path& input_path);
    static std::vector<PrivateExecutionStepRaw> load(const std::filesystem::path& input_path);
    static std::vector<PrivateExecutionStepRaw> parse_uncompressed(const std::vector<uint8_t>& buf);
    static void compress_and_save(std::vector<PrivateExecutionStepRaw>&& steps,
                                  const std::filesystem::path& output_path);
};

} // namespace bb
