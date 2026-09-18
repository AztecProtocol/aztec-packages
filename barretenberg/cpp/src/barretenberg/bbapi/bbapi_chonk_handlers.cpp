/**
 * @file bbapi_chonk_handlers.cpp
 * @brief Wire adapters for the Chonk commands: convert generated wire structs
 * to the domain command structs, run `execute()`, convert the response back.
 */
#include "barretenberg/bbapi/bbapi_chonk.hpp"
#include "barretenberg/bbapi/bbapi_handlers.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/bbapi/bbapi_wire_convert.hpp"

namespace bb::bbapi {

namespace {

CircuitInput circuit_input_from_wire(wire::CircuitInput&& w)
{
    return { .name = std::move(w.name),
             .bytecode = std::move(w.bytecode),
             .verification_key = std::move(w.verification_key) };
}

CircuitInputNoVK circuit_input_no_vk_from_wire(wire::CircuitInputNoVK&& w)
{
    return { .name = std::move(w.name), .bytecode = std::move(w.bytecode) };
}

CircuitKind circuit_kind_from_wire(uint8_t kind)
{
    return static_cast<CircuitKind>(kind);
}

} // namespace

void handle_chonk_start(BBApiRequest& ctx, wire::BbChonkStart&& cmd, Responder<wire::BbChonkStartResponse> respond)
{
    std::vector<CircuitKind> kinds;
    kinds.reserve(cmd.kinds.size());
    for (uint8_t k : cmd.kinds) {
        kinds.push_back(circuit_kind_from_wire(k));
    }
    ChonkStart{ .kinds = std::move(kinds) }.execute(ctx);
    respond.ok({});
}

void handle_chonk_load(BBApiRequest& ctx, wire::BbChonkLoad&& cmd, Responder<wire::BbChonkLoadResponse> respond)
{
    ChonkLoad{ .circuit = circuit_input_from_wire(std::move(cmd.circuit)), .kind = circuit_kind_from_wire(cmd.kind) }
        .execute(ctx);
    respond.ok({});
}

void handle_chonk_accumulate(BBApiRequest& ctx,
                             wire::BbChonkAccumulate&& cmd,
                             Responder<wire::BbChonkAccumulateResponse> respond)
{
    ChonkAccumulate{ .witness = std::move(cmd.witness) }.execute(ctx);
    respond.ok({});
}

void handle_chonk_prove(BBApiRequest& ctx, wire::BbChonkProve&& /*cmd*/, Responder<wire::BbChonkProveResponse> respond)
{
    auto r = ChonkProve{}.execute(ctx);
    respond.ok({ .proof = chonk_proof_to_wire(r.proof) });
}

void handle_chonk_verify(BBApiRequest& ctx, wire::BbChonkVerify&& cmd, Responder<wire::BbChonkVerifyResponse> respond)
{
    auto r = ChonkVerify{ .proof = chonk_proof_from_wire(std::move(cmd.proof)), .vk = std::move(cmd.vk) }.execute(ctx);
    respond.ok({ .valid = r.valid });
}

void handle_chonk_verify_from_fields(BBApiRequest& ctx,
                                     wire::BbChonkVerifyFromFields&& cmd,
                                     Responder<wire::BbChonkVerifyFromFieldsResponse> respond)
{
    auto r = ChonkVerifyFromFields{ .proof = fr_vec_from_wire(cmd.proof), .vk = std::move(cmd.vk) }.execute(ctx);
    respond.ok({ .valid = r.valid });
}

void handle_chonk_compute_vk(BBApiRequest& ctx,
                             wire::BbChonkComputeVk&& cmd,
                             Responder<wire::BbChonkComputeVkResponse> respond)
{
    auto r = ChonkComputeVk{ .circuit = circuit_input_no_vk_from_wire(std::move(cmd.circuit)),
                             .kind = circuit_kind_from_wire(cmd.kind) }
                 .execute(ctx);
    respond.ok({ .bytes = std::move(r.bytes), .fields = fr_vec_to_wire(r.fields) });
}

void handle_chonk_check_precomputed_vk(BBApiRequest& ctx,
                                       wire::BbChonkCheckPrecomputedVk&& cmd,
                                       Responder<wire::BbChonkCheckPrecomputedVkResponse> respond)
{
    auto r = ChonkCheckPrecomputedVk{ .circuit = circuit_input_from_wire(std::move(cmd.circuit)),
                                      .kind = circuit_kind_from_wire(cmd.kind) }
                 .execute(ctx);
    respond.ok({ .valid = r.valid, .actual_vk = std::move(r.actual_vk) });
}

void handle_chonk_stats(BBApiRequest& ctx, wire::BbChonkStats&& cmd, Responder<wire::BbChonkStatsResponse> respond)
{
    auto r = ChonkStats{ .circuit = circuit_input_no_vk_from_wire(std::move(cmd.circuit)),
                         .include_gates_per_opcode = cmd.include_gates_per_opcode }
                 .execute(ctx);
    respond.ok({ .acir_opcodes = r.acir_opcodes,
                 .circuit_size = r.circuit_size,
                 .gates_per_opcode = std::move(r.gates_per_opcode) });
}

void handle_chonk_batch_verify(BBApiRequest& ctx,
                               wire::BbChonkBatchVerify&& cmd,
                               Responder<wire::BbChonkBatchVerifyResponse> respond)
{
    std::vector<ChonkProof> proofs;
    proofs.reserve(cmd.proofs.size());
    for (auto& p : cmd.proofs) {
        proofs.push_back(chonk_proof_from_wire(std::move(p)));
    }
    auto r = ChonkBatchVerify{ .proofs = std::move(proofs), .vks = std::move(cmd.vks) }.execute(ctx);
    respond.ok({ .valid = r.valid });
}

void handle_chonk_compress_proof(BBApiRequest& ctx,
                                 wire::BbChonkCompressProof&& cmd,
                                 Responder<wire::BbChonkCompressProofResponse> respond)
{
    auto r = ChonkCompressProof{ .proof = chonk_proof_from_wire(std::move(cmd.proof)) }.execute(ctx);
    respond.ok({ .compressed_proof = std::move(r.compressed_proof) });
}

void handle_chonk_decompress_proof(BBApiRequest& ctx,
                                   wire::BbChonkDecompressProof&& cmd,
                                   Responder<wire::BbChonkDecompressProofResponse> respond)
{
    auto r = ChonkDecompressProof{ .compressed_proof = std::move(cmd.compressed_proof) }.execute(ctx);
    respond.ok({ .proof = chonk_proof_to_wire(r.proof) });
}

void handle_chonk_batch_verifier_start(BBApiRequest& ctx,
                                       wire::BbChonkBatchVerifierStart&& cmd,
                                       Responder<wire::BbChonkBatchVerifierStartResponse> respond)
{
    ChonkBatchVerifierStart{ .vks = std::move(cmd.vks),
                             .num_cores = cmd.num_cores,
                             .batch_size = cmd.batch_size,
                             .fifo_path = std::move(cmd.fifo_path) }
        .execute(ctx);
    respond.ok({});
}

void handle_chonk_batch_verifier_queue(BBApiRequest& ctx,
                                       wire::BbChonkBatchVerifierQueue&& cmd,
                                       Responder<wire::BbChonkBatchVerifierQueueResponse> respond)
{
    ChonkBatchVerifierQueue{ .request_id = cmd.request_id,
                             .vk_index = cmd.vk_index,
                             .proof_fields = fr_vec_from_wire(cmd.proof_fields) }
        .execute(ctx);
    respond.ok({});
}

void handle_chonk_batch_verifier_stop(BBApiRequest& ctx,
                                      wire::BbChonkBatchVerifierStop&& /*cmd*/,
                                      Responder<wire::BbChonkBatchVerifierStopResponse> respond)
{
    ChonkBatchVerifierStop{}.execute(ctx);
    respond.ok({});
}

} // namespace bb::bbapi
