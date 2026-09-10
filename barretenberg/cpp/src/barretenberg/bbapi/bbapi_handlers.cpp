/**
 * @file bbapi_handlers.cpp
 * @brief Per-command handlers consumed by the codegen-emitted server dispatch.
 *
 * Each handler matches the signature declared by generated/bb_dispatch.hpp
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
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/bbapi/bbapi_wire_convert.hpp"
#include "barretenberg/bbapi/generated/bb_dispatch.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/crypto/aes128/aes128.hpp"
#include "barretenberg/crypto/blake2s/blake2s.hpp"
#include "barretenberg/crypto/ecdsa/ecdsa.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/crypto/pedersen_hash/pedersen.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_permutation.hpp"
#include "barretenberg/crypto/schnorr/schnorr.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/srs/factories/bn254_crs_data.hpp"
#include "barretenberg/srs/factories/bn254_g1_chunk_hashes.hpp"
#include "barretenberg/srs/global_crs.hpp"
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

void handle_avm_prove(BBApiRequest& /*ctx*/, wire::BbAvmProve&& cmd, Responder<wire::BbAvmProveResponse> respond)
{
    reset_avm_stats();
    auto result = avm_prove_from_bytes(std::move(cmd.inputs));
    respond.ok({ .proof = fr_vec_to_wire(result.proof), .stats = snapshot_avm_stats_wire() });
}
void handle_avm_verify(BBApiRequest& /*ctx*/, wire::BbAvmVerify&& cmd, Responder<wire::BbAvmVerifyResponse> respond)
{
    bool verified = avm_verify_from_bytes(fr_vec_from_wire(cmd.proof), std::move(cmd.public_inputs));
    respond.ok({ .verified = verified });
}
void handle_avm_check_circuit(BBApiRequest& /*ctx*/,
                              wire::BbAvmCheckCircuit&& cmd,
                              Responder<wire::BbAvmCheckCircuitResponse> respond)
{
    reset_avm_stats();
    bool passed = avm_check_circuit_from_bytes(std::move(cmd.inputs));
    respond.ok({ .passed = passed, .stats = snapshot_avm_stats_wire() });
}

// ===========================================================================
// Circuit + Chonk + UltraHonk
// ===========================================================================

// UltraHonk handlers live in bbapi_ultra_honk.cpp.
// Chonk handlers live in bbapi_chonk.cpp.

// ===========================================================================
// Hashing primitives
// ===========================================================================

void handle_poseidon2_hash(BBApiRequest& /*ctx*/,
                           wire::BbPoseidon2Hash&& cmd,
                           Responder<wire::BbPoseidon2HashResponse> respond)
{
    auto inputs = fr_vec_from_wire(cmd.inputs);
    auto hash = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(inputs);
    respond.ok({ .hash = fr_to_wire(hash) });
}
void handle_poseidon2_permutation(BBApiRequest& /*ctx*/,
                                  wire::BbPoseidon2Permutation&& cmd,
                                  Responder<wire::BbPoseidon2PermutationResponse> respond)
{
    using Permutation = crypto::Poseidon2Permutation<crypto::Poseidon2Bn254ScalarFieldParams>;
    auto inputs = fr_array_from_wire<4>(cmd.inputs);
    auto outputs = Permutation::permutation(inputs);
    respond.ok({ .outputs = fr_array_to_wire<4>(outputs) });
}
void handle_pedersen_commit(BBApiRequest& /*ctx*/,
                            wire::BbPedersenCommit&& cmd,
                            Responder<wire::BbPedersenCommitResponse> respond)
{
    crypto::GeneratorContext<curve::Grumpkin> gctx;
    gctx.offset = static_cast<size_t>(cmd.hash_index);
    auto inputs = fr_vec_from_wire(cmd.inputs);
    auto point = crypto::pedersen_commitment::commit_native(inputs, gctx);
    respond.ok({ .point = grumpkin_point_to_wire(point) });
}
void handle_pedersen_hash(BBApiRequest& /*ctx*/,
                          wire::BbPedersenHash&& cmd,
                          Responder<wire::BbPedersenHashResponse> respond)
{
    crypto::GeneratorContext<curve::Grumpkin> gctx;
    gctx.offset = static_cast<size_t>(cmd.hash_index);
    auto inputs = fr_vec_from_wire(cmd.inputs);
    auto hash = crypto::pedersen_hash::hash(inputs, gctx);
    respond.ok({ .hash = fr_to_wire(hash) });
}
void handle_pedersen_hash_buffer(BBApiRequest& /*ctx*/,
                                 wire::BbPedersenHashBuffer&& cmd,
                                 Responder<wire::BbPedersenHashBufferResponse> respond)
{
    crypto::GeneratorContext<curve::Grumpkin> gctx;
    gctx.offset = static_cast<size_t>(cmd.hash_index);
    auto hash = crypto::pedersen_hash::hash_buffer(cmd.input, gctx);
    respond.ok({ .hash = fr_to_wire(hash) });
}
void handle_blake2s(BBApiRequest& /*ctx*/, wire::BbBlake2s&& cmd, Responder<wire::BbBlake2sResponse> respond)
{
    respond.ok({ .hash = crypto::blake2s(cmd.data) });
}
void handle_blake2s_to_field(BBApiRequest& /*ctx*/,
                             wire::BbBlake2sToField&& cmd,
                             Responder<wire::BbBlake2sToFieldResponse> respond)
{
    auto hash_result = crypto::blake2s(cmd.data);
    respond.ok({ .field = fr_to_wire(fr::serialize_from_buffer(hash_result.data())) });
}
void handle_aes_encrypt(BBApiRequest& /*ctx*/, wire::BbAesEncrypt&& cmd, Responder<wire::BbAesEncryptResponse> respond)
{
    BB_ASSERT(cmd.length == cmd.plaintext.size(), "AesEncrypt: length must equal plaintext.size()");
    BB_ASSERT(cmd.length % 16 == 0, "AesEncrypt: length must be a multiple of 16");

    std::vector<uint8_t> result = std::move(cmd.plaintext);
    result.resize(cmd.length);
    crypto::aes128_encrypt_buffer_cbc(result.data(), cmd.iv.data(), cmd.key.data(), cmd.length);
    respond.ok({ .ciphertext = std::move(result) });
}
void handle_aes_decrypt(BBApiRequest& /*ctx*/, wire::BbAesDecrypt&& cmd, Responder<wire::BbAesDecryptResponse> respond)
{
    BB_ASSERT(cmd.length == cmd.ciphertext.size(), "AesDecrypt: length must equal ciphertext.size()");
    BB_ASSERT(cmd.length % 16 == 0, "AesDecrypt: length must be a multiple of 16");

    std::vector<uint8_t> result = std::move(cmd.ciphertext);
    result.resize(cmd.length);
    crypto::aes128_decrypt_buffer_cbc(result.data(), cmd.iv.data(), cmd.key.data(), cmd.length);
    respond.ok({ .plaintext = std::move(result) });
}

void handle_grumpkin_get_random_fr(BBApiRequest& /*ctx*/,
                                   wire::BbGrumpkinGetRandomFr&& /*cmd*/,
                                   Responder<wire::BbGrumpkinGetRandomFrResponse> respond)
{
    respond.ok({ .value = field_to_wire(grumpkin::fr::random_element()) });
}
void handle_secp256k1_get_random_fr(BBApiRequest& /*ctx*/,
                                    wire::BbSecp256k1GetRandomFr&& /*cmd*/,
                                    Responder<wire::BbSecp256k1GetRandomFrResponse> respond)
{
    respond.ok({ .value = field_to_wire_as<Secp256k1Fr>(secp256k1::fr::random_element()) });
}

// ===========================================================================
// Grumpkin curve
// ===========================================================================

void handle_grumpkin_mul(BBApiRequest& /*ctx*/,
                         wire::BbGrumpkinMul&& cmd,
                         Responder<wire::BbGrumpkinMulResponse> respond)
{
    auto point = grumpkin_point_from_wire(cmd.point);
    auto scalar = field_from_wire<grumpkin::fr>(cmd.scalar);
    if (!point.on_curve()) {
        respond.error("Input point must be on the curve");
        return;
    }
    respond.ok({ .point = grumpkin_point_to_wire(point * scalar) });
}
void handle_grumpkin_add(BBApiRequest& /*ctx*/,
                         wire::BbGrumpkinAdd&& cmd,
                         Responder<wire::BbGrumpkinAddResponse> respond)
{
    auto a = grumpkin_point_from_wire(cmd.point_a);
    auto b = grumpkin_point_from_wire(cmd.point_b);
    if (!a.on_curve()) {
        respond.error("Input point_a must be on the curve");
        return;
    }
    if (!b.on_curve()) {
        respond.error("Input point_b must be on the curve");
        return;
    }
    respond.ok({ .point = grumpkin_point_to_wire(a + b) });
}
void handle_grumpkin_batch_mul(BBApiRequest& /*ctx*/,
                               wire::BbGrumpkinBatchMul&& cmd,
                               Responder<wire::BbGrumpkinBatchMulResponse> respond)
{
    auto points = grumpkin_point_vec_from_wire(cmd.points);
    auto scalar = field_from_wire<grumpkin::fr>(cmd.scalar);
    for (const auto& p : points) {
        if (!p.on_curve()) {
            respond.error("Input point must be on the curve");
            return;
        }
    }
    auto output = grumpkin::g1::element::batch_mul_with_endomorphism(points, scalar);
    respond.ok({ .points = grumpkin_point_vec_to_wire(output) });
}
wire::BbGrumpkinGetRandomFrResponse handle_grumpkin_get_random_fr(BBApiRequest& /*ctx*/,
                                                                  wire::BbGrumpkinGetRandomFr&& /*cmd*/)
{
    return { .value = fr_to_wire(bb::fr::random_element()) };
}
void handle_grumpkin_reduce512(BBApiRequest& /*ctx*/,
                               wire::BbGrumpkinReduce512&& cmd,
                               Responder<wire::BbGrumpkinReduce512Response> respond)
{
    auto bigint_input = from_buffer<uint512_t>(cmd.input.data());
    uint512_t barretenberg_modulus(bb::fr::modulus);
    uint512_t target_output = bigint_input % barretenberg_modulus;
    respond.ok({ .value = fr_to_wire(bb::fr(target_output.lo)) });
}

// ===========================================================================
// Secp256k1 curve
// ===========================================================================

void handle_secp256k1_mul(BBApiRequest& /*ctx*/,
                          wire::BbSecp256k1Mul&& cmd,
                          Responder<wire::BbSecp256k1MulResponse> respond)
{
    auto point = secp256k1_point_from_wire(cmd.point);
    auto scalar = field_from_wire<secp256k1::fr>(cmd.scalar);
    if (!point.on_curve()) {
        respond.error("Input point must be on the curve");
        return;
    }
    respond.ok({ .point = secp256k1_point_to_wire(point * scalar) });
}
wire::BbSecp256k1GetRandomFrResponse handle_secp256k1_get_random_fr(BBApiRequest& /*ctx*/,
                                                                    wire::BbSecp256k1GetRandomFr&& /*cmd*/)
{
    return { .value = field_to_wire_as<Secp256k1Fr>(secp256k1::fr::random_element()) };
}
void handle_secp256k1_reduce512(BBApiRequest& /*ctx*/,
                                wire::BbSecp256k1Reduce512&& cmd,
                                Responder<wire::BbSecp256k1Reduce512Response> respond)
{
    auto bigint_input = from_buffer<uint512_t>(cmd.input.data());
    uint512_t secp256k1_modulus(secp256k1::fr::modulus);
    uint512_t target_output = bigint_input % secp256k1_modulus;
    respond.ok({ .value = field_to_wire_as<Secp256k1Fr>(secp256k1::fr(target_output.lo)) });
}

// ===========================================================================
// Bn254 curve
// ===========================================================================

void handle_bn254_fr_sqrt(BBApiRequest& /*ctx*/,
                          wire::BbBn254FrSqrt&& cmd,
                          Responder<wire::BbBn254FrSqrtResponse> respond)
{
    auto [is_sqr, root] = fr_from_wire(cmd.input).sqrt();
    respond.ok({ .is_square_root = is_sqr, .value = fr_to_wire(root) });
}
void handle_bn254_fq_sqrt(BBApiRequest& /*ctx*/,
                          wire::BbBn254FqSqrt&& cmd,
                          Responder<wire::BbBn254FqSqrtResponse> respond)
{
    auto [is_sqr, root] = field_from_wire<bb::fq>(cmd.input).sqrt();
    respond.ok({ .is_square_root = is_sqr, .value = field_to_wire_as<Fq>(root) });
}
void handle_bn254_g1_mul(BBApiRequest& /*ctx*/, wire::BbBn254G1Mul&& cmd, Responder<wire::BbBn254G1MulResponse> respond)
{
    auto point = bn254_g1_point_from_wire(cmd.point);
    auto scalar = fr_from_wire(cmd.scalar);
    if (!point.on_curve()) {
        respond.error("Input point must be on the curve");
        return;
    }
    auto result = point * scalar;
    if (!result.on_curve()) {
        respond.error("Output point must be on the curve");
        return;
    }
    respond.ok({ .point = bn254_g1_point_to_wire(result) });
}
void handle_bn254_g2_mul(BBApiRequest& /*ctx*/, wire::BbBn254G2Mul&& cmd, Responder<wire::BbBn254G2MulResponse> respond)
{
    auto point = bn254_g2_point_from_wire(cmd.point);
    auto scalar = fr_from_wire(cmd.scalar);
    if (!point.on_curve()) {
        respond.error("Input point must be on the curve");
        return;
    }
    // BN254 G2 has cofactor h2 ≈ 2^254. An on-curve point may lie in a cofactor subgroup of order
    // dividing h2 rather than the prime-order subgroup; we do not want to allow such points
    // as inputs to bbapi.
    if (!point.is_in_prime_subgroup()) {
        respond.error("Input point must lie in the prime-order subgroup");
        return;
    }
    auto result = point * scalar;
    if (!result.on_curve()) {
        respond.error("Output point must be on the curve");
        return;
    }
    respond.ok({ .point = bn254_g2_point_to_wire(result) });
}
void handle_bn254_g1_is_on_curve(BBApiRequest& /*ctx*/,
                                 wire::BbBn254G1IsOnCurve&& cmd,
                                 Responder<wire::BbBn254G1IsOnCurveResponse> respond)
{
    respond.ok({ .is_on_curve = bn254_g1_point_from_wire(cmd.point).on_curve() });
}
void handle_bn254_g1_from_compressed(BBApiRequest& /*ctx*/,
                                     wire::BbBn254G1FromCompressed&& cmd,
                                     Responder<wire::BbBn254G1FromCompressedResponse> respond)
{
    uint256_t compressed_value = from_buffer<uint256_t>(cmd.compressed.data());
    auto point = bb::g1::affine_element::from_compressed(compressed_value);
    if (!point.on_curve()) {
        respond.error("Decompressed point is not on the curve");
        return;
    }
    respond.ok({ .point = bn254_g1_point_to_wire(point) });
}

// ===========================================================================
// Schnorr
// ===========================================================================

void handle_schnorr_compute_public_key(BBApiRequest& /*ctx*/,
                                       wire::BbSchnorrComputePublicKey&& cmd,
                                       Responder<wire::BbSchnorrComputePublicKeyResponse> respond)
{
    auto private_key = field_from_wire<grumpkin::fr>(cmd.private_key);
    respond.ok({ .public_key = grumpkin_point_to_wire(grumpkin::g1::one * private_key) });
}
// Schnorr signing takes a pre-derived field element message.
void handle_schnorr_construct_signature(BBApiRequest& /*ctx*/,
                                        wire::BbSchnorrConstructSignature&& cmd,
                                        Responder<wire::BbSchnorrConstructSignatureResponse> respond)
{
    auto private_key = field_from_wire<grumpkin::fr>(cmd.private_key);
    grumpkin::g1::affine_element pub_key = grumpkin::g1::one * private_key;
    crypto::schnorr_key_pair<grumpkin::fr, grumpkin::g1> key_pair = { private_key, pub_key };

    auto message_field = field_from_wire<grumpkin::fq>(cmd.message_field);
    auto sig = crypto::schnorr_construct_signature<grumpkin::fr, grumpkin::g1>(message_field, key_pair);
    crypto::secure_erase_bytes(&key_pair.private_key, sizeof(key_pair.private_key));

    respond.ok({ .s = field_to_wire<grumpkin::fr>(sig.s), .e = field_to_wire<grumpkin::fr>(sig.e) });
}
void handle_schnorr_verify_signature(BBApiRequest& /*ctx*/,
                                     wire::BbSchnorrVerifySignature&& cmd,
                                     Responder<wire::BbSchnorrVerifySignatureResponse> respond)
{
    auto message_field = field_from_wire<grumpkin::fq>(cmd.message_field);
    crypto::schnorr_signature sig = { field_from_wire<grumpkin::fr>(cmd.s), field_from_wire<grumpkin::fr>(cmd.e) };
    auto public_key = grumpkin_point_from_wire(cmd.public_key);

    bool result = crypto::schnorr_verify_signature<grumpkin::fr, grumpkin::g1>(message_field, public_key, sig);
    respond.ok({ .verified = result });
}

// ===========================================================================
// ECDSA
// ===========================================================================

void handle_ecdsa_secp256k1_compute_public_key(BBApiRequest& /*ctx*/,
                                               wire::BbEcdsaSecp256k1ComputePublicKey&& cmd,
                                               Responder<wire::BbEcdsaSecp256k1ComputePublicKeyResponse> respond)
{
    auto private_key = field_from_wire<secp256k1::fr>(cmd.private_key);
    respond.ok({ .public_key = secp256k1_point_to_wire(secp256k1::g1::one * private_key) });
}
void handle_ecdsa_secp256r1_compute_public_key(BBApiRequest& /*ctx*/,
                                               wire::BbEcdsaSecp256r1ComputePublicKey&& cmd,
                                               Responder<wire::BbEcdsaSecp256r1ComputePublicKeyResponse> respond)
{
    auto private_key = field_from_wire<secp256r1::fr>(cmd.private_key);
    respond.ok({ .public_key = secp256r1_point_to_wire(secp256r1::g1::one * private_key) });
}
void handle_ecdsa_secp256k1_construct_signature(BBApiRequest& /*ctx*/,
                                                wire::BbEcdsaSecp256k1ConstructSignature&& cmd,
                                                Responder<wire::BbEcdsaSecp256k1ConstructSignatureResponse> respond)
{
    auto private_key = field_from_wire<secp256k1::fr>(cmd.private_key);
    auto pub_key = secp256k1::g1::one * private_key;
    crypto::ecdsa_key_pair<secp256k1::fr, secp256k1::g1> key_pair = { private_key, pub_key };
    std::string message_str(reinterpret_cast<const char*>(cmd.message.data()), cmd.message.size());
    auto sig = crypto::ecdsa_construct_signature<crypto::Sha256Hasher, secp256k1::fq, secp256k1::fr, secp256k1::g1>(
        message_str, key_pair);
    respond.ok({ .r = sig.r, .s = sig.s, .v = sig.v });
}
void handle_ecdsa_secp256r1_construct_signature(BBApiRequest& /*ctx*/,
                                                wire::BbEcdsaSecp256r1ConstructSignature&& cmd,
                                                Responder<wire::BbEcdsaSecp256r1ConstructSignatureResponse> respond)
{
    auto private_key = field_from_wire<secp256r1::fr>(cmd.private_key);
    auto pub_key = secp256r1::g1::one * private_key;
    crypto::ecdsa_key_pair<secp256r1::fr, secp256r1::g1> key_pair = { private_key, pub_key };
    std::string message_str(reinterpret_cast<const char*>(cmd.message.data()), cmd.message.size());
    auto sig = crypto::ecdsa_construct_signature<crypto::Sha256Hasher, secp256r1::fq, secp256r1::fr, secp256r1::g1>(
        message_str, key_pair);
    respond.ok({ .r = sig.r, .s = sig.s, .v = sig.v });
}
void handle_ecdsa_secp256k1_recover_public_key(BBApiRequest& /*ctx*/,
                                               wire::BbEcdsaSecp256k1RecoverPublicKey&& cmd,
                                               Responder<wire::BbEcdsaSecp256k1RecoverPublicKeyResponse> respond)
{
    crypto::ecdsa_signature sig = { cmd.r, cmd.s, cmd.v };
    std::string message_str(reinterpret_cast<const char*>(cmd.message.data()), cmd.message.size());
    auto pubkey = crypto::ecdsa_recover_public_key<crypto::Sha256Hasher, secp256k1::fq, secp256k1::fr, secp256k1::g1>(
        message_str, sig);
    respond.ok({ .public_key = secp256k1_point_to_wire(pubkey) });
}
void handle_ecdsa_secp256r1_recover_public_key(BBApiRequest& /*ctx*/,
                                               wire::BbEcdsaSecp256r1RecoverPublicKey&& cmd,
                                               Responder<wire::BbEcdsaSecp256r1RecoverPublicKeyResponse> respond)
{
    crypto::ecdsa_signature sig = { cmd.r, cmd.s, cmd.v };
    std::string message_str(reinterpret_cast<const char*>(cmd.message.data()), cmd.message.size());
    auto pubkey = crypto::ecdsa_recover_public_key<crypto::Sha256Hasher, secp256r1::fq, secp256r1::fr, secp256r1::g1>(
        message_str, sig);
    respond.ok({ .public_key = secp256r1_point_to_wire(pubkey) });
}
void handle_ecdsa_secp256k1_verify_signature(BBApiRequest& /*ctx*/,
                                             wire::BbEcdsaSecp256k1VerifySignature&& cmd,
                                             Responder<wire::BbEcdsaSecp256k1VerifySignatureResponse> respond)
{
    crypto::ecdsa_signature sig = { cmd.r, cmd.s, cmd.v };
    std::string message_str(reinterpret_cast<const char*>(cmd.message.data()), cmd.message.size());
    auto pubkey = secp256k1_point_from_wire(cmd.public_key);
    bool verified = crypto::ecdsa_verify_signature<crypto::Sha256Hasher, secp256k1::fq, secp256k1::fr, secp256k1::g1>(
        message_str, pubkey, sig);
    respond.ok({ .verified = verified });
}
void handle_ecdsa_secp256r1_verify_signature(BBApiRequest& /*ctx*/,
                                             wire::BbEcdsaSecp256r1VerifySignature&& cmd,
                                             Responder<wire::BbEcdsaSecp256r1VerifySignatureResponse> respond)
{
    crypto::ecdsa_signature sig = { cmd.r, cmd.s, cmd.v };
    std::string message_str(reinterpret_cast<const char*>(cmd.message.data()), cmd.message.size());
    auto pubkey = secp256r1_point_from_wire(cmd.public_key);
    bool verified = crypto::ecdsa_verify_signature<crypto::Sha256Hasher, secp256r1::fq, secp256r1::fr, secp256r1::g1>(
        message_str, pubkey, sig);
    respond.ok({ .verified = verified });
}

// ===========================================================================
// SRS init
// ===========================================================================

void handle_srs_init_srs(BBApiRequest& /*ctx*/, wire::BbSrsInitSrs&& cmd, Responder<wire::BbSrsInitSrsResponse> respond)
{
    constexpr size_t COMPRESSED_POINT_SIZE = 32;
    constexpr size_t UNCOMPRESSED_POINT_SIZE = sizeof(g1::affine_element); // 64

    auto& points_buf = cmd.points_buf;
    auto num_points = cmd.num_points;
    size_t bytes_per_point = num_points > 0 ? points_buf.size() / num_points : 0;
    std::vector<g1::affine_element> g1_points(num_points);
    std::vector<uint8_t> uncompressed_out;

    if (bytes_per_point == UNCOMPRESSED_POINT_SIZE) {
        parallel_for([&](ThreadChunk chunk) {
            for (auto i : chunk.range(static_cast<size_t>(num_points))) {
                g1_points[i] = from_buffer<g1::affine_element>(points_buf.data(), i * UNCOMPRESSED_POINT_SIZE);
            }
        });
    } else if (bytes_per_point == COMPRESSED_POINT_SIZE) {
        if (points_buf.size() == 0 || points_buf.size() % bb::srs::SRS_CHUNK_SIZE_BYTES != 0) {
            throw_or_abort("SrsInitSrs: compressed points_buf size " + std::to_string(points_buf.size()) +
                           " must be a positive multiple of " + std::to_string(bb::srs::SRS_CHUNK_SIZE_BYTES));
        }
        size_t num_full_chunks = points_buf.size() / bb::srs::SRS_CHUNK_SIZE_BYTES;
        size_t chunks_to_verify = std::min(num_full_chunks, static_cast<size_t>(bb::srs::SRS_NUM_FULL_CHUNKS));
        for (size_t i = 0; i < chunks_to_verify; ++i) {
            auto chunk = std::span<const uint8_t>(points_buf.data() + i * bb::srs::SRS_CHUNK_SIZE_BYTES,
                                                  bb::srs::SRS_CHUNK_SIZE_BYTES);
            auto hash = bb::crypto::sha256(chunk);
            if (hash != bb::srs::BN254_G1_CHUNK_HASHES[i]) {
                throw_or_abort("SrsInitSrs: g1 compressed chunk " + std::to_string(i) + " SHA-256 mismatch");
            }
        }
        parallel_for([&](ThreadChunk chunk) {
            for (auto i : chunk.range(static_cast<size_t>(num_points))) {
                uint256_t c = from_buffer<uint256_t>(points_buf.data(), i * COMPRESSED_POINT_SIZE);
                g1_points[i] = g1::affine_element::from_compressed(c);
            }
        });
        uncompressed_out.resize(static_cast<size_t>(num_points) * UNCOMPRESSED_POINT_SIZE);
        parallel_for([&](ThreadChunk chunk) {
            for (auto i : chunk.range(static_cast<size_t>(num_points))) {
                auto buf = to_buffer(g1_points[i]);
                std::copy(buf.begin(), buf.end(), &uncompressed_out[i * UNCOMPRESSED_POINT_SIZE]);
            }
        });
    } else {
        throw_or_abort("SrsInitSrs: invalid points_buf size. Expected 32 or 64 bytes per point, got " +
                       std::to_string(bytes_per_point));
    }

    if (num_points >= 1 && g1_points[0] != bb::srs::BN254_G1_FIRST_ELEMENT) {
        throw_or_abort("SrsInitSrs: g1_points[0] is not the canonical BN254 generator");
    }
    if (num_points >= 2 && g1_points[1] != bb::srs::get_bn254_g1_second_element()) {
        throw_or_abort("SrsInitSrs: g1_points[1] does not match the canonical trusted-setup tau·G");
    }

    auto g2_hash = bb::crypto::sha256(std::span<const uint8_t>(cmd.g2_point.data(), cmd.g2_point.size()));
    if (g2_hash != bb::srs::BN254_G2_ELEMENT_SHA256) {
        throw_or_abort("SrsInitSrs: g2_point bytes do not match the canonical Aztec [x]_2 SHA-256");
    }
    auto g2_point_elem = from_buffer<g2::affine_element>(cmd.g2_point.data());
    if (!g2_point_elem.is_in_prime_subgroup()) {
        throw_or_abort("SrsInitSrs: g2_point is not in the BN254 G2 prime-order subgroup");
    }

    bb::srs::init_bn254_mem_crs_factory(g1_points, g2_point_elem);
    respond.ok({ .points_buf = std::move(uncompressed_out) });
}
void handle_srs_init_grumpkin_srs(BBApiRequest& /*ctx*/,
                                  wire::BbSrsInitGrumpkinSrs&& cmd,
                                  Responder<wire::BbSrsInitGrumpkinSrsResponse> respond)
{
    const size_t required_size = static_cast<size_t>(cmd.num_points) * sizeof(curve::Grumpkin::AffineElement);
    if (cmd.points_buf.size() < required_size) {
        throw_or_abort("SrsInitGrumpkinSrs: points_buf too small (" + std::to_string(cmd.points_buf.size()) +
                       " bytes) for num_points=" + std::to_string(cmd.num_points) + " (need " +
                       std::to_string(required_size) + ")");
    }
    std::vector<curve::Grumpkin::AffineElement> points(cmd.num_points);
    for (uint32_t i = 0; i < cmd.num_points; ++i) {
        points[i] = from_buffer<curve::Grumpkin::AffineElement>(cmd.points_buf.data(),
                                                                i * sizeof(curve::Grumpkin::AffineElement));
    }
    bb::srs::init_grumpkin_mem_crs_factory(points);
    respond.ok({});
}

} // namespace bb::bbapi
