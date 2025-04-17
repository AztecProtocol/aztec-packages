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
    std::string bytecode;
    // Represents bincoded witness data.
    std::string witness;
    // Represents a legacy-serialized vk.
    std::string vk;
    // Represents the function name.
    std::string function_name;

    // Unrolled from MSGPACK_FIELDS for custom name for function_name.
    void msgpack(auto pack_fn) { pack_fn(NVP(bytecode, witness, vk), "functionName", function_name); };
    static std::vector<PrivateExecutionStepRaw> load_and_decompress(const std::filesystem::path& input_path);
    static std::vector<PrivateExecutionStepRaw> parse_uncompressed(const std::vector<uint8_t>& buf);
};

// TODO(https://github.com/AztecProtocol/barretenberg/issues/1162) this should have a common code path with
// the WASM folding stack code.
struct PrivateExecutionSteps {
    std::vector<acir_format::AcirProgram> folding_stack;
    std::vector<std::string> function_names;
    std::vector<std::shared_ptr<ClientIVC::MegaVerificationKey>> precomputed_vks;

    std::shared_ptr<ClientIVC> accumulate();
    void parse(const std::vector<PrivateExecutionStepRaw>& steps);
};
} // namespace bb
