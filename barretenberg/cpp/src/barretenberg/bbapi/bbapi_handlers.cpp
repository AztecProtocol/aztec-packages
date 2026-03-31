/**
 * @file bbapi_handlers.cpp
 * @brief Handler implementations bridging wire types to domain types for the BB IPC server.
 *
 * Each handler:
 *  1. Takes a wire command (bb::bbapi::wire::BbFoo&&)
 *  2. Converts wire fields to domain types
 *  3. Calls std::move(domain_cmd).execute(ctx)
 *  4. Converts the domain response back to wire response
 *  5. Returns wire response
 */

#include "barretenberg/bbapi/bbapi_execute.hpp"
#include "barretenberg/bbapi/generated/bb_ipc_server.hpp"
#include "barretenberg/bbapi/wire_convert.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/serialize/msgpack.hpp"

#include <algorithm>
#include <cstring>

namespace bb::bbapi {

// ===========================================================================================
// Conversion helpers (local to this TU)
// ===========================================================================================

namespace {

/// Convert vector<uint8_t> (32 bytes) → uint256_t
inline uint256_t uint256_from_bytes(const std::vector<uint8_t>& bytes)
{
    uint256_t val(0);
    if (bytes.size() >= 32) {
        std::memcpy(static_cast<void*>(&val), bytes.data(), 32);
    }
    return val;
}

/// Convert uint256_t → vector<uint8_t> (32 bytes)
inline std::vector<uint8_t> uint256_to_bytes(const uint256_t& val)
{
    std::vector<uint8_t> buf(32);
    std::memcpy(buf.data(), static_cast<const void*>(&val), 32);
    return buf;
}

/// Convert vector<vector<uint8_t>> → vector<uint256_t>
inline std::vector<uint256_t> uint256_vec_from_wire(const std::vector<std::vector<uint8_t>>& wire)
{
    std::vector<uint256_t> result;
    result.reserve(wire.size());
    for (const auto& w : wire) {
        result.push_back(uint256_from_bytes(w));
    }
    return result;
}

/// Convert vector<uint256_t> → vector<vector<uint8_t>>
inline std::vector<std::vector<uint8_t>> uint256_vec_to_wire(const std::vector<uint256_t>& domain)
{
    std::vector<std::vector<uint8_t>> result;
    result.reserve(domain.size());
    for (const auto& d : domain) {
        result.push_back(uint256_to_bytes(d));
    }
    return result;
}

/// Convert vector<uint8_t> → array<uint8_t, N> (truncates or zero-pads)
template <size_t N> inline std::array<uint8_t, N> vec_to_array(const std::vector<uint8_t>& v)
{
    std::array<uint8_t, N> arr{};
    std::memcpy(arr.data(), v.data(), std::min(v.size(), N));
    return arr;
}

/// Convert wire CircuitInput → domain CircuitInput
inline CircuitInput circuit_input_from_wire(wire::CircuitInput&& w)
{
    return { .name = std::move(w.name),
             .bytecode = std::move(w.bytecode),
             .verification_key = std::move(w.verification_key) };
}

/// Convert wire CircuitInputNoVK → domain CircuitInputNoVK
inline CircuitInputNoVK circuit_input_novk_from_wire(wire::CircuitInputNoVK&& w)
{
    return { .name = std::move(w.name), .bytecode = std::move(w.bytecode) };
}

/// Convert wire ProofSystemSettings → domain ProofSystemSettings
inline ProofSystemSettings settings_from_wire(wire::ProofSystemSettings&& w)
{
    return { .ipa_accumulation = w.ipa_accumulation,
             .oracle_hash_type = std::move(w.oracle_hash_type),
             .disable_zk = w.disable_zk,
             .optimized_solidity_verifier = w.optimized_solidity_verifier };
}

/// Convert wire ChonkProof → domain ChonkProof (vector<Fr> → vector<bb::fr>)
inline ChonkProof chonk_proof_from_wire(wire::ChonkProof&& w)
{
    ChonkProof p;
    p.hiding_oink_proof = field_vec_from_wire<bb::fr>(w.hiding_oink_proof);
    p.merge_proof = field_vec_from_wire<bb::fr>(w.merge_proof);
    p.eccvm_proof = field_vec_from_wire<bb::fr>(w.eccvm_proof);
    p.ipa_proof = field_vec_from_wire<bb::fr>(w.ipa_proof);
    p.joint_proof = field_vec_from_wire<bb::fr>(w.joint_proof);
    return p;
}

/// Convert domain ChonkProof → wire ChonkProof (vector<bb::fr> → vector<Fr>)
inline wire::ChonkProof chonk_proof_to_wire(const ChonkProof& d)
{
    return { .hiding_oink_proof = field_vec_to_wire<bb::fr>(d.hiding_oink_proof),
             .merge_proof = field_vec_to_wire<bb::fr>(d.merge_proof),
             .eccvm_proof = field_vec_to_wire<bb::fr>(d.eccvm_proof),
             .ipa_proof = field_vec_to_wire<bb::fr>(d.ipa_proof),
             .joint_proof = field_vec_to_wire<bb::fr>(d.joint_proof) };
}

/// Convert domain BbCircuitComputeVk::Response → wire BbCircuitComputeVkResponse
inline wire::BbCircuitComputeVkResponse compute_vk_response_to_wire(const BbCircuitComputeVk::Response& d)
{
    return { .bytes = d.bytes, .fields = uint256_vec_to_wire(d.fields), .hash = d.hash };
}

/// Convert G2 wire point → domain g2::affine_element
/// Wire: { array<Fr,2> x, array<Fr,2> y } where each Fr pair is fq2 = {fq c0, fq c1}
inline bb::g2::affine_element g2_point_from_wire(const wire::Bn254G2Point& w)
{
    bb::g2::affine_element r;
    r.x.c0 = field_from_wire<bb::fq>(w.x[0]);
    r.x.c1 = field_from_wire<bb::fq>(w.x[1]);
    r.y.c0 = field_from_wire<bb::fq>(w.y[0]);
    r.y.c1 = field_from_wire<bb::fq>(w.y[1]);
    return r;
}

/// Convert domain g2::affine_element → wire G2 point
inline wire::Bn254G2Point g2_point_to_wire(const bb::g2::affine_element& d)
{
    wire::Bn254G2Point r;
    r.x[0] = field_to_wire<bb::fq>(d.x.c0);
    r.x[1] = field_to_wire<bb::fq>(d.x.c1);
    r.y[0] = field_to_wire<bb::fq>(d.y.c0);
    r.y[1] = field_to_wire<bb::fq>(d.y.c1);
    return r;
}

} // anonymous namespace

// ===========================================================================================
// UltraHonk handlers
// ===========================================================================================

template <> wire::BbCircuitProveResponse handle_circuit_prove(BbRequest& ctx, wire::BbCircuitProve&& w)
{
    auto resp =
        BbCircuitProve{
            .circuit = circuit_input_from_wire(std::move(w.circuit)),
            .witness = std::move(w.witness),
            .settings = settings_from_wire(std::move(w.settings)),
        }
            .execute(ctx);
    return { .public_inputs = uint256_vec_to_wire(resp.public_inputs),
             .proof = uint256_vec_to_wire(resp.proof),
             .vk = compute_vk_response_to_wire(resp.vk) };
}

template <> wire::BbCircuitComputeVkResponse handle_circuit_compute_vk(BbRequest& ctx, wire::BbCircuitComputeVk&& w)
{
    auto resp =
        BbCircuitComputeVk{
            .circuit = circuit_input_novk_from_wire(std::move(w.circuit)),
            .settings = settings_from_wire(std::move(w.settings)),
        }
            .execute(ctx);
    return compute_vk_response_to_wire(resp);
}

template <> wire::BbCircuitInfoResponse handle_circuit_stats(BbRequest& ctx, wire::BbCircuitStats&& w)
{
    auto resp =
        BbCircuitStats{
            .circuit = circuit_input_from_wire(std::move(w.circuit)),
            .include_gates_per_opcode = w.include_gates_per_opcode,
            .settings = settings_from_wire(std::move(w.settings)),
        }
            .execute(ctx);
    return { .num_gates = resp.num_gates,
             .num_gates_dyadic = resp.num_gates_dyadic,
             .num_acir_opcodes = resp.num_acir_opcodes,
             .gates_per_opcode = std::move(resp.gates_per_opcode) };
}

template <> wire::BbCircuitVerifyResponse handle_circuit_verify(BbRequest& ctx, wire::BbCircuitVerify&& w)
{
    auto resp =
        BbCircuitVerify{
            .verification_key = std::move(w.verification_key),
            .public_inputs = uint256_vec_from_wire(w.public_inputs),
            .proof = uint256_vec_from_wire(w.proof),
            .settings = settings_from_wire(std::move(w.settings)),
        }
            .execute(ctx);
    return { .verified = resp.verified };
}

template <> wire::BbVkAsFieldsResponse handle_vk_as_fields(BbRequest& ctx, wire::BbVkAsFields&& w)
{
    auto resp =
        BbVkAsFields{
            .verification_key = std::move(w.verification_key),
        }
            .execute(ctx);
    return { .fields = field_vec_to_wire<bb::fr>(resp.fields) };
}

template <> wire::BbMegaVkAsFieldsResponse handle_mega_vk_as_fields(BbRequest& ctx, wire::BbMegaVkAsFields&& w)
{
    auto resp =
        BbMegaVkAsFields{
            .verification_key = std::move(w.verification_key),
        }
            .execute(ctx);
    return { .fields = field_vec_to_wire<bb::fr>(resp.fields) };
}

template <>
wire::BbCircuitWriteSolidityVerifierResponse handle_circuit_write_solidity_verifier(
    BbRequest& ctx, wire::BbCircuitWriteSolidityVerifier&& w)
{
    auto resp =
        BbCircuitWriteSolidityVerifier{
            .verification_key = std::move(w.verification_key),
            .settings = settings_from_wire(std::move(w.settings)),
        }
            .execute(ctx);
    return { .solidity_code = std::move(resp.solidity_code) };
}

// ===========================================================================================
// Chonk handlers
// ===========================================================================================

template <> wire::BbChonkComputeVkResponse handle_chonk_compute_vk(BbRequest& ctx, wire::BbChonkComputeVk&& w)
{
    auto resp =
        BbChonkComputeVk{
            .circuit = circuit_input_novk_from_wire(std::move(w.circuit)),
        }
            .execute(ctx);
    return { .bytes = std::move(resp.bytes), .fields = field_vec_to_wire<bb::fr>(resp.fields) };
}

template <> wire::BbChonkStartResponse handle_chonk_start(BbRequest& ctx, wire::BbChonkStart&& w)
{
    BbChonkStart{ .num_circuits = w.num_circuits }.execute(ctx);
    return {};
}

template <> wire::BbChonkLoadResponse handle_chonk_load(BbRequest& ctx, wire::BbChonkLoad&& w)
{
    BbChonkLoad{
        .circuit = circuit_input_from_wire(std::move(w.circuit)),
    }
        .execute(ctx);
    return {};
}

template <> wire::BbChonkAccumulateResponse handle_chonk_accumulate(BbRequest& ctx, wire::BbChonkAccumulate&& w)
{
    BbChonkAccumulate{
        .witness = std::move(w.witness),
    }
        .execute(ctx);
    return {};
}

template <> wire::BbChonkProveResponse handle_chonk_prove(BbRequest& ctx, wire::BbChonkProve&& /*w*/)
{
    auto resp = BbChonkProve{}.execute(ctx);
    return { .proof = chonk_proof_to_wire(resp.proof) };
}

template <> wire::BbChonkVerifyResponse handle_chonk_verify(BbRequest& ctx, wire::BbChonkVerify&& w)
{
    auto resp =
        BbChonkVerify{
            .proof = chonk_proof_from_wire(std::move(w.proof)),
            .vk = std::move(w.vk),
        }
            .execute(ctx);
    return { .valid = resp.valid };
}

template <> wire::BbChonkBatchVerifyResponse handle_chonk_batch_verify(BbRequest& ctx, wire::BbChonkBatchVerify&& w)
{
    std::vector<ChonkProof> proofs;
    proofs.reserve(w.proofs.size());
    for (auto& wp : w.proofs) {
        proofs.push_back(chonk_proof_from_wire(std::move(wp)));
    }
    auto resp =
        BbChonkBatchVerify{
            .proofs = std::move(proofs),
            .vks = std::move(w.vks),
        }
            .execute(ctx);
    return { .valid = resp.valid };
}

template <>
wire::BbChonkCheckPrecomputedVkResponse handle_chonk_check_precomputed_vk(BbRequest& ctx,
                                                                          wire::BbChonkCheckPrecomputedVk&& w)
{
    auto resp =
        BbChonkCheckPrecomputedVk{
            .circuit = circuit_input_from_wire(std::move(w.circuit)),
        }
            .execute(ctx);
    return { .valid = resp.valid, .actual_vk = std::move(resp.actual_vk) };
}

template <> wire::BbChonkStatsResponse handle_chonk_stats(BbRequest& ctx, wire::BbChonkStats&& w)
{
    auto resp =
        BbChonkStats{
            .circuit = circuit_input_novk_from_wire(std::move(w.circuit)),
            .include_gates_per_opcode = w.include_gates_per_opcode,
        }
            .execute(ctx);
    return { .acir_opcodes = resp.acir_opcodes,
             .circuit_size = resp.circuit_size,
             .gates_per_opcode = std::move(resp.gates_per_opcode) };
}

template <>
wire::BbChonkCompressProofResponse handle_chonk_compress_proof(BbRequest& ctx, wire::BbChonkCompressProof&& w)
{
    auto resp =
        BbChonkCompressProof{
            .proof = chonk_proof_from_wire(std::move(w.proof)),
        }
            .execute(ctx);
    return { .compressed_proof = std::move(resp.compressed_proof) };
}

template <>
wire::BbChonkDecompressProofResponse handle_chonk_decompress_proof(BbRequest& ctx, wire::BbChonkDecompressProof&& w)
{
    auto resp =
        BbChonkDecompressProof{
            .compressed_proof = std::move(w.compressed_proof),
        }
            .execute(ctx);
    return { .proof = chonk_proof_to_wire(resp.proof) };
}

template <>
wire::BbChonkBatchVerifierStartResponse handle_chonk_batch_verifier_start(BbRequest& ctx,
                                                                          wire::BbChonkBatchVerifierStart&& w)
{
    BbChonkBatchVerifierStart{
        .vks = std::move(w.vks),
        .num_cores = w.num_cores,
        .batch_size = w.batch_size,
        .fifo_path = std::move(w.fifo_path),
    }
        .execute(ctx);
    return {};
}

template <>
wire::BbChonkBatchVerifierQueueResponse handle_chonk_batch_verifier_queue(BbRequest& ctx,
                                                                          wire::BbChonkBatchVerifierQueue&& w)
{
    BbChonkBatchVerifierQueue{
        .request_id = w.request_id,
        .vk_index = w.vk_index,
        .proof_fields = field_vec_from_wire<bb::fr>(w.proof_fields),
    }
        .execute(ctx);
    return {};
}

template <>
wire::BbChonkBatchVerifierStopResponse handle_chonk_batch_verifier_stop(BbRequest& ctx,
                                                                        wire::BbChonkBatchVerifierStop&& /*w*/)
{
    BbChonkBatchVerifierStop{}.execute(ctx);
    return {};
}

// ===========================================================================================
// Crypto handlers
// ===========================================================================================

template <> wire::BbPoseidon2HashResponse handle_poseidon2_hash(BbRequest& ctx, wire::BbPoseidon2Hash&& w)
{
    auto resp =
        BbPoseidon2Hash{
            .inputs = field_vec_from_wire<bb::fr>(w.inputs),
        }
            .execute(ctx);
    return { .hash = field_to_wire(resp.hash) };
}

template <>
wire::BbPoseidon2PermutationResponse handle_poseidon2_permutation(BbRequest& ctx, wire::BbPoseidon2Permutation&& w)
{
    auto resp =
        BbPoseidon2Permutation{
            .inputs = { field_from_wire<bb::fr>(w.inputs[0]),
                        field_from_wire<bb::fr>(w.inputs[1]),
                        field_from_wire<bb::fr>(w.inputs[2]),
                        field_from_wire<bb::fr>(w.inputs[3]) },
        }
            .execute(ctx);
    return { .outputs = { field_to_wire(resp.outputs[0]),
                          field_to_wire(resp.outputs[1]),
                          field_to_wire(resp.outputs[2]),
                          field_to_wire(resp.outputs[3]) } };
}

template <> wire::BbPedersenCommitResponse handle_pedersen_commit(BbRequest& ctx, wire::BbPedersenCommit&& w)
{
    auto resp =
        BbPedersenCommit{
            .inputs = field_vec_from_wire<grumpkin::fq>(w.inputs),
            .hash_index = w.hash_index,
        }
            .execute(ctx);
    return { .point = point_to_wire<wire::GrumpkinPoint>(resp.point) };
}

template <> wire::BbPedersenHashResponse handle_pedersen_hash(BbRequest& ctx, wire::BbPedersenHash&& w)
{
    auto resp =
        BbPedersenHash{
            .inputs = field_vec_from_wire<grumpkin::fq>(w.inputs),
            .hash_index = w.hash_index,
        }
            .execute(ctx);
    return { .hash = field_to_wire(resp.hash) };
}

template <>
wire::BbPedersenHashBufferResponse handle_pedersen_hash_buffer(BbRequest& ctx, wire::BbPedersenHashBuffer&& w)
{
    auto resp =
        BbPedersenHashBuffer{
            .input = std::move(w.input),
            .hash_index = w.hash_index,
        }
            .execute(ctx);
    return { .hash = field_to_wire(resp.hash) };
}

template <> wire::BbBlake2sResponse handle_blake2s(BbRequest& ctx, wire::BbBlake2s&& w)
{
    auto resp =
        BbBlake2s{
            .data = std::move(w.data),
        }
            .execute(ctx);
    // Domain: std::array<uint8_t,32>, Wire: Fr = std::array<uint8_t,32> — same type
    return { .hash = resp.hash };
}

template <> wire::BbBlake2sToFieldResponse handle_blake2s_to_field(BbRequest& ctx, wire::BbBlake2sToField&& w)
{
    auto resp =
        BbBlake2sToField{
            .data = std::move(w.data),
        }
            .execute(ctx);
    return { .field = field_to_wire(resp.field) };
}

template <> wire::BbAesEncryptResponse handle_aes_encrypt(BbRequest& ctx, wire::BbAesEncrypt&& w)
{
    auto resp =
        BbAesEncrypt{
            .plaintext = std::move(w.plaintext),
            .iv = vec_to_array<16>(w.iv),
            .key = vec_to_array<16>(w.key),
            .length = w.length,
        }
            .execute(ctx);
    return { .ciphertext = std::move(resp.ciphertext) };
}

template <> wire::BbAesDecryptResponse handle_aes_decrypt(BbRequest& ctx, wire::BbAesDecrypt&& w)
{
    auto resp =
        BbAesDecrypt{
            .ciphertext = std::move(w.ciphertext),
            .iv = vec_to_array<16>(w.iv),
            .key = vec_to_array<16>(w.key),
            .length = w.length,
        }
            .execute(ctx);
    return { .plaintext = std::move(resp.plaintext) };
}

// ===========================================================================================
// ECC handlers — Grumpkin
// ===========================================================================================

template <> wire::BbGrumpkinMulResponse handle_grumpkin_mul(BbRequest& ctx, wire::BbGrumpkinMul&& w)
{
    auto resp =
        BbGrumpkinMul{
            .point = point_from_wire<grumpkin::g1::affine_element>(w.point),
            .scalar = field_from_wire<grumpkin::fr>(w.scalar),
        }
            .execute(ctx);
    return { .point = point_to_wire<wire::GrumpkinPoint>(resp.point) };
}

template <> wire::BbGrumpkinAddResponse handle_grumpkin_add(BbRequest& ctx, wire::BbGrumpkinAdd&& w)
{
    auto resp =
        BbGrumpkinAdd{
            .point_a = point_from_wire<grumpkin::g1::affine_element>(w.point_a),
            .point_b = point_from_wire<grumpkin::g1::affine_element>(w.point_b),
        }
            .execute(ctx);
    return { .point = point_to_wire<wire::GrumpkinPoint>(resp.point) };
}

template <> wire::BbGrumpkinBatchMulResponse handle_grumpkin_batch_mul(BbRequest& ctx, wire::BbGrumpkinBatchMul&& w)
{
    std::vector<grumpkin::g1::affine_element> points;
    points.reserve(w.points.size());
    for (const auto& wp : w.points) {
        points.push_back(point_from_wire<grumpkin::g1::affine_element>(wp));
    }
    auto resp =
        BbGrumpkinBatchMul{
            .points = std::move(points),
            .scalar = field_from_wire<grumpkin::fr>(w.scalar),
        }
            .execute(ctx);
    std::vector<wire::GrumpkinPoint> wire_points;
    wire_points.reserve(resp.points.size());
    for (const auto& p : resp.points) {
        wire_points.push_back(point_to_wire<wire::GrumpkinPoint>(p));
    }
    return { .points = std::move(wire_points) };
}

template <>
wire::BbGrumpkinGetRandomFrResponse handle_grumpkin_get_random_fr(BbRequest& ctx, wire::BbGrumpkinGetRandomFr&& /*w*/)
{
    auto resp = BbGrumpkinGetRandomFr{}.execute(ctx);
    return { .value = field_to_wire(resp.value) };
}

template <> wire::BbGrumpkinReduce512Response handle_grumpkin_reduce512(BbRequest& ctx, wire::BbGrumpkinReduce512&& w)
{
    auto resp =
        BbGrumpkinReduce512{
            .input = vec_to_array<64>(w.input),
        }
            .execute(ctx);
    return { .value = field_to_wire(resp.value) };
}

// ===========================================================================================
// ECC handlers — Secp256k1
// ===========================================================================================

template <> wire::BbSecp256k1MulResponse handle_secp256k1_mul(BbRequest& ctx, wire::BbSecp256k1Mul&& w)
{
    auto resp =
        BbSecp256k1Mul{
            .point = point_from_wire<secp256k1::g1::affine_element>(w.point),
            .scalar = field_from_wire<secp256k1::fr>(w.scalar),
        }
            .execute(ctx);
    return { .point = point_to_wire<wire::Secp256k1Point>(resp.point) };
}

template <>
wire::BbSecp256k1GetRandomFrResponse handle_secp256k1_get_random_fr(BbRequest& ctx,
                                                                    wire::BbSecp256k1GetRandomFr&& /*w*/)
{
    auto resp = BbSecp256k1GetRandomFr{}.execute(ctx);
    return { .value = field_to_wire(resp.value) };
}

template <>
wire::BbSecp256k1Reduce512Response handle_secp256k1_reduce512(BbRequest& ctx, wire::BbSecp256k1Reduce512&& w)
{
    auto resp =
        BbSecp256k1Reduce512{
            .input = vec_to_array<64>(w.input),
        }
            .execute(ctx);
    return { .value = field_to_wire(resp.value) };
}

// ===========================================================================================
// ECC handlers — BN254
// ===========================================================================================

template <> wire::BbBn254FrSqrtResponse handle_bn254_fr_sqrt(BbRequest& ctx, wire::BbBn254FrSqrt&& w)
{
    auto resp =
        BbBn254FrSqrt{
            .input = field_from_wire<bb::fr>(w.input),
        }
            .execute(ctx);
    return { .is_square_root = resp.is_square_root, .value = field_to_wire(resp.value) };
}

template <> wire::BbBn254FqSqrtResponse handle_bn254_fq_sqrt(BbRequest& ctx, wire::BbBn254FqSqrt&& w)
{
    auto resp =
        BbBn254FqSqrt{
            .input = field_from_wire<bb::fq>(w.input),
        }
            .execute(ctx);
    return { .is_square_root = resp.is_square_root, .value = field_to_wire(resp.value) };
}

template <> wire::BbBn254G1MulResponse handle_bn254_g1_mul(BbRequest& ctx, wire::BbBn254G1Mul&& w)
{
    auto resp =
        BbBn254G1Mul{
            .point = point_from_wire<bb::g1::affine_element>(w.point),
            .scalar = field_from_wire<bb::fr>(w.scalar),
        }
            .execute(ctx);
    return { .point = point_to_wire<wire::Bn254G1Point>(resp.point) };
}

template <> wire::BbBn254G2MulResponse handle_bn254_g2_mul(BbRequest& ctx, wire::BbBn254G2Mul&& w)
{
    auto resp =
        BbBn254G2Mul{
            .point = g2_point_from_wire(w.point),
            .scalar = field_from_wire<bb::fr>(w.scalar),
        }
            .execute(ctx);
    return { .point = g2_point_to_wire(resp.point) };
}

template <> wire::BbBn254G1IsOnCurveResponse handle_bn254_g1_is_on_curve(BbRequest& ctx, wire::BbBn254G1IsOnCurve&& w)
{
    auto resp =
        BbBn254G1IsOnCurve{
            .point = point_from_wire<bb::g1::affine_element>(w.point),
        }
            .execute(ctx);
    return { .is_on_curve = resp.is_on_curve };
}

template <>
wire::BbBn254G1FromCompressedResponse handle_bn254_g1_from_compressed(BbRequest& ctx, wire::BbBn254G1FromCompressed&& w)
{
    // Wire: Fr compressed (array<uint8_t,32>), Domain: std::array<uint8_t,32> — same type
    auto resp =
        BbBn254G1FromCompressed{
            .compressed = w.compressed,
        }
            .execute(ctx);
    return { .point = point_to_wire<wire::Bn254G1Point>(resp.point) };
}

// ===========================================================================================
// Schnorr handlers
// ===========================================================================================

template <>
wire::BbSchnorrComputePublicKeyResponse handle_schnorr_compute_public_key(BbRequest& ctx,
                                                                          wire::BbSchnorrComputePublicKey&& w)
{
    auto resp =
        BbSchnorrComputePublicKey{
            .private_key = field_from_wire<grumpkin::fr>(w.private_key),
        }
            .execute(ctx);
    return { .public_key = point_to_wire<wire::GrumpkinPoint>(resp.public_key) };
}

template <>
wire::BbSchnorrConstructSignatureResponse handle_schnorr_construct_signature(BbRequest& ctx,
                                                                             wire::BbSchnorrConstructSignature&& w)
{
    auto resp =
        BbSchnorrConstructSignature{
            .message = std::move(w.message),
            .private_key = field_from_wire<grumpkin::fr>(w.private_key),
        }
            .execute(ctx);
    // Domain response: std::array<uint8_t,32> s, e  — Wire: Fr (= array<uint8_t,32>) s, e — same type
    return { .s = resp.s, .e = resp.e };
}

template <>
wire::BbSchnorrVerifySignatureResponse handle_schnorr_verify_signature(BbRequest& ctx,
                                                                       wire::BbSchnorrVerifySignature&& w)
{
    // Wire s, e are Fr (array<uint8_t,32>), domain s, e are std::array<uint8_t,32> — same type
    auto resp =
        BbSchnorrVerifySignature{
            .message = std::move(w.message),
            .public_key = point_from_wire<grumpkin::g1::affine_element>(w.public_key),
            .s = w.s,
            .e = w.e,
        }
            .execute(ctx);
    return { .verified = resp.verified };
}

// ===========================================================================================
// ECDSA handlers
// ===========================================================================================

template <>
wire::BbEcdsaSecp256k1ComputePublicKeyResponse handle_ecdsa_secp256k1_compute_public_key(
    BbRequest& ctx, wire::BbEcdsaSecp256k1ComputePublicKey&& w)
{
    auto resp =
        BbEcdsaSecp256k1ComputePublicKey{
            .private_key = field_from_wire<secp256k1::fr>(w.private_key),
        }
            .execute(ctx);
    return { .public_key = point_to_wire<wire::Secp256k1Point>(resp.public_key) };
}

template <>
wire::BbEcdsaSecp256r1ComputePublicKeyResponse handle_ecdsa_secp256r1_compute_public_key(
    BbRequest& ctx, wire::BbEcdsaSecp256r1ComputePublicKey&& w)
{
    auto resp =
        BbEcdsaSecp256r1ComputePublicKey{
            .private_key = field_from_wire<secp256r1::fr>(w.private_key),
        }
            .execute(ctx);
    return { .public_key = point_to_wire<wire::Secp256r1Point>(resp.public_key) };
}

template <>
wire::BbEcdsaSecp256k1ConstructSignatureResponse handle_ecdsa_secp256k1_construct_signature(
    BbRequest& ctx, wire::BbEcdsaSecp256k1ConstructSignature&& w)
{
    auto resp =
        BbEcdsaSecp256k1ConstructSignature{
            .message = std::move(w.message),
            .private_key = field_from_wire<secp256k1::fr>(w.private_key),
        }
            .execute(ctx);
    // Domain r,s: array<uint8_t,32>  Wire r,s: Fr = array<uint8_t,32> — same type
    return { .r = resp.r, .s = resp.s, .v = resp.v };
}

template <>
wire::BbEcdsaSecp256r1ConstructSignatureResponse handle_ecdsa_secp256r1_construct_signature(
    BbRequest& ctx, wire::BbEcdsaSecp256r1ConstructSignature&& w)
{
    auto resp =
        BbEcdsaSecp256r1ConstructSignature{
            .message = std::move(w.message),
            .private_key = field_from_wire<secp256r1::fr>(w.private_key),
        }
            .execute(ctx);
    return { .r = resp.r, .s = resp.s, .v = resp.v };
}

template <>
wire::BbEcdsaSecp256k1RecoverPublicKeyResponse handle_ecdsa_secp256k1_recover_public_key(
    BbRequest& ctx, wire::BbEcdsaSecp256k1RecoverPublicKey&& w)
{
    // Wire r,s: Fr = array<uint8_t,32>; Domain r,s: array<uint8_t,32> — same type
    auto resp =
        BbEcdsaSecp256k1RecoverPublicKey{
            .message = std::move(w.message),
            .r = w.r,
            .s = w.s,
            .v = w.v,
        }
            .execute(ctx);
    return { .public_key = point_to_wire<wire::Secp256k1Point>(resp.public_key) };
}

template <>
wire::BbEcdsaSecp256r1RecoverPublicKeyResponse handle_ecdsa_secp256r1_recover_public_key(
    BbRequest& ctx, wire::BbEcdsaSecp256r1RecoverPublicKey&& w)
{
    auto resp =
        BbEcdsaSecp256r1RecoverPublicKey{
            .message = std::move(w.message),
            .r = w.r,
            .s = w.s,
            .v = w.v,
        }
            .execute(ctx);
    return { .public_key = point_to_wire<wire::Secp256r1Point>(resp.public_key) };
}

template <>
wire::BbEcdsaSecp256k1VerifySignatureResponse handle_ecdsa_secp256k1_verify_signature(
    BbRequest& ctx, wire::BbEcdsaSecp256k1VerifySignature&& w)
{
    auto resp =
        BbEcdsaSecp256k1VerifySignature{
            .message = std::move(w.message),
            .public_key = point_from_wire<secp256k1::g1::affine_element>(w.public_key),
            .r = w.r,
            .s = w.s,
            .v = w.v,
        }
            .execute(ctx);
    return { .verified = resp.verified };
}

template <>
wire::BbEcdsaSecp256r1VerifySignatureResponse handle_ecdsa_secp256r1_verify_signature(
    BbRequest& ctx, wire::BbEcdsaSecp256r1VerifySignature&& w)
{
    auto resp =
        BbEcdsaSecp256r1VerifySignature{
            .message = std::move(w.message),
            .public_key = point_from_wire<secp256r1::g1::affine_element>(w.public_key),
            .r = w.r,
            .s = w.s,
            .v = w.v,
        }
            .execute(ctx);
    return { .verified = resp.verified };
}

// ===========================================================================================
// SRS handlers
// ===========================================================================================

template <> wire::BbSrsInitSrsResponse handle_srs_init_srs(BbRequest& ctx, wire::BbSrsInitSrs&& w)
{
    auto resp =
        BbSrsInitSrs{
            .points_buf = std::move(w.points_buf),
            .num_points = w.num_points,
            .g2_point = std::move(w.g2_point),
        }
            .execute(ctx);
    return { .points_buf = std::move(resp.points_buf) };
}

template <>
wire::BbSrsInitGrumpkinSrsResponse handle_srs_init_grumpkin_srs(BbRequest& ctx, wire::BbSrsInitGrumpkinSrs&& w)
{
    BbSrsInitGrumpkinSrs{
        .points_buf = std::move(w.points_buf),
        .num_points = w.num_points,
    }
        .execute(ctx);
    return {};
}

// Explicit instantiation of the dispatch handler for BbRequest
template ::ipc::Handler make_bb_handler(BbRequest& ctx);

} // namespace bb::bbapi
