/**
 * @file bbapi_handlers.cpp
 * @brief Per-command handlers consumed by the codegen-emitted server dispatch.
 *
 * Each handler matches the signature declared by generated/bb_ipc_server.hpp
 * but as a non-template overload for `BBApiRequest` so
 * `make_bb_handler<BBApiRequest>` resolves to these via overload resolution.
 *
 * Every handler converts wire fields to domain fields, calls
 * `Cmd::execute()`, and converts the domain response back to wire fields —
 * all explicit, all field-by-field. The shared converters live in
 * `bbapi_wire_convert.hpp`.
 */
#include "barretenberg/bbapi/bbapi_handlers.hpp"
#include "barretenberg/api/api_avm.hpp"
#include "barretenberg/bbapi/bbapi_chonk.hpp"
#include "barretenberg/bbapi/bbapi_crypto.hpp"
#include "barretenberg/bbapi/bbapi_ecc.hpp"
#include "barretenberg/bbapi/bbapi_ecdsa.hpp"
#include "barretenberg/bbapi/bbapi_schnorr.hpp"
#include "barretenberg/bbapi/bbapi_srs.hpp"
#include "barretenberg/bbapi/bbapi_ultra_honk.hpp"
#include "barretenberg/bbapi/bbapi_wire_convert.hpp"
#include "barretenberg/bbapi/generated/bb_ipc_server.hpp"
#include "barretenberg/vm2/tooling/stats.hpp"

namespace bb::bbapi {

namespace {

// Reset the AVM per-stage timings registry so the snapshot we return reflects only this call.
void reset_avm_stats()
{
    ::bb::avm2::Stats::get().reset();
}

// Take a snapshot of the AVM per-stage timings registry as wire-typed stats entries.
std::vector<wire::AvmStat> snapshot_avm_stats_wire()
{
    auto snapshot = ::bb::avm2::Stats::get().snapshot();
    std::vector<wire::AvmStat> result;
    result.reserve(snapshot.size());
    for (auto& [name, value] : snapshot) {
        result.push_back(wire::AvmStat{ .name = std::move(name), .value_ms = value });
    }
    return result;
}

} // namespace

// ===========================================================================
// AVM
// ===========================================================================

wire::AvmProveResponse handle_avm_prove(BBApiRequest& /*ctx*/, wire::AvmProve&& cmd)
{
    reset_avm_stats();
    auto result = avm_prove_from_bytes(std::move(cmd.inputs));
    return { .proof = fr_vec_to_wire(result.proof), .stats = snapshot_avm_stats_wire() };
}
wire::AvmVerifyResponse handle_avm_verify(BBApiRequest& /*ctx*/, wire::AvmVerify&& cmd)
{
    bool verified = avm_verify_from_bytes(fr_vec_from_wire(cmd.proof), std::move(cmd.public_inputs));
    return { .verified = verified };
}
wire::AvmCheckCircuitResponse handle_avm_check_circuit(BBApiRequest& /*ctx*/, wire::AvmCheckCircuit&& cmd)
{
    reset_avm_stats();
    bool passed = avm_check_circuit_from_bytes(std::move(cmd.inputs));
    return { .passed = passed, .stats = snapshot_avm_stats_wire() };
}

// ===========================================================================
// Circuit + Chonk + UltraHonk
// ===========================================================================

wire::CircuitProveResponse handle_circuit_prove(BBApiRequest& ctx, wire::CircuitProve&& cmd)
{
    CircuitProve domain_cmd{ .circuit = circuit_input_from_wire(std::move(cmd.circuit)),
                             .witness = std::move(cmd.witness),
                             .settings = proof_system_settings_from_wire(std::move(cmd.settings)) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .public_inputs = uint256_vec_to_wire(resp.public_inputs),
             .proof = uint256_vec_to_wire(resp.proof),
             .vk = circuit_compute_vk_response_to_wire(std::move(resp.vk)) };
}
wire::CircuitComputeVkResponse handle_circuit_compute_vk(BBApiRequest& ctx, wire::CircuitComputeVk&& cmd)
{
    CircuitComputeVk domain_cmd{ .circuit = circuit_input_no_vk_from_wire(std::move(cmd.circuit)),
                                 .settings = proof_system_settings_from_wire(std::move(cmd.settings)) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return circuit_compute_vk_response_to_wire(std::move(resp));
}
wire::CircuitInfoResponse handle_circuit_stats(BBApiRequest& ctx, wire::CircuitStats&& cmd)
{
    CircuitStats domain_cmd{ .circuit = circuit_input_from_wire(std::move(cmd.circuit)),
                             .include_gates_per_opcode = cmd.include_gates_per_opcode,
                             .settings = proof_system_settings_from_wire(std::move(cmd.settings)) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .num_gates = resp.num_gates,
             .num_gates_dyadic = resp.num_gates_dyadic,
             .num_acir_opcodes = resp.num_acir_opcodes,
             .gates_per_opcode = std::move(resp.gates_per_opcode) };
}
wire::CircuitVerifyResponse handle_circuit_verify(BBApiRequest& ctx, wire::CircuitVerify&& cmd)
{
    CircuitVerify domain_cmd{ .verification_key = std::move(cmd.verification_key),
                              .public_inputs = uint256_vec_from_wire(cmd.public_inputs),
                              .proof = uint256_vec_from_wire(cmd.proof),
                              .settings = proof_system_settings_from_wire(std::move(cmd.settings)) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .verified = resp.verified };
}
wire::ChonkComputeVkResponse handle_chonk_compute_vk(BBApiRequest& ctx, wire::ChonkComputeVk&& cmd)
{
    ChonkComputeVk domain_cmd{ .circuit = circuit_input_no_vk_from_wire(std::move(cmd.circuit)),
                               .use_zk_flavor = cmd.use_zk_flavor };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .bytes = std::move(resp.bytes), .fields = fr_vec_to_wire(resp.fields) };
}
wire::ChonkStartResponse handle_chonk_start(BBApiRequest& ctx, wire::ChonkStart&& cmd)
{
    ChonkStart domain_cmd{ .num_circuits = cmd.num_circuits };
    std::move(domain_cmd).execute(ctx);
    return {};
}
wire::ChonkLoadResponse handle_chonk_load(BBApiRequest& ctx, wire::ChonkLoad&& cmd)
{
    ChonkLoad domain_cmd{ .circuit = circuit_input_from_wire(std::move(cmd.circuit)) };
    std::move(domain_cmd).execute(ctx);
    return {};
}
wire::ChonkAccumulateResponse handle_chonk_accumulate(BBApiRequest& ctx, wire::ChonkAccumulate&& cmd)
{
    ChonkAccumulate domain_cmd{ .witness = std::move(cmd.witness) };
    std::move(domain_cmd).execute(ctx);
    return {};
}
wire::ChonkProveResponse handle_chonk_prove(BBApiRequest& ctx, wire::ChonkProve&& /*cmd*/)
{
    ChonkProve domain_cmd{};
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .proof = chonk_proof_to_wire(resp.proof) };
}
wire::ChonkVerifyResponse handle_chonk_verify(BBApiRequest& ctx, wire::ChonkVerify&& cmd)
{
    ChonkVerify domain_cmd{ .proof = chonk_proof_from_wire(std::move(cmd.proof)), .vk = std::move(cmd.vk) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .valid = resp.valid };
}
wire::ChonkVerifyFromFieldsResponse handle_chonk_verify_from_fields(BBApiRequest& ctx,
                                                                    wire::ChonkVerifyFromFields&& cmd)
{
    ChonkVerifyFromFields domain_cmd{ .proof = fr_vec_from_wire(cmd.proof), .vk = std::move(cmd.vk) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .valid = resp.valid };
}
wire::ChonkBatchVerifyResponse handle_chonk_batch_verify(BBApiRequest& ctx, wire::ChonkBatchVerify&& cmd)
{
    ChonkBatchVerify domain_cmd{ .proofs = chonk_proof_vec_from_wire(std::move(cmd.proofs)),
                                 .vks = std::move(cmd.vks) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .valid = resp.valid };
}
wire::VkAsFieldsResponse handle_vk_as_fields(BBApiRequest& ctx, wire::VkAsFields&& cmd)
{
    VkAsFields domain_cmd{ .verification_key = std::move(cmd.verification_key) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .fields = fr_vec_to_wire(resp.fields) };
}
wire::MegaVkAsFieldsResponse handle_mega_vk_as_fields(BBApiRequest& ctx, wire::MegaVkAsFields&& cmd)
{
    MegaVkAsFields domain_cmd{ .verification_key = std::move(cmd.verification_key) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .fields = fr_vec_to_wire(resp.fields) };
}
wire::CircuitWriteSolidityVerifierResponse handle_circuit_write_solidity_verifier(
    BBApiRequest& ctx, wire::CircuitWriteSolidityVerifier&& cmd)
{
    CircuitWriteSolidityVerifier domain_cmd{ .verification_key = std::move(cmd.verification_key),
                                             .settings = proof_system_settings_from_wire(std::move(cmd.settings)) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .solidity_code = std::move(resp.solidity_code) };
}
wire::ChonkCheckPrecomputedVkResponse handle_chonk_check_precomputed_vk(BBApiRequest& ctx,
                                                                        wire::ChonkCheckPrecomputedVk&& cmd)
{
    ChonkCheckPrecomputedVk domain_cmd{ .circuit = circuit_input_from_wire(std::move(cmd.circuit)),
                                        .use_zk_flavor = cmd.use_zk_flavor };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .valid = resp.valid, .actual_vk = std::move(resp.actual_vk) };
}
wire::ChonkStatsResponse handle_chonk_stats(BBApiRequest& ctx, wire::ChonkStats&& cmd)
{
    ChonkStats domain_cmd{ .circuit = circuit_input_no_vk_from_wire(std::move(cmd.circuit)),
                           .include_gates_per_opcode = cmd.include_gates_per_opcode };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .acir_opcodes = resp.acir_opcodes,
             .circuit_size = resp.circuit_size,
             .gates_per_opcode = std::move(resp.gates_per_opcode) };
}
wire::ChonkCompressProofResponse handle_chonk_compress_proof(BBApiRequest& ctx, wire::ChonkCompressProof&& cmd)
{
    ChonkCompressProof domain_cmd{ .proof = chonk_proof_from_wire(std::move(cmd.proof)) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .compressed_proof = std::move(resp.compressed_proof) };
}
wire::ChonkDecompressProofResponse handle_chonk_decompress_proof(BBApiRequest& ctx, wire::ChonkDecompressProof&& cmd)
{
    ChonkDecompressProof domain_cmd{ .compressed_proof = std::move(cmd.compressed_proof) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .proof = chonk_proof_to_wire(resp.proof) };
}
wire::ChonkBatchVerifierStartResponse handle_chonk_batch_verifier_start(BBApiRequest& ctx,
                                                                        wire::ChonkBatchVerifierStart&& cmd)
{
    ChonkBatchVerifierStart domain_cmd{ .vks = std::move(cmd.vks),
                                        .num_cores = cmd.num_cores,
                                        .batch_size = cmd.batch_size,
                                        .fifo_path = std::move(cmd.fifo_path) };
    std::move(domain_cmd).execute(ctx);
    return {};
}
wire::ChonkBatchVerifierQueueResponse handle_chonk_batch_verifier_queue(BBApiRequest& ctx,
                                                                        wire::ChonkBatchVerifierQueue&& cmd)
{
    ChonkBatchVerifierQueue domain_cmd{ .request_id = cmd.request_id,
                                        .vk_index = cmd.vk_index,
                                        .proof_fields = fr_vec_from_wire(cmd.proof_fields) };
    std::move(domain_cmd).execute(ctx);
    return {};
}
wire::ChonkBatchVerifierStopResponse handle_chonk_batch_verifier_stop(BBApiRequest& ctx,
                                                                      wire::ChonkBatchVerifierStop&& /*cmd*/)
{
    ChonkBatchVerifierStop domain_cmd{};
    std::move(domain_cmd).execute(ctx);
    return {};
}

// ===========================================================================
// Hashing primitives (explicit field-by-field).
// ===========================================================================

wire::Poseidon2HashResponse handle_poseidon2_hash(BBApiRequest& ctx, wire::Poseidon2Hash&& cmd)
{
    Poseidon2Hash domain_cmd{ .inputs = fr_vec_from_wire(cmd.inputs) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .hash = fr_to_wire(resp.hash) };
}
wire::Poseidon2PermutationResponse handle_poseidon2_permutation(BBApiRequest& ctx, wire::Poseidon2Permutation&& cmd)
{
    Poseidon2Permutation domain_cmd{ .inputs = fr_array_from_wire<4>(cmd.inputs) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .outputs = fr_array_to_wire<4>(resp.outputs) };
}
wire::PedersenCommitResponse handle_pedersen_commit(BBApiRequest& ctx, wire::PedersenCommit&& cmd)
{
    PedersenCommit domain_cmd{ .inputs = fr_vec_from_wire(cmd.inputs), .hash_index = cmd.hash_index };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .point = grumpkin_point_to_wire(resp.point) };
}
wire::PedersenHashResponse handle_pedersen_hash(BBApiRequest& ctx, wire::PedersenHash&& cmd)
{
    PedersenHash domain_cmd{ .inputs = fr_vec_from_wire(cmd.inputs), .hash_index = cmd.hash_index };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .hash = fr_to_wire(resp.hash) };
}
wire::PedersenHashBufferResponse handle_pedersen_hash_buffer(BBApiRequest& ctx, wire::PedersenHashBuffer&& cmd)
{
    PedersenHashBuffer domain_cmd{ .input = std::move(cmd.input), .hash_index = cmd.hash_index };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .hash = fr_to_wire(resp.hash) };
}
wire::Blake2sResponse handle_blake2s(BBApiRequest& ctx, wire::Blake2s&& cmd)
{
    Blake2s domain_cmd{ .data = std::move(cmd.data) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .hash = fr_wrap(resp.hash) };
}
wire::Blake2sToFieldResponse handle_blake2s_to_field(BBApiRequest& ctx, wire::Blake2sToField&& cmd)
{
    Blake2sToField domain_cmd{ .data = std::move(cmd.data) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .field = fr_to_wire(resp.field) };
}
wire::AesEncryptResponse handle_aes_encrypt(BBApiRequest& ctx, wire::AesEncrypt&& cmd)
{
    AesEncrypt domain_cmd{ .plaintext = std::move(cmd.plaintext), .iv = cmd.iv, .key = cmd.key, .length = cmd.length };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .ciphertext = std::move(resp.ciphertext) };
}
wire::AesDecryptResponse handle_aes_decrypt(BBApiRequest& ctx, wire::AesDecrypt&& cmd)
{
    AesDecrypt domain_cmd{
        .ciphertext = std::move(cmd.ciphertext), .iv = cmd.iv, .key = cmd.key, .length = cmd.length
    };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .plaintext = std::move(resp.plaintext) };
}

// ===========================================================================
// Grumpkin curve (explicit field-by-field).
// ===========================================================================

wire::GrumpkinMulResponse handle_grumpkin_mul(BBApiRequest& ctx, wire::GrumpkinMul&& cmd)
{
    GrumpkinMul domain_cmd{ .point = grumpkin_point_from_wire(cmd.point),
                            .scalar = field_from_wire<grumpkin::fr>(cmd.scalar) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .point = grumpkin_point_to_wire(resp.point) };
}
wire::GrumpkinAddResponse handle_grumpkin_add(BBApiRequest& ctx, wire::GrumpkinAdd&& cmd)
{
    GrumpkinAdd domain_cmd{ .point_a = grumpkin_point_from_wire(cmd.point_a),
                            .point_b = grumpkin_point_from_wire(cmd.point_b) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .point = grumpkin_point_to_wire(resp.point) };
}
wire::GrumpkinBatchMulResponse handle_grumpkin_batch_mul(BBApiRequest& ctx, wire::GrumpkinBatchMul&& cmd)
{
    GrumpkinBatchMul domain_cmd{ .points = grumpkin_point_vec_from_wire(cmd.points),
                                 .scalar = field_from_wire<grumpkin::fr>(cmd.scalar) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .points = grumpkin_point_vec_to_wire(resp.points) };
}
wire::GrumpkinGetRandomFrResponse handle_grumpkin_get_random_fr(BBApiRequest& ctx, wire::GrumpkinGetRandomFr&& cmd)
{
    GrumpkinGetRandomFr domain_cmd{ .dummy = cmd.dummy };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .value = fr_to_wire(resp.value) };
}
wire::GrumpkinReduce512Response handle_grumpkin_reduce512(BBApiRequest& ctx, wire::GrumpkinReduce512&& cmd)
{
    GrumpkinReduce512 domain_cmd{ .input = cmd.input };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .value = fr_to_wire(resp.value) };
}

// ===========================================================================
// Secp256k1 curve (explicit field-by-field).
// ===========================================================================

wire::Secp256k1MulResponse handle_secp256k1_mul(BBApiRequest& ctx, wire::Secp256k1Mul&& cmd)
{
    Secp256k1Mul domain_cmd{ .point = secp256k1_point_from_wire(cmd.point),
                             .scalar = field_from_wire<secp256k1::fr>(cmd.scalar) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .point = secp256k1_point_to_wire(resp.point) };
}
wire::Secp256k1GetRandomFrResponse handle_secp256k1_get_random_fr(BBApiRequest& ctx, wire::Secp256k1GetRandomFr&& cmd)
{
    Secp256k1GetRandomFr domain_cmd{ .dummy = cmd.dummy };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .value = field_to_wire<secp256k1::fr>(resp.value) };
}
wire::Secp256k1Reduce512Response handle_secp256k1_reduce512(BBApiRequest& ctx, wire::Secp256k1Reduce512&& cmd)
{
    Secp256k1Reduce512 domain_cmd{ .input = cmd.input };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .value = field_to_wire<secp256k1::fr>(resp.value) };
}

// ===========================================================================
// Bn254 curve (explicit field-by-field).
// ===========================================================================

wire::Bn254FrSqrtResponse handle_bn254_fr_sqrt(BBApiRequest& ctx, wire::Bn254FrSqrt&& cmd)
{
    Bn254FrSqrt domain_cmd{ .input = fr_from_wire(cmd.input) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .is_square_root = resp.is_square_root, .value = fr_to_wire(resp.value) };
}
wire::Bn254FqSqrtResponse handle_bn254_fq_sqrt(BBApiRequest& ctx, wire::Bn254FqSqrt&& cmd)
{
    Bn254FqSqrt domain_cmd{ .input = field_from_wire<bb::fq>(cmd.input) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .is_square_root = resp.is_square_root, .value = field_to_wire<bb::fq>(resp.value) };
}
wire::Bn254G1MulResponse handle_bn254_g1_mul(BBApiRequest& ctx, wire::Bn254G1Mul&& cmd)
{
    Bn254G1Mul domain_cmd{ .point = bn254_g1_point_from_wire(cmd.point), .scalar = fr_from_wire(cmd.scalar) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .point = bn254_g1_point_to_wire(resp.point) };
}
wire::Bn254G2MulResponse handle_bn254_g2_mul(BBApiRequest& ctx, wire::Bn254G2Mul&& cmd)
{
    Bn254G2Mul domain_cmd{ .point = bn254_g2_point_from_wire(cmd.point), .scalar = fr_from_wire(cmd.scalar) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .point = bn254_g2_point_to_wire(resp.point) };
}
wire::Bn254G1IsOnCurveResponse handle_bn254_g1_is_on_curve(BBApiRequest& ctx, wire::Bn254G1IsOnCurve&& cmd)
{
    Bn254G1IsOnCurve domain_cmd{ .point = bn254_g1_point_from_wire(cmd.point) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .is_on_curve = resp.is_on_curve };
}
wire::Bn254G1FromCompressedResponse handle_bn254_g1_from_compressed(BBApiRequest& ctx,
                                                                    wire::Bn254G1FromCompressed&& cmd)
{
    Bn254G1FromCompressed domain_cmd{ .compressed = fr_unwrap(cmd.compressed) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .point = bn254_g1_point_to_wire(resp.point) };
}

// ===========================================================================
// Schnorr (explicit field-by-field).
// ===========================================================================

wire::SchnorrComputePublicKeyResponse handle_schnorr_compute_public_key(BBApiRequest& ctx,
                                                                        wire::SchnorrComputePublicKey&& cmd)
{
    SchnorrComputePublicKey domain_cmd{ .private_key = field_from_wire<grumpkin::fr>(cmd.private_key) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .public_key = grumpkin_point_to_wire(resp.public_key) };
}
wire::SchnorrConstructSignatureResponse handle_schnorr_construct_signature(BBApiRequest& ctx,
                                                                           wire::SchnorrConstructSignature&& cmd)
{
    SchnorrConstructSignature domain_cmd{ .message = std::move(cmd.message),
                                          .private_key = field_from_wire<grumpkin::fr>(cmd.private_key) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .s = fr_wrap(resp.s), .e = fr_wrap(resp.e) };
}
wire::SchnorrVerifySignatureResponse handle_schnorr_verify_signature(BBApiRequest& ctx,
                                                                     wire::SchnorrVerifySignature&& cmd)
{
    SchnorrVerifySignature domain_cmd{ .message = std::move(cmd.message),
                                       .public_key = grumpkin_point_from_wire(cmd.public_key),
                                       .s = fr_unwrap(cmd.s),
                                       .e = fr_unwrap(cmd.e) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .verified = resp.verified };
}

// ===========================================================================
// ECDSA (explicit field-by-field).
// ===========================================================================

wire::EcdsaSecp256k1ComputePublicKeyResponse handle_ecdsa_secp256k1_compute_public_key(
    BBApiRequest& ctx, wire::EcdsaSecp256k1ComputePublicKey&& cmd)
{
    EcdsaSecp256k1ComputePublicKey domain_cmd{ .private_key = field_from_wire<secp256k1::fr>(cmd.private_key) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .public_key = secp256k1_point_to_wire(resp.public_key) };
}
wire::EcdsaSecp256r1ComputePublicKeyResponse handle_ecdsa_secp256r1_compute_public_key(
    BBApiRequest& ctx, wire::EcdsaSecp256r1ComputePublicKey&& cmd)
{
    EcdsaSecp256r1ComputePublicKey domain_cmd{ .private_key = field_from_wire<secp256r1::fr>(cmd.private_key) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .public_key = secp256r1_point_to_wire(resp.public_key) };
}
wire::EcdsaSecp256k1ConstructSignatureResponse handle_ecdsa_secp256k1_construct_signature(
    BBApiRequest& ctx, wire::EcdsaSecp256k1ConstructSignature&& cmd)
{
    EcdsaSecp256k1ConstructSignature domain_cmd{ .message = std::move(cmd.message),
                                                 .private_key = field_from_wire<secp256k1::fr>(cmd.private_key) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .r = fr_wrap(resp.r), .s = fr_wrap(resp.s), .v = resp.v };
}
wire::EcdsaSecp256r1ConstructSignatureResponse handle_ecdsa_secp256r1_construct_signature(
    BBApiRequest& ctx, wire::EcdsaSecp256r1ConstructSignature&& cmd)
{
    EcdsaSecp256r1ConstructSignature domain_cmd{ .message = std::move(cmd.message),
                                                 .private_key = field_from_wire<secp256r1::fr>(cmd.private_key) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .r = fr_wrap(resp.r), .s = fr_wrap(resp.s), .v = resp.v };
}
wire::EcdsaSecp256k1RecoverPublicKeyResponse handle_ecdsa_secp256k1_recover_public_key(
    BBApiRequest& ctx, wire::EcdsaSecp256k1RecoverPublicKey&& cmd)
{
    EcdsaSecp256k1RecoverPublicKey domain_cmd{
        .message = std::move(cmd.message), .r = fr_unwrap(cmd.r), .s = fr_unwrap(cmd.s), .v = cmd.v
    };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .public_key = secp256k1_point_to_wire(resp.public_key) };
}
wire::EcdsaSecp256r1RecoverPublicKeyResponse handle_ecdsa_secp256r1_recover_public_key(
    BBApiRequest& ctx, wire::EcdsaSecp256r1RecoverPublicKey&& cmd)
{
    EcdsaSecp256r1RecoverPublicKey domain_cmd{
        .message = std::move(cmd.message), .r = fr_unwrap(cmd.r), .s = fr_unwrap(cmd.s), .v = cmd.v
    };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .public_key = secp256r1_point_to_wire(resp.public_key) };
}
wire::EcdsaSecp256k1VerifySignatureResponse handle_ecdsa_secp256k1_verify_signature(
    BBApiRequest& ctx, wire::EcdsaSecp256k1VerifySignature&& cmd)
{
    EcdsaSecp256k1VerifySignature domain_cmd{ .message = std::move(cmd.message),
                                              .public_key = secp256k1_point_from_wire(cmd.public_key),
                                              .r = fr_unwrap(cmd.r),
                                              .s = fr_unwrap(cmd.s),
                                              .v = cmd.v };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .verified = resp.verified };
}
wire::EcdsaSecp256r1VerifySignatureResponse handle_ecdsa_secp256r1_verify_signature(
    BBApiRequest& ctx, wire::EcdsaSecp256r1VerifySignature&& cmd)
{
    EcdsaSecp256r1VerifySignature domain_cmd{ .message = std::move(cmd.message),
                                              .public_key = secp256r1_point_from_wire(cmd.public_key),
                                              .r = fr_unwrap(cmd.r),
                                              .s = fr_unwrap(cmd.s),
                                              .v = cmd.v };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .verified = resp.verified };
}

// ===========================================================================
// SRS init (explicit field-by-field — fields are byte vectors).
// ===========================================================================

wire::SrsInitSrsResponse handle_srs_init_srs(BBApiRequest& ctx, wire::SrsInitSrs&& cmd)
{
    SrsInitSrs domain_cmd{ .points_buf = std::move(cmd.points_buf),
                           .num_points = cmd.num_points,
                           .g2_point = std::move(cmd.g2_point) };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .points_buf = std::move(resp.points_buf) };
}
wire::SrsInitGrumpkinSrsResponse handle_srs_init_grumpkin_srs(BBApiRequest& ctx, wire::SrsInitGrumpkinSrs&& cmd)
{
    SrsInitGrumpkinSrs domain_cmd{ .points_buf = std::move(cmd.points_buf), .num_points = cmd.num_points };
    auto resp = std::move(domain_cmd).execute(ctx);
    return { .dummy = resp.dummy };
}

} // namespace bb::bbapi
