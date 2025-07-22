#include "private_execution_steps.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include <libdeflate.h>

namespace bb {

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

std::vector<uint8_t> decompress(const void* bytes, size_t size)
{
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
            // need a bigger buffer
            content.resize(content.size() * 2);
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
    msgpack::unpack(encoded_data.data(), fsize).get().convert(result);
    return result;
}

// TODO(#7371) we should not have so many levels of serialization here.
std::vector<PrivateExecutionStepRaw> PrivateExecutionStepRaw::load(const std::filesystem::path& input_path)
{
    PROFILE_THIS();
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
    PROFILE_THIS();
    auto raw_steps = load(input_path);
    for (PrivateExecutionStepRaw& step : raw_steps) {
        step.bytecode = decompress(step.bytecode.data(), step.bytecode.size());
        step.witness = decompress(step.witness.data(), step.witness.size());
    }
    return raw_steps;
}

std::vector<PrivateExecutionStepRaw> PrivateExecutionStepRaw::parse_uncompressed(const std::vector<uint8_t>& buf)
{
    std::vector<PrivateExecutionStepRaw> raw_steps;
    // Read with msgpack
    msgpack::unpack(reinterpret_cast<const char*>(buf.data()), buf.size()).get().convert(raw_steps);
    // Unlike load_and_decompress, we don't need to decompress the bytecode and witness fields
    return raw_steps;
}

void PrivateExecutionSteps::parse(std::vector<PrivateExecutionStepRaw>&& steps)
{
    PROFILE_THIS();

    // Preallocate space to write into diretly as push_back would not be thread safe
    folding_stack.resize(steps.size());
    precomputed_vks.resize(steps.size());
    function_names.resize(steps.size());

    // https://github.com/AztecProtocol/barretenberg/issues/1395 multithread this once bincode is thread-safe
    for (size_t i = 0; i < steps.size(); i++) {
        PrivateExecutionStepRaw step = std::move(steps[i]);

        // TODO(#7371) there is a lot of copying going on in bincode. We need the generated bincode code to
        // use spans instead of vectors.
        acir_format::AcirFormat constraints = acir_format::circuit_buf_to_acir_format(std::move(step.bytecode));
        acir_format::WitnessVector witness = acir_format::witness_buf_to_witness_data(std::move(step.witness));

        folding_stack[i] = { std::move(constraints), std::move(witness) };
        if (step.vk.empty()) {
            // For backwards compatibility, but it affects performance and correctness.
            precomputed_vks[i] = nullptr;
        } else {
            auto vk = from_buffer<std::shared_ptr<ClientIVC::MegaVerificationKey>>(step.vk);
            precomputed_vks[i] = vk;
        }
        function_names[i] = step.function_name;
    }
}

std::shared_ptr<ClientIVC> PrivateExecutionSteps::accumulate()
{
    TraceSettings trace_settings{ AZTEC_TRACE_STRUCTURE };
    auto ivc = std::make_shared<ClientIVC>(/*num_circuits=*/folding_stack.size(), trace_settings);

    const acir_format::ProgramMetadata metadata{ ivc };

    for (auto& vk : precomputed_vks) {
        if (vk == nullptr) {
            info("DEPRECATED: No VK was provided for at least one client IVC step and it will be computed. This is "
                 "slower and insecure.");
            break;
        }
    }
    // Accumulate the entire program stack into the IVC
    for (auto [program, precomputed_vk, function_name] : zip_view(folding_stack, precomputed_vks, function_names)) {
        // Construct a bberg circuit from the acir representation then accumulate it into the IVC
        auto circuit = acir_format::create_circuit<MegaCircuitBuilder>(program, metadata);

        info("ClientIVC: accumulating " + function_name);
        // Do one step of ivc accumulator or, if there is only one circuit in the stack, prove that circuit. In this
        // case, no work is added to the Goblin opqueue, but VM proofs for trivials inputs are produced.
        ivc->accumulate(circuit, precomputed_vk);
    }

    return ivc;
}

void PrivateExecutionStepRaw::compress_and_save(std::vector<PrivateExecutionStepRaw>&& steps,
                                                const std::filesystem::path& output_path)
{
    // First, compress the bytecode and witness fields of each step
    for (PrivateExecutionStepRaw& step : steps) {
        step.bytecode = compress(step.bytecode);
        step.witness = compress(step.witness);
        step.vk = step.vk;
        step.function_name = step.function_name;
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
