#include "barretenberg/bbapi/bbapi_chonk.hpp"
#include "barretenberg/chonk/chonk_verifier.hpp"
#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/chonk/proof_compression.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/common/log.hpp"
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
#include <fcntl.h>
#include <unistd.h>
#endif

namespace bb::bbapi {

BbChonkStart::Response BbChonkStart::execute(BbRequest& request) &&
{
    BB_BENCH_NAME(__func__);

    request.ivc_in_progress = std::make_shared<Chonk>(num_circuits);

    request.ivc_stack_depth = 0;
    return Response{};
}

BbChonkLoad::Response BbChonkLoad::execute(BbRequest& request) &&
{
    BB_BENCH_NAME(__func__);
    if (!request.ivc_in_progress) {
        throw_or_abort("Chonk not started. Call BbChonkStart first.");
    }

    request.loaded_circuit_name = circuit.name;
    request.loaded_circuit_constraints = acir_format::circuit_buf_to_acir_format(std::move(circuit.bytecode));
    request.loaded_circuit_vk = circuit.verification_key;

    info("BbChonkLoad - loaded circuit '", request.loaded_circuit_name, "'");

    return Response{};
}

BbChonkAccumulate::Response BbChonkAccumulate::execute(BbRequest& request) &&
{
    BB_BENCH_NAME(__func__);
    if (!request.ivc_in_progress) {
        throw_or_abort("Chonk not started. Call BbChonkStart first.");
    }

    if (!request.loaded_circuit_constraints.has_value()) {
        throw_or_abort("No circuit loaded. Call BbChonkLoad first.");
    }

    acir_format::WitnessVector witness_data = acir_format::witness_buf_to_witness_vector(std::move(witness));
    acir_format::AcirProgram program{ std::move(request.loaded_circuit_constraints.value()), std::move(witness_data) };

    const acir_format::ProgramMetadata metadata{ .ivc = request.ivc_in_progress };
    auto circuit = acir_format::create_circuit<IVCBase::ClientCircuit>(program, metadata);

    std::shared_ptr<Chonk::MegaVerificationKey> precomputed_vk;

    if (request.vk_policy == VkPolicy::RECOMPUTE) {
        precomputed_vk = nullptr;
    } else if (request.vk_policy == VkPolicy::DEFAULT || request.vk_policy == VkPolicy::CHECK) {
        if (!request.loaded_circuit_vk.empty()) {
            validate_vk_size<Chonk::MegaVerificationKey>(request.loaded_circuit_vk);
            precomputed_vk = from_buffer<std::shared_ptr<Chonk::MegaVerificationKey>>(request.loaded_circuit_vk);

            if (request.vk_policy == VkPolicy::CHECK) {
                auto prover_instance = std::make_shared<Chonk::ProverInstance>(circuit);
                auto computed_vk = std::make_shared<Chonk::MegaVerificationKey>(prover_instance->get_precomputed());

                // Dereference to compare VK contents
                if (*precomputed_vk != *computed_vk) {
                    throw_or_abort("VK check failed for circuit '" + request.loaded_circuit_name +
                                   "': provided VK does not match computed VK");
                }
            }
        }
    } else {
        throw_or_abort("Invalid VK policy. Valid options: default, check, recompute");
    }

    info("BbChonkAccumulate - accumulating circuit '", request.loaded_circuit_name, "'");
    request.ivc_in_progress->accumulate(circuit, precomputed_vk);
    request.ivc_stack_depth++;

    request.loaded_circuit_constraints.reset();
    request.loaded_circuit_vk.clear();

    return Response{};
}

BbChonkProve::Response BbChonkProve::execute(BbRequest& request) &&
{
    BB_BENCH_NAME(__func__);
    if (!request.ivc_in_progress) {
        throw_or_abort("Chonk not started. Call BbChonkStart first.");
    }

    if (request.ivc_stack_depth == 0) {
        throw_or_abort("No circuits accumulated. Call BbChonkAccumulate first.");
    }

    info("BbChonkProve - generating proof for ", request.ivc_stack_depth, " accumulated circuits");

    // Call prove and verify using the appropriate IVC type
    Response response;
    bool verification_passed = false;

    info("BbChonkProve - using Chonk");
    auto chonk = std::dynamic_pointer_cast<Chonk>(request.ivc_in_progress);
    auto proof = chonk->prove();
    auto vk_and_hash = chonk->get_hiding_kernel_vk_and_hash();

    // We verify this proof. Another bb call to verify has some overhead of loading VK/proof/SRS,
    // and it is mysterious if this transaction fails later in the lifecycle.
    info("BbChonkProve - verifying the generated proof as a sanity check");
    ChonkNativeVerifier verifier(vk_and_hash);
    verification_passed = verifier.verify(proof);

    if (!verification_passed) {
        throw_or_abort("Failed to verify the generated proof!");
    }

    response.proof = std::move(proof);

    request.ivc_in_progress.reset();
    request.ivc_stack_depth = 0;

    return response;
}

BbChonkVerify::Response BbChonkVerify::execute(const BbRequest& /*request*/) &&
{
    BB_BENCH_NAME(__func__);

    using VerificationKey = Chonk::MegaVerificationKey;
    validate_vk_size<VerificationKey>(vk);

    // Deserialize the hiding kernel verification key directly from buffer
    auto hiding_kernel_vk = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(vk));

    // Validate total proof size: must match num_public_inputs + fixed overhead
    const size_t expected_proof_size =
        static_cast<size_t>(hiding_kernel_vk->num_public_inputs) + ChonkProof::PROOF_LENGTH_WITHOUT_PUB_INPUTS;
    if (proof.size() != expected_proof_size) {
        throw_or_abort("BbChonkVerify: proof has wrong size: expected " + std::to_string(expected_proof_size) +
                       ", got " + std::to_string(proof.size()));
    }

    // Verify the proof using ChonkNativeVerifier
    auto vk_and_hash = std::make_shared<ChonkNativeVerifier::VKAndHash>(hiding_kernel_vk);
    ChonkNativeVerifier verifier(vk_and_hash);
    const bool verified = verifier.verify(proof);

    return { .valid = verified };
}

BbChonkBatchVerify::Response BbChonkBatchVerify::execute(const BbRequest& /*request*/) &&
{
    BB_BENCH_NAME(__func__);

    if (proofs.size() != vks.size()) {
        throw_or_abort("BbChonkBatchVerify: proofs.size() (" + std::to_string(proofs.size()) + ") != vks.size() (" +
                       std::to_string(vks.size()) + ")");
    }
    if (proofs.empty()) {
        throw_or_abort("BbChonkBatchVerify: no proofs provided");
    }

    using VerificationKey = Chonk::MegaVerificationKey;

    // Phase 1: Run all non-IPA verification for each proof, collecting IPA claims
    std::vector<OpeningClaim<curve::Grumpkin>> ipa_claims;
    std::vector<std::shared_ptr<NativeTranscript>> ipa_transcripts;
    ipa_claims.reserve(proofs.size());
    ipa_transcripts.reserve(proofs.size());

    for (size_t i = 0; i < proofs.size(); ++i) {
        validate_vk_size<VerificationKey>(vks[i]);
        auto hiding_kernel_vk = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(vks[i]));

        const size_t expected_proof_size =
            static_cast<size_t>(hiding_kernel_vk->num_public_inputs) + ChonkProof::PROOF_LENGTH_WITHOUT_PUB_INPUTS;
        if (proofs[i].size() != expected_proof_size) {
            throw_or_abort("BbChonkBatchVerify: proof[" + std::to_string(i) + "] has wrong size: expected " +
                           std::to_string(expected_proof_size) + ", got " + std::to_string(proofs[i].size()));
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

    // Phase 2: Batch IPA verification with single SRS MSM
    auto ipa_vk = VerifierCommitmentKey<curve::Grumpkin>{ ECCVMFlavor::ECCVM_FIXED_SIZE };
    const bool verified = IPA<curve::Grumpkin>::batch_reduce_verify(ipa_vk, ipa_claims, ipa_transcripts);

    return { .valid = verified };
}

static std::shared_ptr<Chonk::ProverInstance> get_acir_program_prover_instance(acir_format::AcirProgram& program)
{
    Chonk::ClientCircuit builder = acir_format::create_circuit<Chonk::ClientCircuit>(program);

    // Construct the verification key via the prover-constructed proving key with the proper trace settings
    return std::make_shared<Chonk::ProverInstance>(builder);
}

BbChonkComputeVk::Response BbChonkComputeVk::execute([[maybe_unused]] const BbRequest& request) &&
{
    BB_BENCH_NAME(__func__);
    info("BbChonkComputeVk - deriving MegaVerificationKey for circuit '", circuit.name, "'");

    auto constraint_system = acir_format::circuit_buf_to_acir_format(std::move(circuit.bytecode));

    acir_format::AcirProgram program{ constraint_system, /*witness=*/{} };
    std::shared_ptr<Chonk::ProverInstance> prover_instance = get_acir_program_prover_instance(program);
    auto verification_key = std::make_shared<Chonk::MegaVerificationKey>(prover_instance->get_precomputed());

    info("BbChonkComputeVk - VK derived, size: ", to_buffer(*verification_key).size(), " bytes");

    return { .bytes = to_buffer(*verification_key), .fields = verification_key->to_field_elements() };
}

BbChonkCheckPrecomputedVk::Response BbChonkCheckPrecomputedVk::execute([[maybe_unused]] const BbRequest& request) &&
{
    BB_BENCH_NAME(__func__);
    acir_format::AcirProgram program{ acir_format::circuit_buf_to_acir_format(std::move(circuit.bytecode)),
                                      /*witness=*/{} };

    std::shared_ptr<Chonk::ProverInstance> prover_instance = get_acir_program_prover_instance(program);
    auto computed_vk = std::make_shared<Chonk::MegaVerificationKey>(prover_instance->get_precomputed());

    if (circuit.verification_key.empty()) {
        info("FAIL: Expected precomputed vk for function ", circuit.name);
        throw_or_abort("Missing precomputed VK");
    }

    validate_vk_size<Chonk::MegaVerificationKey>(circuit.verification_key);

    // Deserialize directly from buffer
    auto precomputed_vk = from_buffer<std::shared_ptr<Chonk::MegaVerificationKey>>(circuit.verification_key);

    Response response;
    response.valid = true;
    if (*computed_vk != *precomputed_vk) {
        response.valid = false;
        response.actual_vk = to_buffer(computed_vk);
    }
    return response;
}

BbChonkStats::Response BbChonkStats::execute([[maybe_unused]] BbRequest& request) &&
{
    BB_BENCH_NAME(__func__);
    Response response;

    const auto constraint_system = acir_format::circuit_buf_to_acir_format(std::move(circuit.bytecode));
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
    builder.finalize_circuit(/*ensure_nonzero=*/true);

    // Set response values
    response.acir_opcodes = program.constraints.num_acir_opcodes;
    response.circuit_size = static_cast<uint32_t>(builder.num_gates());

    // Optionally include gates per opcode
    if (include_gates_per_opcode) {
        response.gates_per_opcode = std::vector<uint32_t>(program.constraints.gates_per_opcode.begin(),
                                                          program.constraints.gates_per_opcode.end());
    }

    // Log circuit details
    info("BbChonkStats - circuit: ",
         circuit.name,
         ", acir_opcodes: ",
         response.acir_opcodes,
         ", circuit_size: ",
         response.circuit_size);

    // Print execution trace details
    builder.blocks.summarize();

    return response;
}

BbChonkCompressProof::Response BbChonkCompressProof::execute(const BbRequest& /*request*/) &&
{
    BB_BENCH_NAME(__func__);
    return { .compressed_proof = ProofCompressor::compress_chonk_proof(proof) };
}

BbChonkDecompressProof::Response BbChonkDecompressProof::execute(const BbRequest& /*request*/) &&
{
    BB_BENCH_NAME(__func__);
    size_t mega_num_pub = ProofCompressor::compressed_mega_num_public_inputs(compressed_proof.size());
    return { .proof = ProofCompressor::decompress_chonk_proof(compressed_proof, mega_num_pub) };
}

// ── Batch Verifier Service ──────────────────────────────────────────────────

#ifndef __wasm__

void ChonkBatchVerifierService::start(std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks,
                                      uint32_t num_cores,
                                      uint32_t batch_size,
                                      const std::string& fifo_path)
{
    if (running_) {
        info("ChonkBatchVerifierService: already running, ignoring start()");
        return;
    }

    if (num_cores == 0) {
        num_cores = static_cast<uint32_t>(std::thread::hardware_concurrency());
        if (num_cores == 0) {
            num_cores = 1;
        }
    }

    writer_shutdown_ = false;
    running_ = true;

    // Start the writer thread (opens the FIFO, drains result_queue_)
    writer_thread_ = std::thread([this, path = fifo_path]() { writer_loop(path); });

    // Start the batch processor with a callback that pushes to result_queue_
    verifier_.start(std::move(vks), num_cores, batch_size, [this](VerifyResult result) {
        {
            std::lock_guard lock(result_mutex_);
            result_queue_.push(std::move(result));
        }
        result_cv_.notify_one();
    });

    info("ChonkBatchVerifierService started, fifo=", fifo_path);
}

void ChonkBatchVerifierService::enqueue(VerifyRequest request)
{
    verifier_.enqueue(std::move(request));
}

void ChonkBatchVerifierService::stop()
{
    if (!running_) {
        return;
    }

    // Stop the processor first (flushes remaining proofs → result_queue_)
    verifier_.stop();

    // Signal the writer to drain and exit
    {
        std::lock_guard lock(result_mutex_);
        writer_shutdown_ = true;
    }
    result_cv_.notify_one();

    if (writer_thread_.joinable()) {
        writer_thread_.join();
    }

    running_ = false;
    info("ChonkBatchVerifierService stopped");
}

ChonkBatchVerifierService::~ChonkBatchVerifierService()
{
    if (running_) {
        stop();
    }
}

void ChonkBatchVerifierService::writer_loop(const std::string& fifo_path)
{
    // Open FIFO for writing (blocks until a reader connects)
    int fd = open(fifo_path.c_str(), O_WRONLY);
    if (fd < 0) {
        info("ChonkBatchVerifierService: failed to open FIFO '", fifo_path, "': ", strerror(errno));
        return;
    }

    while (true) {
        VerifyResult result;
        {
            std::unique_lock lock(result_mutex_);
            result_cv_.wait(lock, [this] { return writer_shutdown_ || !result_queue_.empty(); });

            if (!result_queue_.empty()) {
                result = std::move(result_queue_.front());
                result_queue_.pop();
            } else if (writer_shutdown_) {
                break;
            } else {
                continue;
            }
        }

        // Serialize to msgpack and write as a length-delimited frame
        msgpack::sbuffer buf;
        msgpack::pack(buf, result);

        if (!write_frame(fd, buf.data(), buf.size())) {
            info("ChonkBatchVerifierService: FIFO write failed, stopping writer");
            break;
        }
    }

    close(fd);
}

// ── Batch Verifier RPC Commands ─────────────────────────────────────────────

BbChonkBatchVerifierStart::Response BbChonkBatchVerifierStart::execute(BbRequest& request) &&
{
    if (request.batch_verifier_service && request.batch_verifier_service->is_running()) {
        throw_or_abort("BbChonkBatchVerifierStart: service already running. Call BbChonkBatchVerifierStop first.");
    }

    using VerificationKey = Chonk::MegaVerificationKey;

    std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> parsed_vks;
    parsed_vks.reserve(vks.size());

    for (size_t i = 0; i < vks.size(); ++i) {
        validate_vk_size<VerificationKey>(vks[i]);
        auto vk = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(vks[i]));
        parsed_vks.push_back(std::make_shared<MegaZKFlavor::VKAndHash>(vk));
    }

    request.batch_verifier_service = std::make_shared<ChonkBatchVerifierService>();
    request.batch_verifier_service->start(std::move(parsed_vks), num_cores, batch_size, fifo_path);
    return {};
}

BbChonkBatchVerifierQueue::Response BbChonkBatchVerifierQueue::execute(BbRequest& request) &&
{
    if (!request.batch_verifier_service || !request.batch_verifier_service->is_running()) {
        throw_or_abort("BbChonkBatchVerifierQueue: service not running. Call BbChonkBatchVerifierStart first.");
    }

    request.batch_verifier_service->enqueue(VerifyRequest{
        .request_id = request_id,
        .vk_index = vk_index,
        .proof = ChonkProof::from_field_elements(proof_fields),
    });

    return {};
}

BbChonkBatchVerifierStop::Response BbChonkBatchVerifierStop::execute(BbRequest& request) &&
{
    if (!request.batch_verifier_service || !request.batch_verifier_service->is_running()) {
        throw_or_abort("BbChonkBatchVerifierStop: service not running.");
    }

    request.batch_verifier_service->stop();
    request.batch_verifier_service.reset();
    return {};
}

#else // __wasm__

BbChonkBatchVerifierStart::Response BbChonkBatchVerifierStart::execute(BbRequest& /*request*/) &&
{
    throw_or_abort("BbChonkBatchVerifierStart is not supported in WASM builds");
}

BbChonkBatchVerifierQueue::Response BbChonkBatchVerifierQueue::execute(BbRequest& /*request*/) &&
{
    throw_or_abort("BbChonkBatchVerifierQueue is not supported in WASM builds");
}

BbChonkBatchVerifierStop::Response BbChonkBatchVerifierStop::execute(BbRequest& /*request*/) &&
{
    throw_or_abort("BbChonkBatchVerifierStop is not supported in WASM builds");
}

#endif // __wasm__

} // namespace bb::bbapi
