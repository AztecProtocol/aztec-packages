/**
 * @file bbapi.fuzzer.cpp
 * @brief libFuzzer harness for the exported bbapi C entry point.
 *
 * Each input is passed to bbapi() as a raw msgpack request. The invariant under test is that every input, however
 * malformed, yields a decodable response (a command response or an ErrorResponse) through the IN-OUT output buffer
 * protocol, with no exception escaping the C boundary and no crash in request decoding, command execution, or
 * response encoding. Seed the corpus with valid requests so that mutation reaches the per-command deserialization
 * and validation paths; src/barretenberg/bbapi/fuzzer_corpus holds a few starting points.
 *
 * bbapi() keeps its BBApiRequest in a file-scope global, so state set by one command (a loaded circuit, an
 * in-progress Chonk accumulation) is still there for the next input. A crash may therefore depend on the inputs
 * that ran before it and may not reproduce from a single artifact; rerun the whole corpus in order to reproduce
 * one. There is no API to reset that state.
 */
#include "barretenberg/bbapi/c_bind.hpp"
#include "barretenberg/common/bbmalloc.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/srs/factories/bn254_crs_data.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include <cstddef>
#include <cstdint>
#include <string_view>
#include <vector>

namespace {
// The batch verifier service spawns worker threads and writes results to a caller-named FIFO, which is not
// hermetic for a fuzz harness. The command name is stored verbatim in the msgpack string, so a substring
// search is enough to skip any request that names it.
constexpr std::string_view SKIPPED_COMMAND_NAME = "ChonkBatchVerifierStart";
} // namespace

// A single G1 point plus the pinned G2 point is the CRS the verifier commands need. Commands that ask the CRS
// factory for more points are rejected by it and surface as an ErrorResponse.
extern "C" int LLVMFuzzerInitialize(int*, char***)
{
    // Commands log per request; at fuzzing rates that output buries libFuzzer's own.
    bb_log_level = LogLevel::SILENT;
    std::vector<bb::g1::affine_element> g1_points = { bb::srs::BN254_G1_FIRST_ELEMENT };
    bb::srs::init_bn254_mem_crs_factory(g1_points, bb::srs::get_bn254_g2_crs_element());
    return 0;
}

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size)
{
    if (std::string_view(reinterpret_cast<const char*>(data), size).find(SKIPPED_COMMAND_NAME) !=
        std::string_view::npos) {
        return 0;
    }

    uint8_t* output = nullptr;
    size_t output_len = 0;
    bbapi(data, size, &output, &output_len);

    // Every request must produce a response that decodes as a CommandResponse.
    bb::bbapi::CommandResponse response;
    msgpack::unpack(reinterpret_cast<const char*>(output), output_len).get().convert(response);
    bbfree(output);
    return 0;
}
