// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "private_execution_steps.hpp"
#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include <future>
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

    // Parse each step's bytecode/witness in parallel (thread-safe with msgpack format)
    parallel_for(steps.size(), [&](size_t i) {
        PrivateExecutionStepRaw step = std::move(steps[i]);

        acir_format::AcirFormat constraints = acir_format::circuit_buf_to_acir_format(std::move(step.bytecode));
        acir_format::WitnessVector witness = acir_format::witness_buf_to_witness_vector(std::move(step.witness));

        folding_stack[i] = { std::move(constraints), std::move(witness) };
        if (step.vk.empty()) {
            // For backwards compatibility, but it affects performance and correctness.
            precomputed_vks[i] = nullptr;
        } else {
            precomputed_vks[i] = from_buffer<std::shared_ptr<Chonk::MegaVerificationKey>>(step.vk);
        }
        function_names[i] = std::move(step.function_name);
    });
}

/**
 * @brief Build Phase A (non-recursion constraints) of a circuit on a background thread.
 * @details The builder is constructed with a null op_queue — any attempt to emit goblin ECC ops
 * during Phase A will trip a BB_ASSERT in queue_ecc_* at the access site, making the "non-recursion
 * constraints don't touch the op_queue" contract load-bearing rather than implicit. The real
 * op_queue is installed later via builder.attach_op_queue in complete_phase_b.
 */
static std::future<MegaCircuitBuilder> build_phase_a_async(acir_format::AcirProgram& program)
{
    return std::async(std::launch::async, [&program]() {
        // Prevent accidental parallel_for from creating a second thread pool on this thread
        set_parallel_for_concurrency(1);

        MegaCircuitBuilder builder{
            /*op_queue_in=*/nullptr, program.witness, program.constraints.public_inputs, /*is_write_vk_mode=*/false
        };
        acir_format::build_non_recursion_constraints(builder, program.constraints, acir_format::ProgramMetadata{});

        return builder;
    });
}

/**
 * @brief Complete a pre-constructed builder: attach the real op_queue and build recursion constraints.
 * @details Must be called after the previous circuit's accumulate (which includes prove_merge)
 * has completed, ensuring the op_queue's current_subtable is empty.
 */
static void complete_phase_b(MegaCircuitBuilder& builder,
                             acir_format::AcirFormat& constraints,
                             const acir_format::ProgramMetadata& metadata)
{
    builder.attach_op_queue(metadata.ivc->get_goblin().op_queue);
    acir_format::build_recursion_and_finalize_constraints(builder, constraints, metadata);
}

std::shared_ptr<Chonk> PrivateExecutionSteps::accumulate()
{
    auto ivc = std::make_shared<Chonk>(/*num_circuits=*/folding_stack.size());

    const acir_format::ProgramMetadata metadata{ ivc };

    for (auto& vk : precomputed_vks) {
        if (vk == nullptr) {
            info("DEPRECATED: Precomputed VKs expected for the given circuits.");
            break;
        }
    }

    const size_t num_circuits = folding_stack.size();
    std::future<MegaCircuitBuilder> next_circuit_future;

    for (size_t i = 0; i < num_circuits; i++) {
        MegaCircuitBuilder circuit = [&]() {
            if (next_circuit_future.valid()) {
                // Phase A was done in background; complete Phase B now that IVC state is available
                auto builder = next_circuit_future.get();
                complete_phase_b(builder, folding_stack[i].constraints, metadata);
                return builder;
            }
            // First circuit or pipeline disabled: construct fully on the main thread
            return acir_format::create_circuit<MegaCircuitBuilder>(folding_stack[i], metadata);
        }();

        // Start Phase A of the next circuit in the background during this circuit's accumulate
        if (i + 1 < num_circuits) {
            next_circuit_future = build_phase_a_async(folding_stack[i + 1]);
        }

        info("Chonk: accumulating ", function_names[i]);
        ivc->accumulate(circuit, precomputed_vks[i]);
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
