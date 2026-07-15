#include "barretenberg/bbapi/bbapi_chonk.hpp"
#include "barretenberg/chonk/chonk_step_processor.hpp"
#include "barretenberg/chonk/chonk_verifier.hpp"
#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/chonk/proof_compression.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/memory_profile.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/hypernova_recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/serde/witness_stack.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/serialize/msgpack_check_eq.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"

#ifdef BB_HAS_BATCH_VERIFIER_SERVICE
#include <algorithm>
#include <cerrno>
#include <chrono>
#include <climits>
#include <csignal>
#include <cstring>
#include <fcntl.h>
#include <limits>
#include <sys/stat.h>
#include <thread>
#include <unistd.h>
#endif

namespace bb::bbapi {
namespace {

ChonkPrecomputedVkPolicy to_chonk_vk_policy(VkPolicy policy)
{
    switch (policy) {
    case VkPolicy::DEFAULT:
        return ChonkPrecomputedVkPolicy::DEFAULT;
    case VkPolicy::CHECK:
        return ChonkPrecomputedVkPolicy::CHECK;
    case VkPolicy::RECOMPUTE:
        return ChonkPrecomputedVkPolicy::RECOMPUTE;
    case VkPolicy::REWRITE:
        break;
    }
    throw_or_abort("Invalid VK policy. Valid options: default, check, recompute");
}

} // namespace

// BB_NO_EXCEPTIONS rewrites catch blocks away; handlers must not depend on catch bindings.
#ifndef BB_NO_EXCEPTIONS
#define BBAPI_CHONK_EXCEPTION_WHAT(exception) (exception).what()
#else
#define BBAPI_CHONK_EXCEPTION_WHAT(exception) "unknown exception"
#endif

template <typename VerificationKey> bool has_expected_vk_size(const std::vector<uint8_t>& vk_bytes, const char* label)
{
    const size_t expected_size = VerificationKey::calc_num_data_types() * sizeof(bb::fr);
    if (vk_bytes.size() == expected_size) {
        return true;
    }
    // Wasm builds cannot catch throw_or_abort from validate_vk_size.
    info(label, ": verification key has wrong size: expected ", expected_size, ", got ", vk_bytes.size());
    return false;
}

ChonkStart::Response ChonkStart::execute(BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);

    request.ivc_in_progress = std::make_shared<ChonkStepProcessor>(std::move(kinds));

    // Clear any stale loaded-circuit state from a previous session so that
    // ChonkAccumulate cannot silently reuse a circuit loaded before this ChonkStart.
    request.loaded_circuit_name.clear();
    request.loaded_circuit_constraints.reset();
    request.loaded_circuit_vk.clear();
    request.loaded_circuit_kind = CircuitKind::App;

    return Response{};
}

ChonkLoad::Response ChonkLoad::execute(BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    if (!request.ivc_in_progress) {
        throw_or_abort("Chonk not started. Call ChonkStart first.");
    }

    auto constraints = acir_format::circuit_buf_to_mega_acir_format(std::move(circuit.bytecode));

    request.loaded_circuit_name = std::move(circuit.name);
    request.loaded_circuit_constraints = std::move(constraints);
    request.loaded_circuit_vk = std::move(circuit.verification_key);
    request.loaded_circuit_kind = kind;

    info("ChonkLoad - loaded circuit '", request.loaded_circuit_name, "'");

    return Response{};
}

ChonkAccumulate::Response ChonkAccumulate::execute(BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    if (!request.ivc_in_progress) {
        throw_or_abort("Chonk not started. Call ChonkStart first.");
    }

    if (!request.loaded_circuit_constraints.has_value()) {
        throw_or_abort("No circuit loaded. Call ChonkLoad first.");
    }

    acir_format::WitnessVector witness_data = acir_format::witness_buf_to_witness_vector(std::move(witness));
    acir_format::AcirProgram program{ std::move(request.loaded_circuit_constraints.value()), std::move(witness_data) };

    // Clear loaded state immediately after moving out of it. This ensures that if any subsequent
    // step throws, the request won't appear to still have a valid circuit loaded (the optional
    // would be in a moved-from state, which is technically has_value()==true but poisoned).
    auto loaded_vk = std::move(request.loaded_circuit_vk);
    auto circuit_name = std::move(request.loaded_circuit_name);
    const CircuitKind loaded_kind = request.loaded_circuit_kind;
    request.loaded_circuit_constraints.reset();
    request.loaded_circuit_vk.clear();
    request.loaded_circuit_name.clear();
    request.loaded_circuit_kind = CircuitKind::App;

    request.ivc_in_progress->process_step({ .name = std::move(circuit_name),
                                            .program = std::move(program),
                                            .precomputed_vk = std::move(loaded_vk),
                                            .kind = loaded_kind },
                                          to_chonk_vk_policy(request.vk_policy));

    return Response{};
}

ChonkProve::Response ChonkProve::execute(BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    if (!request.ivc_in_progress) {
        throw_or_abort("Chonk not started. Call ChonkStart first.");
    }

    const size_t num_circuits_accumulated = request.ivc_in_progress->get_num_circuits_accumulated();
    if (num_circuits_accumulated == 0) {
        throw_or_abort("No circuits accumulated. Call ChonkAccumulate first.");
    }

    info("ChonkProve - generating proof for ", num_circuits_accumulated, " accumulated circuits");

    auto proof = request.ivc_in_progress->prove();
    auto vk_and_hash = request.ivc_in_progress->get_hiding_kernel_vk_and_hash();

    // Sanity-check the freshly produced proof in-process. A separate `bb verify` call would
    // re-load VK/proof/SRS and surface failures far from the proving site.
    info("ChonkProve - verifying the generated proof as a sanity check");
    ChonkNativeVerifier verifier(vk_and_hash);
    if (!verifier.verify(proof)) {
        throw_or_abort("Failed to verify the generated proof!");
    }

    request.ivc_in_progress.reset();

    return Response{ .proof = std::move(proof) };
}

ChonkVerify::Response ChonkVerify::execute(const BBApiRequest& /*request*/) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);

    try {
        using VerificationKey = Chonk::MegaZKVerificationKey;
        if (!has_expected_vk_size<VerificationKey>(vk, "ChonkVerify")) {
            return { .valid = false };
        }

        // Deserialize the hiding kernel verification key directly from buffer
        auto hiding_kernel_vk = deserialize_chonk_vk(vk);

        // Validate total proof size: must match num_public_inputs + fixed overhead
        const size_t expected_proof_size =
            static_cast<size_t>(hiding_kernel_vk->num_public_inputs) + ChonkProof::PROOF_LENGTH_WITHOUT_PUB_INPUTS;
        if (proof.size() != expected_proof_size) {
            info("ChonkVerify: proof has wrong size: expected ", expected_proof_size, ", got ", proof.size());
            return { .valid = false };
        }

        // Verify the proof using ChonkNativeVerifier
        auto vk_and_hash = std::make_shared<ChonkNativeVerifier::VKAndHash>(hiding_kernel_vk);
        ChonkNativeVerifier verifier(vk_and_hash);
        const bool verified = verifier.verify(proof);

        return { .valid = verified };
    } catch (const std::exception& e) {
        info("ChonkVerify: malformed input: ", BBAPI_CHONK_EXCEPTION_WHAT(e));
        return { .valid = false };
    } catch (...) {
        info("ChonkVerify: malformed input: unknown exception");
        return { .valid = false };
    }
}

ChonkVerifyFromFields::Response ChonkVerifyFromFields::execute(const BBApiRequest& /*request*/) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);

    try {
        using VerificationKey = Chonk::MegaZKVerificationKey;
        if (!has_expected_vk_size<VerificationKey>(vk, "ChonkVerifyFromFields")) {
            return { .valid = false };
        }

        // The hiding kernel uses MegaZKFlavor's VK shape (distinct C++ type from MegaFlavor's VK).
        auto hiding_kernel_vk = deserialize_chonk_vk(vk);

        // Validate total field count: must match num_public_inputs + fixed overhead.
        const size_t expected_field_count =
            static_cast<size_t>(hiding_kernel_vk->num_public_inputs) + ChonkProof::PROOF_LENGTH_WITHOUT_PUB_INPUTS;
        if (proof.size() != expected_field_count) {
            info("ChonkVerifyFromFields: proof has wrong field count: expected ",
                 expected_field_count,
                 ", got ",
                 proof.size());
            return { .valid = false };
        }

        // Split the flat field array into the structured ChonkProof. Layout knowledge stays here.
        auto structured = ChonkProof::from_field_elements(proof);

        auto vk_and_hash = std::make_shared<ChonkNativeVerifier::VKAndHash>(hiding_kernel_vk);
        ChonkNativeVerifier verifier(vk_and_hash);
        const bool verified = verifier.verify(structured);

        return { .valid = verified };
    } catch (const std::exception& e) {
        info("ChonkVerifyFromFields: malformed input: ", BBAPI_CHONK_EXCEPTION_WHAT(e));
        return { .valid = false };
    } catch (...) {
        info("ChonkVerifyFromFields: malformed input: unknown exception");
        return { .valid = false };
    }
}

ChonkBatchVerify::Response ChonkBatchVerify::execute(const BBApiRequest& /*request*/) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);

    try {
        if (proofs.size() != vks.size()) {
            info("ChonkBatchVerify: proofs.size() (", proofs.size(), ") != vks.size() (", vks.size(), ")");
            return { .valid = false };
        }
        if (proofs.empty()) {
            info("ChonkBatchVerify: no proofs provided");
            return { .valid = false };
        }

        using VerificationKey = Chonk::MegaZKVerificationKey;

        // Phase 1: Run all non-IPA verification for each proof, collecting deferred TripleIPA claims and proofs.
        std::vector<bb::ChonkNativeVerifier::TripleIpaReductionResult> reduced_results;
        reduced_results.reserve(proofs.size());

        for (size_t i = 0; i < proofs.size(); ++i) {
            if (!has_expected_vk_size<VerificationKey>(vks[i], "ChonkBatchVerify")) {
                return { .valid = false };
            }
            auto hiding_kernel_vk = deserialize_chonk_vk(vks[i]);

            const size_t expected_proof_size =
                static_cast<size_t>(hiding_kernel_vk->num_public_inputs) + ChonkProof::PROOF_LENGTH_WITHOUT_PUB_INPUTS;
            if (proofs[i].size() != expected_proof_size) {
                info("ChonkBatchVerify: proof[",
                     i,
                     "] has wrong size: expected ",
                     expected_proof_size,
                     ", got ",
                     proofs[i].size());
                return { .valid = false };
            }

            auto vk_and_hash = std::make_shared<ChonkNativeVerifier::VKAndHash>(hiding_kernel_vk);
            ChonkNativeVerifier verifier(vk_and_hash);
            auto result = verifier.reduce_to_triple_ipa_opening(std::move(proofs[i]));
            if (!result.all_checks_passed) {
                return { .valid = false };
            }
            reduced_results.push_back(std::move(result));
        }

        // Phase 2: Reduce all deferred TripleIPA claims to accumulators and discharge them with one combined SRS-MSM.
        std::vector<bb::ECCVMVerifier::DeferredTripleIpaOpening::Accumulator> ipa_accumulators;
        ipa_accumulators.reserve(reduced_results.size());
        for (const auto& result : reduced_results) {
            ipa_accumulators.push_back(result.triple_ipa_opening.reduce_to_accumulator());
        }
        const bool verified = bb::ECCVMVerifier::batch_verify_accumulators(ipa_accumulators);

        return { .valid = verified };
    } catch (const std::exception& e) {
        info("ChonkBatchVerify: malformed input: ", BBAPI_CHONK_EXCEPTION_WHAT(e));
        return { .valid = false };
    } catch (...) {
        info("ChonkBatchVerify: malformed input: unknown exception");
        return { .valid = false };
    }
}

ChonkComputeVk::Response ChonkComputeVk::execute([[maybe_unused]] const BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    info("ChonkComputeVk - deriving Chonk verification key for circuit '",
         circuit.name,
         "' (kind=",
         static_cast<int>(kind),
         ")");

    auto constraint_system = acir_format::circuit_buf_to_mega_acir_format(std::move(circuit.bytecode));

    acir_format::AcirProgram program{ constraint_system, /*witness=*/{} };
    auto verification_key = compute_chonk_vk(program, kind);
    info("ChonkComputeVk - VK derived, size: ", verification_key.bytes.size(), " bytes");
    return { .bytes = std::move(verification_key.bytes), .fields = std::move(verification_key.fields) };
}

ChonkCheckPrecomputedVk::Response ChonkCheckPrecomputedVk::execute([[maybe_unused]] const BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    acir_format::AcirProgram program{ acir_format::circuit_buf_to_mega_acir_format(std::move(circuit.bytecode)),
                                      /*witness=*/{} };

    if (circuit.verification_key.empty()) {
        info("FAIL: Expected precomputed vk for function ", circuit.name);
        throw_or_abort("Missing precomputed VK");
    }

    Response response;
    auto check = check_precomputed_chonk_vk(program, circuit.verification_key, kind);
    response.valid = check.valid;
    response.actual_vk = std::move(check.actual_vk);
    return response;
}

ChonkStats::Response ChonkStats::execute([[maybe_unused]] BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    Response response;

    const auto constraint_system = acir_format::circuit_buf_to_mega_acir_format(std::move(circuit.bytecode));
    acir_format::AcirProgram program{ constraint_system, {} };

    // Get IVC constraints if any
    const auto& ivc_constraints = constraint_system.hn_recursion_constraints;

    // Create metadata with appropriate IVC context
    acir_format::ProgramMetadata metadata{
        .ivc = ivc_constraints.empty() ? nullptr : acir_format::create_mock_chonk_from_constraints(ivc_constraints),
        .collect_gates_per_opcode = include_gates_per_opcode
    };

    // Create and finalize circuit
    auto builder = acir_format::create_circuit<MegaCircuitBuilder>(program, metadata);
    builder.finalize_circuit();

    // Set response values
    response.acir_opcodes = program.constraints.num_acir_opcodes;
    response.circuit_size = static_cast<uint32_t>(builder.num_gates());

    // Optionally include gates per opcode
    if (include_gates_per_opcode) {
        response.gates_per_opcode = std::vector<uint32_t>(program.constraints.gates_per_opcode.begin(),
                                                          program.constraints.gates_per_opcode.end());
    }

    // Log circuit details
    info("ChonkStats - circuit: ",
         circuit.name,
         ", acir_opcodes: ",
         response.acir_opcodes,
         ", circuit_size: ",
         response.circuit_size);

    // Print execution trace details
    builder.blocks.summarize();

    return response;
}

ChonkCompressProof::Response ChonkCompressProof::execute(const BBApiRequest& /*request*/) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    return { .compressed_proof = ProofCompressor::compress_chonk_proof(proof) };
}

ChonkDecompressProof::Response ChonkDecompressProof::execute(const BBApiRequest& /*request*/) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    size_t mega_num_pub = ProofCompressor::compressed_mega_num_public_inputs(compressed_proof.size());
    return { .proof = ProofCompressor::decompress_chonk_proof(compressed_proof, mega_num_pub) };
}

// ── Batch Verifier Service ──────────────────────────────────────────────────

#ifdef BB_HAS_BATCH_VERIFIER_SERVICE

namespace {

bool write_all(int fd, const uint8_t* ptr, size_t len)
{
    while (len > 0) {
        // ::write takes a size_t count on POSIX but an unsigned int on Windows (MinGW _write), so cap each
        // call to INT_MAX and cast explicitly to keep the count in range and the return value representable.
        const auto chunk = static_cast<unsigned int>(std::min(len, static_cast<size_t>(INT_MAX)));
        const ssize_t written = ::write(fd, ptr, chunk);
        if (written > 0) {
            ptr += written;
            len -= static_cast<size_t>(written);
            continue;
        }
        if (written < 0 && errno == EINTR) {
            continue;
        }
        if (written < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
            continue;
        }
        return false;
    }
    return true;
}

/**
 * @brief Write a length-delimited frame to a file descriptor.
 *
 * Wire format: [4-byte big-endian payload length][payload bytes].
 */
bool write_frame(int fd, const void* data, size_t len)
{
    if (len > UINT32_MAX) {
        return false;
    }
    auto len32 = static_cast<uint32_t>(len);
    std::vector<uint8_t> header = {
        static_cast<uint8_t>((len32 >> 24) & 0xFF),
        static_cast<uint8_t>((len32 >> 16) & 0xFF),
        static_cast<uint8_t>((len32 >> 8) & 0xFF),
        static_cast<uint8_t>(len32 & 0xFF),
    };

    return write_all(fd, header.data(), header.size()) && write_all(fd, reinterpret_cast<const uint8_t*>(data), len);
}

} // namespace

void ChonkBatchVerifierService::start(std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks,
                                      uint32_t num_cores,
                                      uint32_t batch_size,
                                      const std::string& fifo_path)
{
    bool expected = false;
    if (!running_.compare_exchange_strong(expected, true)) {
        throw_or_abort("ChonkBatchVerifierService: already running");
    }

    if (num_cores == 0) {
        num_cores = static_cast<uint32_t>(std::thread::hardware_concurrency());
        if (num_cores == 0) {
            num_cores = 1;
        }
    }

#ifdef SIGPIPE
    (void)std::signal(SIGPIPE, SIG_IGN);
#endif
    fifo_path_ = fifo_path;
    fifo_failed_.store(false);

    try {
        verifier_.start(
            std::move(vks), num_cores, batch_size, [this](VerifyResult result) { write_result(std::move(result)); });
    } catch (...) {
        running_.store(false);
        throw;
    }

    info("ChonkBatchVerifierService started, fifo=", fifo_path);
}

void ChonkBatchVerifierService::enqueue(VerifyRequest request)
{
    if (fifo_failed_.load()) {
        throw_or_abort("ChonkBatchVerifierService: result FIFO failed");
    }
    verifier_.enqueue(std::move(request));
}

void ChonkBatchVerifierService::fail_request(uint64_t request_id, std::string error_message)
{
    write_result(VerifyResult::failed(request_id, std::move(error_message)));
}

void ChonkBatchVerifierService::stop()
{
    if (!running_.exchange(false)) {
        return;
    }

    // Stop the processor first; callbacks synchronously write remaining results.
    verifier_.stop();

    {
        std::lock_guard lock(fifo_mutex_);
        close_fifo_locked();
        fifo_path_.clear();
    }

    info("ChonkBatchVerifierService stopped");
}

ChonkBatchVerifierService::~ChonkBatchVerifierService()
{
    if (running_.load()) {
        stop();
    }
}

bool ChonkBatchVerifierService::ensure_fifo_open()
{
    if (fifo_fd_ >= 0) {
        return true;
    }
    if (fifo_path_.empty()) {
        return false;
    }

#ifndef _WIN32
    struct stat statbuf;
    if (lstat(fifo_path_.c_str(), &statbuf) != 0) {
        info("ChonkBatchVerifierService: failed to stat FIFO '", fifo_path_, "': ", std::strerror(errno));
        return false;
    }
    if (!S_ISFIFO(statbuf.st_mode)) {
        info("ChonkBatchVerifierService: result path is not a FIFO: ", fifo_path_);
        return false;
    }
#endif

    for (size_t attempt = 0; attempt < 100; ++attempt) {
#ifndef _WIN32
        fifo_fd_ = open(fifo_path_.c_str(), O_WRONLY | O_NONBLOCK | O_CLOEXEC | O_NOFOLLOW);
#else
        fifo_fd_ = open(fifo_path_.c_str(), O_WRONLY);
#endif
        if (fifo_fd_ >= 0) {
#ifndef _WIN32
            struct stat opened_statbuf;
            if (fstat(fifo_fd_, &opened_statbuf) != 0 || !S_ISFIFO(opened_statbuf.st_mode)) {
                info("ChonkBatchVerifierService: opened result path is not a FIFO: ", fifo_path_);
                close(fifo_fd_);
                fifo_fd_ = -1;
                return false;
            }
#endif
            return true;
        }
        if (errno != ENXIO && errno != EINTR) {
            info("ChonkBatchVerifierService: failed to open FIFO '", fifo_path_, "': ", std::strerror(errno));
            return false;
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
    info("ChonkBatchVerifierService: no FIFO reader connected for '", fifo_path_, "'");
    return false;
}

void ChonkBatchVerifierService::close_fifo_locked()
{
    if (fifo_fd_ >= 0) {
        close(fifo_fd_);
        fifo_fd_ = -1;
    }
}

bool ChonkBatchVerifierService::fail_fifo_locked(const std::string& message)
{
    if (!fifo_failed_.exchange(true)) {
        // A fatal result path cannot report per-request failure; close it so readers fail the batch.
        info("ChonkBatchVerifierService: ", message);
    }
    close_fifo_locked();
    fifo_path_.clear();
    return false;
}

bool ChonkBatchVerifierService::write_result(VerifyResult result)
{
    msgpack::sbuffer buf;
    msgpack::pack(buf, result);

    std::lock_guard lock(fifo_mutex_);
    if (fifo_failed_.load()) {
        return false;
    }
    if (!ensure_fifo_open()) {
        return fail_fifo_locked("result FIFO unavailable");
    }

    if (!write_frame(fifo_fd_, buf.data(), buf.size())) {
        return fail_fifo_locked(std::string("FIFO write failed: ") + std::strerror(errno));
    }
    return true;
}

ChonkBatchVerifierStart::Response ChonkBatchVerifierStart::execute(BBApiRequest& request) &&
{
    if (request.batch_verifier_service && request.batch_verifier_service->is_running()) {
        throw_or_abort("ChonkBatchVerifierStart: service already running. Call ChonkBatchVerifierStop first.");
    }

    std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> parsed_vks;
    parsed_vks.reserve(vks.size());

    for (size_t i = 0; i < vks.size(); ++i) {
        parsed_vks.push_back(deserialize_chonk_vk_and_hash(vks[i]));
    }

    request.batch_verifier_service = std::make_shared<ChonkBatchVerifierService>();
    request.batch_verifier_service->start(std::move(parsed_vks), num_cores, batch_size, fifo_path);
    return {};
}

// Queue commands report per-request failures through the result FIFO; throwing loses the request id.
ChonkBatchVerifierQueue::Response ChonkBatchVerifierQueue::execute(BBApiRequest& request) &&
{
    if (!request.batch_verifier_service || !request.batch_verifier_service->is_running()) {
        throw_or_abort("ChonkBatchVerifierQueue: service not running. Call ChonkBatchVerifierStart first.");
    }

    ChonkProof proof;
    try {
        proof = ChonkProof::from_field_elements(proof_fields);
    } catch (const std::exception& e) {
        request.batch_verifier_service->fail_request(request_id, std::string("malformed proof fields: ") + e.what());
        return {};
    } catch (...) {
        request.batch_verifier_service->fail_request(request_id, "malformed proof fields: unknown exception");
        return {};
    }

    try {
        request.batch_verifier_service->enqueue(VerifyRequest{
            .request_id = request_id,
            .vk_index = vk_index,
            .proof = std::move(proof),
        });
    } catch (const std::exception& e) {
        request.batch_verifier_service->fail_request(request_id, e.what());
    } catch (...) {
        request.batch_verifier_service->fail_request(request_id, "failed to enqueue proof: unknown exception");
    }

    return {};
}

ChonkBatchVerifierStop::Response ChonkBatchVerifierStop::execute(BBApiRequest& request) &&
{
    if (!request.batch_verifier_service || !request.batch_verifier_service->is_running()) {
        throw_or_abort("ChonkBatchVerifierStop: service not running.");
    }

    request.batch_verifier_service->stop();
    request.batch_verifier_service.reset();
    return {};
}

#else // BB_HAS_BATCH_VERIFIER_SERVICE

ChonkBatchVerifierStart::Response ChonkBatchVerifierStart::execute(BBApiRequest& /*request*/) &&
{
    throw_or_abort("ChonkBatchVerifierStart is not supported on this platform (wasm/Windows)");
}

ChonkBatchVerifierQueue::Response ChonkBatchVerifierQueue::execute(BBApiRequest& /*request*/) &&
{
    throw_or_abort("ChonkBatchVerifierQueue is not supported on this platform (wasm/Windows)");
}

ChonkBatchVerifierStop::Response ChonkBatchVerifierStop::execute(BBApiRequest& /*request*/) &&
{
    throw_or_abort("ChonkBatchVerifierStop is not supported on this platform (wasm/Windows)");
}

#endif // BB_HAS_BATCH_VERIFIER_SERVICE

#undef BBAPI_CHONK_EXCEPTION_WHAT

} // namespace bb::bbapi
