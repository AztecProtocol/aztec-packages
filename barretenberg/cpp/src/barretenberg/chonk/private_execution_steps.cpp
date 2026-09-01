// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "private_execution_steps.hpp"
#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/chonk_step_processor.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include <libdeflate.h>

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
    static constexpr size_t MAX_DECOMPRESSED_SIZE = 256ULL * 1024 * 1024; // 256 MB
    std::vector<uint8_t> content;
    // initial size guess
    content.resize(1024ULL * 128ULL);
    for (;;) {
        auto decompressor = std::unique_ptr<libdeflate_decompressor, void (*)(libdeflate_decompressor*)>{
            libdeflate_alloc_decompressor(), libdeflate_free_decompressor
        };
        size_t actual_size = 0;
        libdeflate_result decompress_result =
            libdeflate_gzip_decompress(decompressor.get(), bytes, size, content.data(), content.size(), &actual_size);
        if (decompress_result == LIBDEFLATE_INSUFFICIENT_SPACE) {
            size_t new_size = content.size() * 2;
            if (new_size > MAX_DECOMPRESSED_SIZE) {
                THROW std::runtime_error("decompressed size exceeds 256 MB limit");
            }
            content.resize(new_size);
            continue;
        }
        if (decompress_result == LIBDEFLATE_BAD_DATA) {
            THROW std::invalid_argument("bad gzip data in bb main");
        }
        content.resize(actual_size);
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
    return unpack_from_file<std::vector<PrivateExecutionStepRaw>>(input_path);
}

// TODO(#7371) we should not have so many levels of serialization here.
void PrivateExecutionStepRaw::self_decompress()
{
    bytecode = decompress(bytecode.data(), bytecode.size());
    witness = decompress(witness.data(), witness.size());
}

// TODO(#7371) we should not have so many levels of serialization here.
std::vector<PrivateExecutionStepRaw> PrivateExecutionStepRaw::load_and_decompress(
    const std::filesystem::path& input_path)
{
    BB_BENCH();
    auto raw_steps = load(input_path);
    parallel_for(raw_steps.size(), [&](size_t i) {
        raw_steps[i].bytecode = decompress(raw_steps[i].bytecode.data(), raw_steps[i].bytecode.size());
        raw_steps[i].witness = decompress(raw_steps[i].witness.data(), raw_steps[i].witness.size());
    });
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

void PrivateExecutionSteps::parse(std::vector<PrivateExecutionStepRaw>&& steps)
{
    BB_BENCH();

    // Preallocate space to write into diretly as push_back would not be thread safe
    folding_stack.resize(steps.size());
    precomputed_vks.resize(steps.size());
    function_names.resize(steps.size());
    kinds.resize(steps.size());

    // Parse each step's bytecode/witness in parallel (thread-safe with msgpack format)
    parallel_for(steps.size(), [&](size_t i) {
        PrivateExecutionStepRaw step = std::move(steps[i]);

        acir_format::AcirFormat constraints = acir_format::circuit_buf_to_mega_acir_format(std::move(step.bytecode));
        acir_format::WitnessVector witness = acir_format::witness_buf_to_witness_vector(std::move(step.witness));

        folding_stack[i] = { std::move(constraints), std::move(witness) };
        if (step.vk.empty()) {
            // For backwards compatibility, but it affects performance and correctness.
            precomputed_vks[i] = {};
        } else {
            precomputed_vks[i] = std::move(step.vk);
        }
        function_names[i] = std::move(step.function_name);
        kinds[i] = step.kind;
    });
}

std::shared_ptr<Chonk> PrivateExecutionSteps::accumulate()
{
    auto step_processor = ChonkStepProcessor(kinds);

    for (auto& vk : precomputed_vks) {
        if (vk.empty()) {
            info("DEPRECATED: Precomputed VKs expected for the given circuits.");
            break;
        }
    }
    for (size_t i = 0; i < folding_stack.size(); ++i) {
        step_processor.process_step({ .name = std::move(function_names[i]),
                                      .program = std::move(folding_stack[i]),
                                      .precomputed_vk = std::move(precomputed_vks[i]),
                                      .kind = kinds[i] });
    }

    return step_processor.get_ivc();
}

void PrivateExecutionStepRaw::compress_and_save(std::vector<PrivateExecutionStepRaw>&& steps,
                                                const std::filesystem::path& output_path)
{
    // First, compress the bytecode and witness fields of each step
    for (PrivateExecutionStepRaw& step : steps) {
        step.bytecode = compress(step.bytecode);
        step.witness = compress(step.witness);
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
