#include "barretenberg/bbapi/bbapi_chonk.hpp"
#include "barretenberg/bbapi/bbapi_handlers.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/bbapi/bbapi_wire_convert.hpp"
#include "barretenberg/bbapi/generated/bb_types.hpp"
#include "barretenberg/chonk/chonk_verifier.hpp"
#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/chonk/proof_compression.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/common/bb_bench.hpp"
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

#ifndef __wasm__
#include <cerrno>
#include <chrono>
#include <csignal>
#include <cstring>
#include <fcntl.h>
#include <sys/stat.h>
#include <thread>
#include <unistd.h>
#endif

namespace bb::bbapi {

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

wire::ChonkStartResponse handle_chonk_start(BBApiRequest& request, wire::ChonkStart&& cmd)
{
    BB_BENCH_NAME("ChonkStart");

    request.ivc_in_progress = std::make_shared<Chonk>(cmd.num_circuits);
    request.ivc_stack_depth = 0;

    // Clear any stale loaded-circuit state from a previous session so that
    // ChonkAccumulate cannot silently reuse a circuit loaded before this ChonkStart.
    request.loaded_circuit_name.clear();
    request.loaded_circuit_constraints.reset();
    request.loaded_circuit_vk.clear();

    return {};
}

wire::ChonkLoadResponse handle_chonk_load(BBApiRequest& request, wire::ChonkLoad&& cmd)
{
    BB_BENCH_NAME("ChonkLoad");
    if (!request.ivc_in_progress) {
        throw_or_abort("Chonk not started. Call ChonkStart first.");
    }

    request.loaded_circuit_name = cmd.circuit.name;
    request.loaded_circuit_constraints = acir_format::circuit_buf_to_acir_format(std::move(cmd.circuit.bytecode));
    request.loaded_circuit_vk = cmd.circuit.verification_key;

    info("ChonkLoad - loaded circuit '", request.loaded_circuit_name, "'");
    return {};
}

wire::ChonkAccumulateResponse handle_chonk_accumulate(BBApiRequest& request, wire::ChonkAccumulate&& cmd)
{
    BB_BENCH_NAME("ChonkAccumulate");
    if (!request.ivc_in_progress) {
        throw_or_abort("Chonk not started. Call ChonkStart first.");
    }
    if (!request.loaded_circuit_constraints.has_value()) {
        throw_or_abort("No circuit loaded. Call ChonkLoad first.");
    }

    acir_format::WitnessVector witness_data = acir_format::witness_buf_to_witness_vector(std::move(cmd.witness));
    acir_format::AcirProgram program{ std::move(request.loaded_circuit_constraints.value()), std::move(witness_data) };

    // Clear loaded state immediately after moving out of it. This ensures that
    // if any subsequent step throws, the request won't appear to still have a
    // valid circuit loaded.
    auto loaded_vk = std::move(request.loaded_circuit_vk);
    auto circuit_name = std::move(request.loaded_circuit_name);
    request.loaded_circuit_constraints.reset();
    request.loaded_circuit_vk.clear();
    request.loaded_circuit_name.clear();

    // The hiding kernel is definitionally the last circuit in the IVC stack.
    auto chonk = std::dynamic_pointer_cast<Chonk>(request.ivc_in_progress);
    const bool is_hiding_kernel = (request.ivc_stack_depth + 1 == chonk->get_num_circuits());

    const acir_format::ProgramMetadata metadata{ .ivc = request.ivc_in_progress };
    auto circuit = acir_format::create_circuit<IVCBase::ClientCircuit>(program, metadata);

    std::shared_ptr<Chonk::MegaVerificationKey> precomputed_vk;
    if (request.vk_policy == VkPolicy::RECOMPUTE) {
        precomputed_vk = nullptr;
    } else if (request.vk_policy == VkPolicy::DEFAULT || request.vk_policy == VkPolicy::CHECK) {
        if (!loaded_vk.empty()) {
            validate_vk_size<Chonk::MegaVerificationKey>(loaded_vk);
            precomputed_vk = from_buffer<std::shared_ptr<Chonk::MegaVerificationKey>>(loaded_vk);

            if (request.vk_policy == VkPolicy::CHECK) {
                // MegaZKVerificationKey and MegaVerificationKey share the same
                // C++ type, but their contents differ between ZK and non-ZK flavors.
                auto computed_vk = is_hiding_kernel ? std::make_shared<Chonk::MegaVerificationKey>(
                                                          Chonk::HidingKernelProverInstance(circuit).get_precomputed())
                                                    : std::make_shared<Chonk::MegaVerificationKey>(
                                                          Chonk::ProverInstance(circuit).get_precomputed());
                if (*precomputed_vk != *computed_vk) {
                    throw_or_abort("VK check failed for circuit '" + circuit_name +
                                   "': provided VK does not match computed VK");
                }
            }
        }
    } else {
        throw_or_abort("Invalid VK policy. Valid options: default, check, recompute");
    }

    info("ChonkAccumulate - accumulating circuit '", circuit_name, "'");
    if (detail::use_memory_profile) {
        detail::GLOBAL_MEMORY_PROFILE.set_circuit_name(circuit_name);
    }
    request.ivc_in_progress->accumulate(circuit, precomputed_vk);
    request.ivc_stack_depth++;
    return {};
}

wire::ChonkProveResponse handle_chonk_prove(BBApiRequest& request, wire::ChonkProve&& /*cmd*/)
{
    BB_BENCH_NAME("ChonkProve");
    if (!request.ivc_in_progress) {
        throw_or_abort("Chonk not started. Call ChonkStart first.");
    }
    if (request.ivc_stack_depth == 0) {
        throw_or_abort("No circuits accumulated. Call ChonkAccumulate first.");
    }

    info("ChonkProve - generating proof for ", request.ivc_stack_depth, " accumulated circuits");

    info("ChonkProve - using Chonk");
    auto chonk = std::dynamic_pointer_cast<Chonk>(request.ivc_in_progress);
    auto proof = chonk->prove();
    auto vk_and_hash = chonk->get_hiding_kernel_vk_and_hash();

    // Verify here so failures surface at proof production time rather than
    // later in the transaction lifecycle.
    info("ChonkProve - verifying the generated proof as a sanity check");
    ChonkNativeVerifier verifier(vk_and_hash);
    bool verification_passed = verifier.verify(proof);
    if (!verification_passed) {
        throw_or_abort("Failed to verify the generated proof!");
    }

    request.ivc_in_progress.reset();
    request.ivc_stack_depth = 0;
    return { .proof = chonk_proof_to_wire(proof) };
}

wire::ChonkVerifyResponse handle_chonk_verify(BBApiRequest& /*request*/, wire::ChonkVerify&& cmd)
{
    BB_BENCH_NAME("ChonkVerify");

    try {
        using VerificationKey = Chonk::MegaVerificationKey;
        if (!has_expected_vk_size<VerificationKey>(cmd.vk, "ChonkVerify")) {
            return { .valid = false };
        }

        auto hiding_kernel_vk = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(cmd.vk));
        auto proof = chonk_proof_from_wire(std::move(cmd.proof));

        // The proof contains public inputs followed by the fixed-size proof body.
        const size_t expected_proof_size =
            static_cast<size_t>(hiding_kernel_vk->num_public_inputs) + ChonkProof::PROOF_LENGTH_WITHOUT_PUB_INPUTS;
        if (proof.size() != expected_proof_size) {
            info("ChonkVerify: proof has wrong size: expected ", expected_proof_size, ", got ", proof.size());
            return { .valid = false };
        }

        auto vk_and_hash = std::make_shared<ChonkNativeVerifier::VKAndHash>(hiding_kernel_vk);
        ChonkNativeVerifier verifier(vk_and_hash);
        return { .valid = verifier.verify(proof) };
    } catch (const std::exception& e) {
        info("ChonkVerify: malformed input: ", BBAPI_CHONK_EXCEPTION_WHAT(e));
        return { .valid = false };
    } catch (...) {
        info("ChonkVerify: malformed input: unknown exception");
        return { .valid = false };
    }
}

wire::ChonkVerifyFromFieldsResponse handle_chonk_verify_from_fields(BBApiRequest& /*request*/,
                                                                    wire::ChonkVerifyFromFields&& cmd)
{
    BB_BENCH_NAME("ChonkVerifyFromFields");

    try {
        using VerificationKey = Chonk::MegaVerificationKey;
        if (!has_expected_vk_size<VerificationKey>(cmd.vk, "ChonkVerifyFromFields")) {
            return { .valid = false };
        }

        auto hiding_kernel_vk = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(cmd.vk));
        auto proof = fr_vec_from_wire(cmd.proof);

        // The field array contains public inputs followed by the fixed-size proof body.
        const size_t expected_field_count =
            static_cast<size_t>(hiding_kernel_vk->num_public_inputs) + ChonkProof::PROOF_LENGTH_WITHOUT_PUB_INPUTS;
        if (proof.size() != expected_field_count) {
            info("ChonkVerifyFromFields: proof has wrong field count: expected ",
                 expected_field_count,
                 ", got ",
                 proof.size());
            return { .valid = false };
        }

        // Layout knowledge stays here rather than leaking to callers.
        auto structured = ChonkProof::from_field_elements(proof);

        auto vk_and_hash = std::make_shared<ChonkNativeVerifier::VKAndHash>(hiding_kernel_vk);
        ChonkNativeVerifier verifier(vk_and_hash);
        return { .valid = verifier.verify(structured) };
    } catch (const std::exception& e) {
        info("ChonkVerifyFromFields: malformed input: ", BBAPI_CHONK_EXCEPTION_WHAT(e));
        return { .valid = false };
    } catch (...) {
        info("ChonkVerifyFromFields: malformed input: unknown exception");
        return { .valid = false };
    }
}

wire::ChonkBatchVerifyResponse handle_chonk_batch_verify(BBApiRequest& /*request*/, wire::ChonkBatchVerify&& cmd)
{
    BB_BENCH_NAME("ChonkBatchVerify");

    try {
        if (cmd.proofs.size() != cmd.vks.size()) {
            info("ChonkBatchVerify: proofs.size() (", cmd.proofs.size(), ") != vks.size() (", cmd.vks.size(), ")");
            return { .valid = false };
        }
        if (cmd.proofs.empty()) {
            info("ChonkBatchVerify: no proofs provided");
            return { .valid = false };
        }

        using VerificationKey = Chonk::MegaVerificationKey;

        std::vector<OpeningClaim<curve::Grumpkin>> ipa_claims;
        std::vector<std::shared_ptr<NativeTranscript>> ipa_transcripts;
        ipa_claims.reserve(cmd.proofs.size());
        ipa_transcripts.reserve(cmd.proofs.size());

        auto proofs = chonk_proof_vec_from_wire(std::move(cmd.proofs));
        for (size_t i = 0; i < proofs.size(); ++i) {
            if (!has_expected_vk_size<VerificationKey>(cmd.vks[i], "ChonkBatchVerify")) {
                return { .valid = false };
            }
            auto hiding_kernel_vk = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(cmd.vks[i]));

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
            auto result = verifier.reduce_to_ipa_claim(std::move(proofs[i]));
            if (!result.all_checks_passed) {
                return { .valid = false };
            }
            ipa_claims.push_back(std::move(result.ipa_claim));
            ipa_transcripts.push_back(std::make_shared<NativeTranscript>(std::move(result.ipa_proof)));
        }

        auto ipa_vk = VerifierCommitmentKey<curve::Grumpkin>{ ECCVMFlavor::ECCVM_FIXED_SIZE };
        return { .valid = IPA<curve::Grumpkin>::batch_reduce_verify(ipa_vk, ipa_claims, ipa_transcripts) };
    } catch (const std::exception& e) {
        info("ChonkBatchVerify: malformed input: ", BBAPI_CHONK_EXCEPTION_WHAT(e));
        return { .valid = false };
    } catch (...) {
        info("ChonkBatchVerify: malformed input: unknown exception");
        return { .valid = false };
    }
}

namespace {
std::shared_ptr<Chonk::MegaVerificationKey> compute_chonk_vk_from_program(acir_format::AcirProgram& program,
                                                                          bool use_zk_flavor)
{
    Chonk::ClientCircuit builder = acir_format::create_circuit<Chonk::ClientCircuit>(program);
    if (use_zk_flavor) {
        return std::make_shared<Chonk::MegaVerificationKey>(
            Chonk::HidingKernelProverInstance(builder).get_precomputed());
    }
    return std::make_shared<Chonk::MegaVerificationKey>(Chonk::ProverInstance(builder).get_precomputed());
}
} // namespace

wire::ChonkComputeVkResponse handle_chonk_compute_vk(BBApiRequest& /*request*/, wire::ChonkComputeVk&& cmd)
{
    BB_BENCH_NAME("ChonkComputeVk");
    info("ChonkComputeVk - deriving MegaVerificationKey for circuit '",
         cmd.circuit.name,
         "'",
         cmd.use_zk_flavor ? " (MegaZK)" : "");

    auto constraint_system = acir_format::circuit_buf_to_acir_format(std::move(cmd.circuit.bytecode));
    acir_format::AcirProgram program{ constraint_system, /*witness=*/{} };
    auto verification_key = compute_chonk_vk_from_program(program, cmd.use_zk_flavor);

    info("ChonkComputeVk - VK derived, size: ", to_buffer(*verification_key).size(), " bytes");

    return { .bytes = to_buffer(*verification_key), .fields = fr_vec_to_wire(verification_key->to_field_elements()) };
}

wire::ChonkCheckPrecomputedVkResponse handle_chonk_check_precomputed_vk(BBApiRequest& /*request*/,
                                                                        wire::ChonkCheckPrecomputedVk&& cmd)
{
    BB_BENCH_NAME("ChonkCheckPrecomputedVk");
    acir_format::AcirProgram program{ acir_format::circuit_buf_to_acir_format(std::move(cmd.circuit.bytecode)),
                                      /*witness=*/{} };
    auto computed_vk = compute_chonk_vk_from_program(program, cmd.use_zk_flavor);

    if (cmd.circuit.verification_key.empty()) {
        info("FAIL: Expected precomputed vk for function ", cmd.circuit.name);
        throw_or_abort("Missing precomputed VK");
    }

    validate_vk_size<Chonk::MegaVerificationKey>(cmd.circuit.verification_key);
    auto precomputed_vk = from_buffer<std::shared_ptr<Chonk::MegaVerificationKey>>(cmd.circuit.verification_key);

    wire::ChonkCheckPrecomputedVkResponse response;
    response.valid = true;
    if (*computed_vk != *precomputed_vk) {
        response.valid = false;
        response.actual_vk = to_buffer(computed_vk);
    }
    return response;
}

wire::ChonkStatsResponse handle_chonk_stats(BBApiRequest& /*request*/, wire::ChonkStats&& cmd)
{
    BB_BENCH_NAME("ChonkStats");

    const auto constraint_system = acir_format::circuit_buf_to_acir_format(std::move(cmd.circuit.bytecode));
    acir_format::AcirProgram program{ constraint_system, {} };
    const auto& ivc_constraints = constraint_system.hn_recursion_constraints;

    acir_format::ProgramMetadata metadata{
        .ivc = ivc_constraints.empty() ? nullptr : acir_format::create_mock_chonk_from_constraints(ivc_constraints),
        .collect_gates_per_opcode = cmd.include_gates_per_opcode
    };

    auto builder = acir_format::create_circuit<MegaCircuitBuilder>(program, metadata);
    builder.finalize_circuit();

    wire::ChonkStatsResponse response;
    response.acir_opcodes = program.constraints.num_acir_opcodes;
    response.circuit_size = static_cast<uint32_t>(builder.num_gates());
    if (cmd.include_gates_per_opcode) {
        response.gates_per_opcode = std::vector<uint32_t>(program.constraints.gates_per_opcode.begin(),
                                                          program.constraints.gates_per_opcode.end());
    }

    info("ChonkStats - circuit: ",
         cmd.circuit.name,
         ", acir_opcodes: ",
         response.acir_opcodes,
         ", circuit_size: ",
         response.circuit_size);
    builder.blocks.summarize();
    return response;
}

wire::ChonkCompressProofResponse handle_chonk_compress_proof(BBApiRequest& /*request*/, wire::ChonkCompressProof&& cmd)
{
    BB_BENCH_NAME("ChonkCompressProof");
    auto proof = chonk_proof_from_wire(std::move(cmd.proof));
    return { .compressed_proof = ProofCompressor::compress_chonk_proof(proof) };
}

wire::ChonkDecompressProofResponse handle_chonk_decompress_proof(BBApiRequest& /*request*/,
                                                                 wire::ChonkDecompressProof&& cmd)
{
    BB_BENCH_NAME("ChonkDecompressProof");
    size_t mega_num_pub = ProofCompressor::compressed_mega_num_public_inputs(cmd.compressed_proof.size());
    auto proof = ProofCompressor::decompress_chonk_proof(cmd.compressed_proof, mega_num_pub);
    return { .proof = chonk_proof_to_wire(proof) };
}

// ── Batch Verifier Service ──────────────────────────────────────────────────

#ifndef __wasm__

namespace {

bool write_all(int fd, const uint8_t* ptr, size_t len)
{
    while (len > 0) {
        const ssize_t written = ::write(fd, ptr, len);
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

    (void)std::signal(SIGPIPE, SIG_IGN);
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

    struct stat statbuf;
    if (lstat(fifo_path_.c_str(), &statbuf) != 0) {
        info("ChonkBatchVerifierService: failed to stat FIFO '", fifo_path_, "': ", std::strerror(errno));
        return false;
    }
    if (!S_ISFIFO(statbuf.st_mode)) {
        info("ChonkBatchVerifierService: result path is not a FIFO: ", fifo_path_);
        return false;
    }

    for (size_t attempt = 0; attempt < 100; ++attempt) {
        fifo_fd_ = open(fifo_path_.c_str(), O_WRONLY | O_NONBLOCK | O_CLOEXEC | O_NOFOLLOW);
        if (fifo_fd_ >= 0) {
            struct stat opened_statbuf;
            if (fstat(fifo_fd_, &opened_statbuf) != 0 || !S_ISFIFO(opened_statbuf.st_mode)) {
                info("ChonkBatchVerifierService: opened result path is not a FIFO: ", fifo_path_);
                close(fifo_fd_);
                fifo_fd_ = -1;
                return false;
            }
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

// ── Batch Verifier RPC Commands ─────────────────────────────────────────────

wire::ChonkBatchVerifierStartResponse handle_chonk_batch_verifier_start(BBApiRequest& request,
                                                                        wire::ChonkBatchVerifierStart&& cmd)
{
    if (request.batch_verifier_service && request.batch_verifier_service->is_running()) {
        throw_or_abort("ChonkBatchVerifierStart: service already running. Call ChonkBatchVerifierStop first.");
    }

    using VerificationKey = Chonk::MegaVerificationKey;

    std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> parsed_vks;
    parsed_vks.reserve(cmd.vks.size());

    for (size_t i = 0; i < cmd.vks.size(); ++i) {
        validate_vk_size<VerificationKey>(cmd.vks[i]);
        auto vk = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(cmd.vks[i]));
        parsed_vks.push_back(std::make_shared<MegaZKFlavor::VKAndHash>(vk));
    }

    request.batch_verifier_service = std::make_shared<ChonkBatchVerifierService>();
    request.batch_verifier_service->start(std::move(parsed_vks), cmd.num_cores, cmd.batch_size, cmd.fifo_path);
    return {};
}

wire::ChonkBatchVerifierQueueResponse handle_chonk_batch_verifier_queue(BBApiRequest& request,
                                                                        wire::ChonkBatchVerifierQueue&& cmd)
{
    if (!request.batch_verifier_service || !request.batch_verifier_service->is_running()) {
        throw_or_abort("ChonkBatchVerifierQueue: service not running. Call ChonkBatchVerifierStart first.");
    }

    ChonkProof proof;
    try {
        proof = ChonkProof::from_field_elements(fr_vec_from_wire(cmd.proof_fields));
    } catch (const std::exception& e) {
        request.batch_verifier_service->fail_request(cmd.request_id,
                                                     std::string("malformed proof fields: ") + e.what());
        return {};
    } catch (...) {
        request.batch_verifier_service->fail_request(cmd.request_id, "malformed proof fields: unknown exception");
        return {};
    }

    try {
        request.batch_verifier_service->enqueue(VerifyRequest{
            .request_id = cmd.request_id,
            .vk_index = cmd.vk_index,
            .proof = std::move(proof),
        });
    } catch (const std::exception& e) {
        request.batch_verifier_service->fail_request(cmd.request_id, e.what());
    } catch (...) {
        request.batch_verifier_service->fail_request(cmd.request_id, "failed to enqueue proof: unknown exception");
    }

    return {};
}

wire::ChonkBatchVerifierStopResponse handle_chonk_batch_verifier_stop(BBApiRequest& request,
                                                                      wire::ChonkBatchVerifierStop&& /*cmd*/)
{
    if (!request.batch_verifier_service || !request.batch_verifier_service->is_running()) {
        throw_or_abort("ChonkBatchVerifierStop: service not running.");
    }

    request.batch_verifier_service->stop();
    request.batch_verifier_service.reset();
    return {};
}

#else // __wasm__

wire::ChonkBatchVerifierStartResponse handle_chonk_batch_verifier_start(BBApiRequest& /*request*/,
                                                                        wire::ChonkBatchVerifierStart&& /*cmd*/)
{
    throw_or_abort("ChonkBatchVerifierStart is not supported in WASM builds");
}

wire::ChonkBatchVerifierQueueResponse handle_chonk_batch_verifier_queue(BBApiRequest& /*request*/,
                                                                        wire::ChonkBatchVerifierQueue&& /*cmd*/)
{
    throw_or_abort("ChonkBatchVerifierQueue is not supported in WASM builds");
}

wire::ChonkBatchVerifierStopResponse handle_chonk_batch_verifier_stop(BBApiRequest& /*request*/,
                                                                      wire::ChonkBatchVerifierStop&& /*cmd*/)
{
    throw_or_abort("ChonkBatchVerifierStop is not supported in WASM builds");
}

#endif // __wasm__

#undef BBAPI_CHONK_EXCEPTION_WHAT

} // namespace bb::bbapi
