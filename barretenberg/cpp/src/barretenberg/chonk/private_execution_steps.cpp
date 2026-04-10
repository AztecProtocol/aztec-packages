// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "private_execution_steps.hpp"
#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include <condition_variable>
#include <future>
#include <libdeflate.h>
#include <malloc.h>
#include <mutex>
#include <thread>

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
 * @brief Persistent background worker for Phase A circuit construction.
 * @details Owns a single std::thread that lives for the duration of accumulate(). The thread sits
 * blocked on a condition_variable when no job is in flight, costing zero CPU. submit() hands a
 * single program to the worker and returns a future for its completed builder.
 *
 * Why a persistent thread instead of std::async: each std::async invocation spawns a fresh OS
 * thread, and glibc gives every new thread its own malloc arena. Allocations made on a background
 * thread that are later freed return to that thread's arena rather than the OS, so over an N-circuit
 * flow we accumulate up to N orphaned arenas of resident pages. A single persistent worker reuses
 * one arena across all Phase A invocations, making the memory cost deterministic at "one in-flight
 * builder" instead of growing with circuit count.
 *
 * Builds Phase A with a null op_queue — any stray queue_ecc_* call from a non-recursion constraint
 * trips a BB_ASSERT at the access site (see mega_circuit_builder.cpp). The real op_queue is
 * attached later via builder.attach_op_queue in complete_phase_b.
 */
class PhaseAWorker {
  public:
    PhaseAWorker()
        : worker_thread([this] { run(); })
    {}

    ~PhaseAWorker()
    {
        {
            std::lock_guard<std::mutex> lock(mtx);
            shutdown = true;
        }
        cv.notify_one();
        worker_thread.join();
    }

    PhaseAWorker(const PhaseAWorker&) = delete;
    PhaseAWorker& operator=(const PhaseAWorker&) = delete;
    PhaseAWorker(PhaseAWorker&&) = delete;
    PhaseAWorker& operator=(PhaseAWorker&&) = delete;

    std::future<MegaCircuitBuilder> submit(acir_format::AcirProgram& program)
    {
        std::promise<MegaCircuitBuilder> promise;
        auto future = promise.get_future();
        {
            std::lock_guard<std::mutex> lock(mtx);
            BB_ASSERT(!has_job, "PhaseAWorker::submit called while a job is already in flight");
            pending_program = &program;
            pending_promise = std::move(promise);
            has_job = true;
        }
        cv.notify_one();
        return future;
    }

  private:
    void run()
    {
        // Prevent accidental nested parallel_for on this thread from spawning its own pool.
        set_parallel_for_concurrency(1);
        for (;;) {
            std::unique_lock<std::mutex> lock(mtx);
            cv.wait(lock, [this] { return has_job || shutdown; });
            if (!has_job) {
                // shutdown requested with no pending job
                return;
            }
            acir_format::AcirProgram* program = pending_program;
            std::promise<MegaCircuitBuilder> promise = std::move(pending_promise);
            has_job = false;
            lock.unlock();

            try {
                MegaCircuitBuilder builder{ /*op_queue_in=*/nullptr,
                                            program->witness,
                                            program->constraints.public_inputs,
                                            /*is_write_vk_mode=*/false };
                acir_format::build_non_recursion_constraints(
                    builder, program->constraints, acir_format::ProgramMetadata{});
                promise.set_value(std::move(builder));
            } catch (...) {
                promise.set_exception(std::current_exception());
            }
        }
    }

    std::mutex mtx;
    std::condition_variable cv;
    acir_format::AcirProgram* pending_program = nullptr;
    std::promise<MegaCircuitBuilder> pending_promise;
    bool has_job = false;
    bool shutdown = false;
    // worker_thread must be the last data member so the rest of the state is initialized
    // before the thread function starts running.
    std::thread worker_thread;
};

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
    // Toggle: set NO_PIPELINE=1 to fall back to the unified main-thread construction path.
    // Used for A/B benchmarking the pipelined Phase A / Phase B split against the baseline.
    const bool pipeline_enabled = std::getenv("NO_PIPELINE") == nullptr;
    // One persistent worker for the duration of accumulate(); blocks on a condvar when idle.
    // See PhaseAWorker docstring for the rationale (deterministic memory vs std::async).
    PhaseAWorker phase_a_worker;
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
        if (pipeline_enabled && i + 1 < num_circuits) {
            next_circuit_future = phase_a_worker.submit(folding_stack[i + 1]);
        }

        info("Chonk: accumulating ", function_names[i]);
        ivc->accumulate(circuit, precomputed_vks[i]);

        // Return free pages to the OS so that allocator slack from this circuit doesn't
        // accumulate across iterations. Without this, glibc retains freed pages in its arenas,
        // and the pipelined path's cross-thread alloc/free pattern causes the slack to grow
        // by ~10s of MB per circuit. Trimming once per iteration keeps RSS close to the
        // structural floor (largest in-flight builder + IVC state).
        if (std::getenv("NO_TRIM") == nullptr) {
            // Return value indicates whether any memory was actually trimmed; we don't care.
            (void)malloc_trim(0);
        }
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
