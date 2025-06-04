#include "private_execution_steps.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include <libdeflate.h>

namespace bb {

std::vector<uint8_t> decompress(const void* compressed, std::size_t comp_size)
{
    const int gz_header_size = 10;
    const int gz_footer_size = 8;

    if (comp_size < gz_header_size + gz_footer_size) {
        throw std::invalid_argument("truncated gzip");
    }

    const std::uint8_t* in = static_cast<const std::uint8_t*>(compressed);

    // Read the little-endian ISIZE.
    // Every gzip member ends with an 8-byte footer: four bytes CRC-32 and four bytes ISIZE — the original uncompressed
    // length modulo 2³². We do not support input files > 4GiB.
    std::uint32_t isize =
        static_cast<std::uint32_t>(in[comp_size - 4]) | static_cast<std::uint32_t>(in[comp_size - 3]) << 8 |
        static_cast<std::uint32_t>(in[comp_size - 2]) << 16 | static_cast<std::uint32_t>(in[comp_size - 1]) << 24;

    std::vector<std::uint8_t> out(isize);

    // Decompress.
    std::unique_ptr<libdeflate_decompressor, void (*)(libdeflate_decompressor*)> dec{ libdeflate_alloc_decompressor(),
                                                                                      libdeflate_free_decompressor };

    size_t written = 0;
    libdeflate_result r = libdeflate_gzip_decompress(dec.get(), in, comp_size, out.data(), out.size(), &written);
    if (r != LIBDEFLATE_SUCCESS) {
        THROW std::invalid_argument("bad gzip data");
    }

    if (written != isize) {
        THROW std::runtime_error("gzip size mismatch!");
    }

    return out;
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
std::vector<PrivateExecutionStepRaw> PrivateExecutionStepRaw::load_and_decompress(
    const std::filesystem::path& input_path)
{
    PROFILE_THIS();
    auto raw_steps = unpack_from_file<std::vector<PrivateExecutionStepRaw>>(input_path);
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
    auto ivc = std::make_shared<ClientIVC>(trace_settings);

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
        PROFILE_THIS_NAME("PrivateExecutionSteps::ivc->accumulate");
        // Create a tracy zone with the std::string function name.
        ZoneText(function_name.c_str(), function_name.size());
        // Construct a bberg circuit from the acir representation then accumulate it into the IVC
        MegaCircuitBuilder circuit = acir_format::create_circuit<MegaCircuitBuilder>(program, metadata);
        info("ClientIVC: accumulating ", function_name, " gates: ", circuit.get_estimated_num_finalized_gates());
        // Do one step of ivc accumulator
        ivc->accumulate(circuit, precomputed_vk);
    }

    return ivc;
}
} // namespace bb
