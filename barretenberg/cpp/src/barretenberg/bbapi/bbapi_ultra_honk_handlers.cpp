/**
 * @file bbapi_ultra_honk_handlers.cpp
 * @brief Wire adapters for the UltraHonk circuit commands: convert generated
 * wire structs to the domain command structs, run `execute()`, convert back.
 */
#include "barretenberg/bbapi/bbapi_handlers.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/bbapi/bbapi_ultra_honk.hpp"
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

ProofSystemSettings settings_from_wire(wire::ProofSystemSettings&& w)
{
    return { .ipa_accumulation = w.ipa_accumulation,
             .oracle_hash_type = std::move(w.oracle_hash_type),
             .disable_zk = w.disable_zk,
             .optimized_solidity_verifier = w.optimized_solidity_verifier };
}

wire::VkData vk_data_to_wire(CircuitComputeVk::Response&& r)
{
    return { .bytes = std::move(r.bytes), .fields = uint256_vec_to_wire(r.fields), .hash = std::move(r.hash) };
}

} // namespace

void handle_circuit_prove(BBApiRequest& ctx,
                          wire::BbCircuitProve&& cmd,
                          Responder<wire::BbCircuitProveResponse> respond)
{
    auto r = CircuitProve{ .circuit = circuit_input_from_wire(std::move(cmd.circuit)),
                           .witness = std::move(cmd.witness),
                           .settings = settings_from_wire(std::move(cmd.settings)) }
                 .execute(ctx);
    respond.ok({ .public_inputs = uint256_vec_to_wire(r.public_inputs),
                 .proof = uint256_vec_to_wire(r.proof),
                 .vk = vk_data_to_wire(std::move(r.vk)) });
}

void handle_circuit_compute_vk(BBApiRequest& ctx,
                               wire::BbCircuitComputeVk&& cmd,
                               Responder<wire::BbCircuitComputeVkResponse> respond)
{
    auto r = CircuitComputeVk{ .circuit = circuit_input_no_vk_from_wire(std::move(cmd.circuit)),
                               .settings = settings_from_wire(std::move(cmd.settings)) }
                 .execute(ctx);
    respond.ok({ .bytes = std::move(r.bytes), .fields = uint256_vec_to_wire(r.fields), .hash = std::move(r.hash) });
}

void handle_circuit_stats(BBApiRequest& ctx,
                          wire::BbCircuitStats&& cmd,
                          Responder<wire::BbCircuitStatsResponse> respond)
{
    auto r = CircuitStats{ .circuit = circuit_input_from_wire(std::move(cmd.circuit)),
                           .include_gates_per_opcode = cmd.include_gates_per_opcode,
                           .settings = settings_from_wire(std::move(cmd.settings)) }
                 .execute(ctx);
    respond.ok({ .num_gates = r.num_gates,
                 .num_gates_dyadic = r.num_gates_dyadic,
                 .num_acir_opcodes = r.num_acir_opcodes,
                 .gates_per_opcode = std::move(r.gates_per_opcode) });
}

void handle_circuit_verify(BBApiRequest& ctx,
                           wire::BbCircuitVerify&& cmd,
                           Responder<wire::BbCircuitVerifyResponse> respond)
{
    auto r = CircuitVerify{ .verification_key = std::move(cmd.verification_key),
                            .public_inputs = uint256_vec_from_wire(cmd.public_inputs),
                            .proof = uint256_vec_from_wire(cmd.proof),
                            .settings = settings_from_wire(std::move(cmd.settings)) }
                 .execute(ctx);
    respond.ok({ .verified = r.verified });
}

void handle_vk_as_fields(BBApiRequest& ctx, wire::BbVkAsFields&& cmd, Responder<wire::BbVkAsFieldsResponse> respond)
{
    auto r = VkAsFields{ .verification_key = std::move(cmd.verification_key) }.execute(ctx);
    respond.ok({ .fields = fr_vec_to_wire(r.fields) });
}

void handle_mega_vk_as_fields(BBApiRequest& ctx,
                              wire::BbMegaVkAsFields&& cmd,
                              Responder<wire::BbMegaVkAsFieldsResponse> respond)
{
    auto r = MegaVkAsFields{ .verification_key = std::move(cmd.verification_key) }.execute(ctx);
    respond.ok({ .fields = fr_vec_to_wire(r.fields) });
}

void handle_mega_app_vk_as_fields(BBApiRequest& ctx,
                                  wire::BbMegaAppVkAsFields&& cmd,
                                  Responder<wire::BbMegaAppVkAsFieldsResponse> respond)
{
    auto r = MegaAppVkAsFields{ .verification_key = std::move(cmd.verification_key) }.execute(ctx);
    respond.ok({ .fields = fr_vec_to_wire(r.fields) });
}

void handle_mega_kernel_vk_as_fields(BBApiRequest& ctx,
                                     wire::BbMegaKernelVkAsFields&& cmd,
                                     Responder<wire::BbMegaKernelVkAsFieldsResponse> respond)
{
    auto r = MegaKernelVkAsFields{ .verification_key = std::move(cmd.verification_key) }.execute(ctx);
    respond.ok({ .fields = fr_vec_to_wire(r.fields) });
}

void handle_mega_z_k_vk_as_fields(BBApiRequest& ctx,
                                  wire::BbMegaZKVkAsFields&& cmd,
                                  Responder<wire::BbMegaZKVkAsFieldsResponse> respond)
{
    auto r = MegaZKVkAsFields{ .verification_key = std::move(cmd.verification_key) }.execute(ctx);
    respond.ok({ .fields = fr_vec_to_wire(r.fields) });
}

void handle_circuit_write_solidity_verifier(BBApiRequest& ctx,
                                            wire::BbCircuitWriteSolidityVerifier&& cmd,
                                            Responder<wire::BbCircuitWriteSolidityVerifierResponse> respond)
{
    auto r = CircuitWriteSolidityVerifier{ .verification_key = std::move(cmd.verification_key),
                                           .settings = settings_from_wire(std::move(cmd.settings)) }
                 .execute(ctx);
    respond.ok({ .solidity_code = std::move(r.solidity_code) });
}

} // namespace bb::bbapi
