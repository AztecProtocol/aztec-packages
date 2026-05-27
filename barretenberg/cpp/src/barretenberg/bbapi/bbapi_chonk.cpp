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
#include <fcntl.h>
#include <unistd.h>
#endif

namespace bb::bbapi {

wire::ChonkStartResponse handle_chonk_start(BBApiRequest& request, wire::ChonkStart&& cmd)
{
    BB_BENCH_NAME("ChonkStart");

    request.ivc_in_progress = std::make_shared<Chonk>(cmd.num_circuits);
    request.ivc_stack_depth = 0;

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

    auto loaded_vk = std::move(request.loaded_circuit_vk);
    auto circuit_name = std::move(request.loaded_circuit_name);
    request.loaded_circuit_constraints.reset();
    request.loaded_circuit_vk.clear();
    request.loaded_circuit_name.clear();

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

    using VerificationKey = Chonk::MegaVerificationKey;
    validate_vk_size<VerificationKey>(cmd.vk);

    auto hiding_kernel_vk = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(cmd.vk));
    auto proof = chonk_proof_from_wire(std::move(cmd.proof));

    const size_t expected_proof_size =
        static_cast<size_t>(hiding_kernel_vk->num_public_inputs) + ChonkProof::PROOF_LENGTH_WITHOUT_PUB_INPUTS;
    if (proof.size() != expected_proof_size) {
        throw_or_abort("ChonkVerify: proof has wrong size: expected " + std::to_string(expected_proof_size) + ", got " +
                       std::to_string(proof.size()));
    }

    auto vk_and_hash = std::make_shared<ChonkNativeVerifier::VKAndHash>(hiding_kernel_vk);
    ChonkNativeVerifier verifier(vk_and_hash);
    return { .valid = verifier.verify(proof) };
}

wire::ChonkVerifyFromFieldsResponse handle_chonk_verify_from_fields(BBApiRequest& /*request*/,
                                                                    wire::ChonkVerifyFromFields&& cmd)
{
    BB_BENCH_NAME("ChonkVerifyFromFields");

    using VerificationKey = Chonk::MegaVerificationKey;
    validate_vk_size<VerificationKey>(cmd.vk);

    auto hiding_kernel_vk = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(cmd.vk));
    auto proof = fr_vec_from_wire(cmd.proof);

    const size_t expected_field_count =
        static_cast<size_t>(hiding_kernel_vk->num_public_inputs) + ChonkProof::PROOF_LENGTH_WITHOUT_PUB_INPUTS;
    if (proof.size() != expected_field_count) {
        throw_or_abort("ChonkVerifyFromFields: proof has wrong field count: expected " +
                       std::to_string(expected_field_count) + ", got " + std::to_string(proof.size()));
    }

    auto structured = ChonkProof::from_field_elements(proof);

    auto vk_and_hash = std::make_shared<ChonkNativeVerifier::VKAndHash>(hiding_kernel_vk);
    ChonkNativeVerifier verifier(vk_and_hash);
    return { .valid = verifier.verify(structured) };
}

wire::ChonkBatchVerifyResponse handle_chonk_batch_verify(BBApiRequest& /*request*/, wire::ChonkBatchVerify&& cmd)
{
    BB_BENCH_NAME("ChonkBatchVerify");

    if (cmd.proofs.size() != cmd.vks.size()) {
        throw_or_abort("ChonkBatchVerify: proofs.size() (" + std::to_string(cmd.proofs.size()) + ") != vks.size() (" +
                       std::to_string(cmd.vks.size()) + ")");
    }
    if (cmd.proofs.empty()) {
        throw_or_abort("ChonkBatchVerify: no proofs provided");
    }

    using VerificationKey = Chonk::MegaVerificationKey;

    std::vector<OpeningClaim<curve::Grumpkin>> ipa_claims;
    std::vector<std::shared_ptr<NativeTranscript>> ipa_transcripts;
    ipa_claims.reserve(cmd.proofs.size());
    ipa_transcripts.reserve(cmd.proofs.size());

    auto proofs = chonk_proof_vec_from_wire(std::move(cmd.proofs));
    for (size_t i = 0; i < proofs.size(); ++i) {
        validate_vk_size<VerificationKey>(cmd.vks[i]);
        auto hiding_kernel_vk = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(cmd.vks[i]));

        const size_t expected_proof_size =
            static_cast<size_t>(hiding_kernel_vk->num_public_inputs) + ChonkProof::PROOF_LENGTH_WITHOUT_PUB_INPUTS;
        if (proofs[i].size() != expected_proof_size) {
            throw_or_abort("ChonkBatchVerify: proof[" + std::to_string(i) + "] has wrong size: expected " +
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

    auto ipa_vk = VerifierCommitmentKey<curve::Grumpkin>{ ECCVMFlavor::ECCVM_FIXED_SIZE };
    return { .valid = IPA<curve::Grumpkin>::batch_reduce_verify(ipa_vk, ipa_claims, ipa_transcripts) };
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

    writer_thread_ = std::thread([this, path = fifo_path]() { writer_loop(path); });

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

    verifier_.stop();

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

    request.batch_verifier_service->enqueue(VerifyRequest{
        .request_id = cmd.request_id,
        .vk_index = cmd.vk_index,
        .proof = ChonkProof::from_field_elements(fr_vec_from_wire(cmd.proof_fields)),
    });
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

} // namespace bb::bbapi
