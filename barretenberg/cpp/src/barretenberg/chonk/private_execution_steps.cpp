#include "private_execution_steps.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include <algorithm>
#include <fstream>
#include <libdeflate.h>
#include <memory>
#include <sstream>
#include <stdexcept>

namespace bb {

/**
 * @brief Save modified ivc-inputs.msgpack when VKs are rewritten.
 */
std::vector<uint8_t> compress(const std::vector<uint8_t>& input)
{
    auto compressor =
        std::unique_ptr<libdeflate_compressor, void (*)(libdeflate_compressor*)>{ libdeflate_alloc_compressor(6),
                                                                                  libdeflate_free_compressor };

    // Worst case size for gzip compression
    size_t max_compressed_size = libdeflate_gzip_compress_bound(compressor.get(), input.size());
    std::vector<uint8_t> compressed(max_compressed_size);

    size_t actual_compressed_size =
        libdeflate_gzip_compress(compressor.get(), input.data(), input.size(), compressed.data(), compressed.size());

    if (actual_compressed_size == 0) {
        THROW std::runtime_error("Failed to compress data");
    }

    compressed.resize(actual_compressed_size);
    return compressed;
}

/**
 * @brief Decompress bytecode and witness fields from ivc-inputs.msgpack.
 */
std::vector<uint8_t> decompress(const void* bytes, size_t size)
{
    // Deflate expands its input by at most 1032:1, so no valid gzip stream decompresses to more than this.
    constexpr size_t MAX_DEFLATE_RATIO = 1032;
    constexpr size_t GZIP_HEADER_SLACK = 1024;
    const size_t max_plausible_size = (size * MAX_DEFLATE_RATIO) + GZIP_HEADER_SLACK;

    std::vector<uint8_t> content;
    // The gzip trailer ends with the uncompressed size modulo 2^32 (RFC 1952 ISIZE): start there so the buffer is
    // allocated once at its final size. The trailer is unchecked input until decompression verifies it, so it is
    // capped at what the compressed bytes can expand to. The doubling below still covers multi-member and larger
    // inputs.
    size_t initial_size = 1024ULL * 128ULL;
    if (size >= 18) {
        const auto* trailer = static_cast<const uint8_t*>(bytes) + size - 4;
        const size_t isize = static_cast<size_t>(trailer[0]) | (static_cast<size_t>(trailer[1]) << 8) |
                             (static_cast<size_t>(trailer[2]) << 16) | (static_cast<size_t>(trailer[3]) << 24);
        if (isize > 0) {
            initial_size = std::min(isize, max_plausible_size);
        }
    }
    content.resize(initial_size);
    for (;;) {
        auto decompressor = std::unique_ptr<libdeflate_decompressor, void (*)(libdeflate_decompressor*)>{
            libdeflate_alloc_decompressor(), libdeflate_free_decompressor
        };
        size_t actual_size = 0;
        libdeflate_result decompress_result =
            libdeflate_gzip_decompress(decompressor.get(), bytes, size, content.data(), content.size(), &actual_size);
        if (decompress_result == LIBDEFLATE_INSUFFICIENT_SPACE) {
            if (content.size() >= max_plausible_size) {
                THROW std::invalid_argument("bad gzip data in bb main");
            }
            content.resize(std::min(content.size() * 2, max_plausible_size));
            continue;
        }
        if (decompress_result == LIBDEFLATE_BAD_DATA) {
            THROW std::invalid_argument("bad gzip data in bb main");
        }
        content.resize(actual_size);
        content.shrink_to_fit();
        break;
    }
    return content;
}

/**
 * @brief Deserialize msgpack data from file.
 */
template <typename T> T unpack_from_file(const std::filesystem::path& filename)
{
    std::ifstream fin;
    fin.open(filename, std::ios::ate | std::ios::binary);
    if (!fin.is_open()) {
        THROW std::invalid_argument("file not found");
    }
    if (fin.tellg() == -1) {
        THROW std::invalid_argument("something went wrong");
    }

    size_t fsize = static_cast<size_t>(fin.tellg());
    fin.seekg(0, std::ios_base::beg);

    T result;
    std::string encoded_data(fsize, '\0');
    fin.read(encoded_data.data(), static_cast<std::streamsize>(fsize));
    std::size_t offset = 0;
    msgpack::unpack(encoded_data.data(), fsize, offset).get().convert(result);
    if (offset != fsize) {
        THROW std::invalid_argument("msgpack input has trailing data (" + std::to_string(fsize - offset) +
                                    " extra bytes)");
    }
    return result;
}

// TODO(#7371) we should not have so many levels of serialization here.
std::vector<PrivateExecutionStepRaw> PrivateExecutionStepRaw::load(const std::filesystem::path& input_path)
{
    BB_BENCH();
    auto raw_steps = unpack_from_file<std::vector<PrivateExecutionStepRaw>>(input_path);
    for (auto& step : raw_steps) {
        step.compressed = true;
    }
    return raw_steps;
}

// TODO(#7371) we should not have so many levels of serialization here.
void PrivateExecutionStepRaw::self_decompress()
{
    if (!compressed) {
        return;
    }
    bytecode = decompress(bytecode.data(), bytecode.size());
    witness = decompress(witness.data(), witness.size());
    compressed = false;
}

// TODO(#7371) we should not have so many levels of serialization here.
std::vector<PrivateExecutionStepRaw> PrivateExecutionStepRaw::load_and_decompress(
    const std::filesystem::path& input_path)
{
    BB_BENCH();
    auto raw_steps = load(input_path);
    parallel_for(raw_steps.size(), [&](size_t i) { raw_steps[i].self_decompress(); });
    return raw_steps;
}

std::vector<PrivateExecutionStepRaw> PrivateExecutionStepRaw::parse_uncompressed(const std::vector<uint8_t>& buf)
{
    std::vector<PrivateExecutionStepRaw> raw_steps;
    // Read with msgpack
    std::size_t offset = 0;
    msgpack::unpack(reinterpret_cast<const char*>(buf.data()), buf.size(), offset).get().convert(raw_steps);
    if (offset != buf.size()) {
        THROW std::invalid_argument("msgpack input has trailing data (" + std::to_string(buf.size() - offset) +
                                    " extra bytes)");
    }
    // Unlike load_and_decompress, we don't need to decompress the bytecode and witness fields
    return raw_steps;
}

void PrivateExecutionStepRaw::compress_and_save(std::vector<PrivateExecutionStepRaw>&& steps,
                                                const std::filesystem::path& output_path)
{
    // First, compress the bytecode and witness fields of each step that is not already compressed
    for (PrivateExecutionStepRaw& step : steps) {
        if (step.compressed) {
            continue;
        }
        step.bytecode = compress(step.bytecode);
        step.witness = compress(step.witness);
        step.compressed = true;
    }

    // Serialize to msgpack
    std::stringstream ss;
    msgpack::pack(ss, steps);
    std::string packed_data = ss.str();

    // Write to file
    std::ofstream file(output_path, std::ios::binary);
    if (!file) {
        THROW std::runtime_error("Failed to open file for writing: " + output_path.string());
    }
    file.write(packed_data.data(), static_cast<std::streamsize>(packed_data.size()));
    file.close();
}
} // namespace bb
