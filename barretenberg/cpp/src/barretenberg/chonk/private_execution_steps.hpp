#include "barretenberg/chonk/circuit_input.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <cstdint>
#include <filesystem>
#include <limits>
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
/**
 * @brief Upper bound on the decompressed size of a gzip stream of compressed_size bytes, saturating at size_max.
 * @details Deflate expands its input by at most 1032:1. Computed in 64 bits: on a 32-bit target the product wraps for
 * inputs of a few MiB and the wrapped bound would reject valid data.
 */
constexpr size_t max_gzip_output_size(size_t compressed_size, size_t size_max = std::numeric_limits<size_t>::max())
{
    constexpr uint64_t MAX_DEFLATE_RATIO = 1032;
    constexpr uint64_t GZIP_HEADER_SLACK = 1024;
    const uint64_t bound = (static_cast<uint64_t>(compressed_size) * MAX_DEFLATE_RATIO) + GZIP_HEADER_SLACK;
    return bound > size_max ? size_max : static_cast<size_t>(bound);
}

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
