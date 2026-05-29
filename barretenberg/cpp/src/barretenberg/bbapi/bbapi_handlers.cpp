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
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/bbapi/bbapi_wire_convert.hpp"
#include "barretenberg/bbapi/generated/bb_ipc_server.hpp"
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

// UltraHonk handlers live in bbapi_ultra_honk.cpp.
// Chonk handlers live in bbapi_chonk.cpp.

// ===========================================================================
// Hashing primitives
// ===========================================================================

wire::Poseidon2HashResponse handle_poseidon2_hash(BBApiRequest& /*ctx*/, wire::Poseidon2Hash&& cmd)
{
    auto inputs = fr_vec_from_wire(cmd.inputs);
    auto hash = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(inputs);
    return { .hash = fr_to_wire(hash) };
}
wire::Poseidon2PermutationResponse handle_poseidon2_permutation(BBApiRequest& /*ctx*/, wire::Poseidon2Permutation&& cmd)
{
    using Permutation = crypto::Poseidon2Permutation<crypto::Poseidon2Bn254ScalarFieldParams>;
    auto inputs = fr_array_from_wire<4>(cmd.inputs);
    auto outputs = Permutation::permutation(inputs);
    return { .outputs = fr_array_to_wire<4>(outputs) };
}
wire::PedersenCommitResponse handle_pedersen_commit(BBApiRequest& /*ctx*/, wire::PedersenCommit&& cmd)
{
    crypto::GeneratorContext<curve::Grumpkin> gctx;
    gctx.offset = static_cast<size_t>(cmd.hash_index);
    auto inputs = fr_vec_from_wire(cmd.inputs);
    auto point = crypto::pedersen_commitment::commit_native(inputs, gctx);
    return { .point = grumpkin_point_to_wire(point) };
}
wire::PedersenHashResponse handle_pedersen_hash(BBApiRequest& /*ctx*/, wire::PedersenHash&& cmd)
{
    crypto::GeneratorContext<curve::Grumpkin> gctx;
    gctx.offset = static_cast<size_t>(cmd.hash_index);
    auto inputs = fr_vec_from_wire(cmd.inputs);
    auto hash = crypto::pedersen_hash::hash(inputs, gctx);
    return { .hash = fr_to_wire(hash) };
}
wire::PedersenHashBufferResponse handle_pedersen_hash_buffer(BBApiRequest& /*ctx*/, wire::PedersenHashBuffer&& cmd)
{
    crypto::GeneratorContext<curve::Grumpkin> gctx;
    gctx.offset = static_cast<size_t>(cmd.hash_index);
    auto hash = crypto::pedersen_hash::hash_buffer(cmd.input, gctx);
    return { .hash = fr_to_wire(hash) };
}
wire::Blake2sResponse handle_blake2s(BBApiRequest& /*ctx*/, wire::Blake2s&& cmd)
{
    return { .hash = crypto::blake2s(cmd.data) };
}
wire::Blake2sToFieldResponse handle_blake2s_to_field(BBApiRequest& /*ctx*/, wire::Blake2sToField&& cmd)
{
    auto hash_result = crypto::blake2s(cmd.data);
    return { .field = fr_to_wire(fr::serialize_from_buffer(hash_result.data())) };
}
wire::AesEncryptResponse handle_aes_encrypt(BBApiRequest& /*ctx*/, wire::AesEncrypt&& cmd)
{
    BB_ASSERT(cmd.length == cmd.plaintext.size(), "AesEncrypt: length must equal plaintext.size()");
    BB_ASSERT(cmd.length % 16 == 0, "AesEncrypt: length must be a multiple of 16");

    std::vector<uint8_t> result = std::move(cmd.plaintext);
    result.resize(cmd.length);
    crypto::aes128_encrypt_buffer_cbc(result.data(), cmd.iv.data(), cmd.key.data(), cmd.length);
    return { .ciphertext = std::move(result) };
}
wire::AesDecryptResponse handle_aes_decrypt(BBApiRequest& /*ctx*/, wire::AesDecrypt&& cmd)
{
    BB_ASSERT(cmd.length == cmd.ciphertext.size(), "AesDecrypt: length must equal ciphertext.size()");
    BB_ASSERT(cmd.length % 16 == 0, "AesDecrypt: length must be a multiple of 16");

    std::vector<uint8_t> result = std::move(cmd.ciphertext);
    result.resize(cmd.length);
    crypto::aes128_decrypt_buffer_cbc(result.data(), cmd.iv.data(), cmd.key.data(), cmd.length);
    return { .plaintext = std::move(result) };
}

// ===========================================================================
// Grumpkin curve
// ===========================================================================

wire::GrumpkinMulResponse handle_grumpkin_mul(BBApiRequest& request, wire::GrumpkinMul&& cmd)
{
    auto point = grumpkin_point_from_wire(cmd.point);
    auto scalar = field_from_wire<grumpkin::fr>(cmd.scalar);
    if (!point.on_curve()) {
        BBAPI_ERROR(request, "Input point must be on the curve");
    }
    return { .point = grumpkin_point_to_wire(point * scalar) };
}
wire::GrumpkinAddResponse handle_grumpkin_add(BBApiRequest& request, wire::GrumpkinAdd&& cmd)
{
    auto a = grumpkin_point_from_wire(cmd.point_a);
    auto b = grumpkin_point_from_wire(cmd.point_b);
    if (!a.on_curve()) {
        BBAPI_ERROR(request, "Input point_a must be on the curve");
    }
    if (!b.on_curve()) {
        BBAPI_ERROR(request, "Input point_b must be on the curve");
    }
    return { .point = grumpkin_point_to_wire(a + b) };
}
wire::GrumpkinBatchMulResponse handle_grumpkin_batch_mul(BBApiRequest& request, wire::GrumpkinBatchMul&& cmd)
{
    auto points = grumpkin_point_vec_from_wire(cmd.points);
    auto scalar = field_from_wire<grumpkin::fr>(cmd.scalar);
    for (const auto& p : points) {
        if (!p.on_curve()) {
            BBAPI_ERROR(request, "Input point must be on the curve");
        }
    }
    auto output = grumpkin::g1::element::batch_mul_with_endomorphism(points, scalar);
    return { .points = grumpkin_point_vec_to_wire(output) };
}
wire::GrumpkinGetRandomFrResponse handle_grumpkin_get_random_fr(BBApiRequest& /*ctx*/,
                                                                wire::GrumpkinGetRandomFr&& /*cmd*/)
{
    return { .value = fr_to_wire(bb::fr::random_element()) };
}
wire::GrumpkinReduce512Response handle_grumpkin_reduce512(BBApiRequest& /*ctx*/, wire::GrumpkinReduce512&& cmd)
{
    auto bigint_input = from_buffer<uint512_t>(cmd.input.data());
    uint512_t barretenberg_modulus(bb::fr::modulus);
    uint512_t target_output = bigint_input % barretenberg_modulus;
    return { .value = fr_to_wire(bb::fr(target_output.lo)) };
}

// ===========================================================================
// Secp256k1 curve
// ===========================================================================

wire::Secp256k1MulResponse handle_secp256k1_mul(BBApiRequest& request, wire::Secp256k1Mul&& cmd)
{
    auto point = secp256k1_point_from_wire(cmd.point);
    auto scalar = field_from_wire<secp256k1::fr>(cmd.scalar);
    if (!point.on_curve()) {
        BBAPI_ERROR(request, "Input point must be on the curve");
    }
    return { .point = secp256k1_point_to_wire(point * scalar) };
}
wire::Secp256k1GetRandomFrResponse handle_secp256k1_get_random_fr(BBApiRequest& /*ctx*/,
                                                                  wire::Secp256k1GetRandomFr&& /*cmd*/)
{
    return { .value = field_to_wire_as<::Secp256k1Fr>(secp256k1::fr::random_element()) };
}
wire::Secp256k1Reduce512Response handle_secp256k1_reduce512(BBApiRequest& /*ctx*/, wire::Secp256k1Reduce512&& cmd)
{
    auto bigint_input = from_buffer<uint512_t>(cmd.input.data());
    uint512_t secp256k1_modulus(secp256k1::fr::modulus);
    uint512_t target_output = bigint_input % secp256k1_modulus;
    return { .value = field_to_wire_as<::Secp256k1Fr>(secp256k1::fr(target_output.lo)) };
}

// ===========================================================================
// Bn254 curve
// ===========================================================================

wire::Bn254FrSqrtResponse handle_bn254_fr_sqrt(BBApiRequest& /*ctx*/, wire::Bn254FrSqrt&& cmd)
{
    auto [is_sqr, root] = fr_from_wire(cmd.input).sqrt();
    return { .is_square_root = is_sqr, .value = fr_to_wire(root) };
}
wire::Bn254FqSqrtResponse handle_bn254_fq_sqrt(BBApiRequest& /*ctx*/, wire::Bn254FqSqrt&& cmd)
{
    auto [is_sqr, root] = field_from_wire<bb::fq>(cmd.input).sqrt();
    return { .is_square_root = is_sqr, .value = field_to_wire_as<::Fq>(root) };
}
wire::Bn254G1MulResponse handle_bn254_g1_mul(BBApiRequest& request, wire::Bn254G1Mul&& cmd)
{
    auto point = bn254_g1_point_from_wire(cmd.point);
    auto scalar = fr_from_wire(cmd.scalar);
    if (!point.on_curve()) {
        BBAPI_ERROR(request, "Input point must be on the curve");
    }
    auto result = point * scalar;
    if (!result.on_curve()) {
        BBAPI_ERROR(request, "Output point must be on the curve");
    }
    return { .point = bn254_g1_point_to_wire(result) };
}
wire::Bn254G2MulResponse handle_bn254_g2_mul(BBApiRequest& request, wire::Bn254G2Mul&& cmd)
{
    auto point = bn254_g2_point_from_wire(cmd.point);
    auto scalar = fr_from_wire(cmd.scalar);
    if (!point.on_curve()) {
        BBAPI_ERROR(request, "Input point must be on the curve");
    }
    // BN254 G2 has cofactor h2 ≈ 2^254. An on-curve point may lie in a cofactor subgroup of order
    // dividing h2 rather than the prime-order subgroup; we do not want to allow such points
    // as inputs to bbapi.
    if (!point.is_in_prime_subgroup()) {
        BBAPI_ERROR(request, "Input point must lie in the prime-order subgroup");
    }
    auto result = point * scalar;
    if (!result.on_curve()) {
        BBAPI_ERROR(request, "Output point must be on the curve");
    }
    return { .point = bn254_g2_point_to_wire(result) };
}
wire::Bn254G1IsOnCurveResponse handle_bn254_g1_is_on_curve(BBApiRequest& /*ctx*/, wire::Bn254G1IsOnCurve&& cmd)
{
    return { .is_on_curve = bn254_g1_point_from_wire(cmd.point).on_curve() };
}
wire::Bn254G1FromCompressedResponse handle_bn254_g1_from_compressed(BBApiRequest& request,
                                                                    wire::Bn254G1FromCompressed&& cmd)
{
    uint256_t compressed_value = from_buffer<uint256_t>(cmd.compressed.data());
    auto point = bb::g1::affine_element::from_compressed(compressed_value);
    if (!point.on_curve()) {
        BBAPI_ERROR(request, "Decompressed point is not on the curve");
    }
    return { .point = bn254_g1_point_to_wire(point) };
}

// ===========================================================================
// Schnorr
// ===========================================================================

wire::SchnorrComputePublicKeyResponse handle_schnorr_compute_public_key(BBApiRequest& /*ctx*/,
                                                                        wire::SchnorrComputePublicKey&& cmd)
{
    auto private_key = field_from_wire<grumpkin::fr>(cmd.private_key);
    return { .public_key = grumpkin_point_to_wire(grumpkin::g1::one * private_key) };
}
// Schnorr signing takes a pre-derived field element. The wire keeps
// `message: vector<u8>` for layout consistency with other byte-buffer
// endpoints; callers must pass the 32-byte big-endian field encoding.
wire::SchnorrConstructSignatureResponse handle_schnorr_construct_signature(BBApiRequest& /*ctx*/,
                                                                           wire::SchnorrConstructSignature&& cmd)
{
    auto private_key = field_from_wire<grumpkin::fr>(cmd.private_key);
    grumpkin::g1::affine_element pub_key = grumpkin::g1::one * private_key;
    crypto::schnorr_key_pair<grumpkin::fr, grumpkin::g1> key_pair = { private_key, pub_key };

    BB_ASSERT_EQ(
        cmd.message.size(), size_t{ 32 }, "SchnorrConstructSignature: message must be 32 bytes (field element)");
    auto message_field = grumpkin::fq::serialize_from_buffer(cmd.message.data());
    auto sig = crypto::schnorr_construct_signature<grumpkin::fr, grumpkin::g1>(message_field, key_pair);
    crypto::secure_erase_bytes(&key_pair.private_key, sizeof(key_pair.private_key));

    return { .s = field_to_wire<grumpkin::fr>(sig.s), .e = field_to_wire<grumpkin::fr>(sig.e) };
}
wire::SchnorrVerifySignatureResponse handle_schnorr_verify_signature(BBApiRequest& /*ctx*/,
                                                                     wire::SchnorrVerifySignature&& cmd)
{
    BB_ASSERT_EQ(cmd.message.size(), size_t{ 32 }, "SchnorrVerifySignature: message must be 32 bytes (field element)");
    auto message_field = grumpkin::fq::serialize_from_buffer(cmd.message.data());
    crypto::schnorr_signature sig = { field_from_wire<grumpkin::fr>(cmd.s), field_from_wire<grumpkin::fr>(cmd.e) };
    auto public_key = grumpkin_point_from_wire(cmd.public_key);

    bool result = crypto::schnorr_verify_signature<grumpkin::fr, grumpkin::g1>(message_field, public_key, sig);
    return { .verified = result };
}

// ===========================================================================
// ECDSA
// ===========================================================================

wire::EcdsaSecp256k1ComputePublicKeyResponse handle_ecdsa_secp256k1_compute_public_key(
    BBApiRequest& /*ctx*/, wire::EcdsaSecp256k1ComputePublicKey&& cmd)
{
    auto private_key = field_from_wire<secp256k1::fr>(cmd.private_key);
    return { .public_key = secp256k1_point_to_wire(secp256k1::g1::one * private_key) };
}
wire::EcdsaSecp256r1ComputePublicKeyResponse handle_ecdsa_secp256r1_compute_public_key(
    BBApiRequest& /*ctx*/, wire::EcdsaSecp256r1ComputePublicKey&& cmd)
{
    auto private_key = field_from_wire<secp256r1::fr>(cmd.private_key);
    return { .public_key = secp256r1_point_to_wire(secp256r1::g1::one * private_key) };
}
wire::EcdsaSecp256k1ConstructSignatureResponse handle_ecdsa_secp256k1_construct_signature(
    BBApiRequest& /*ctx*/, wire::EcdsaSecp256k1ConstructSignature&& cmd)
{
    auto private_key = field_from_wire<secp256k1::fr>(cmd.private_key);
    auto pub_key = secp256k1::g1::one * private_key;
    crypto::ecdsa_key_pair<secp256k1::fr, secp256k1::g1> key_pair = { private_key, pub_key };
    std::string message_str(reinterpret_cast<const char*>(cmd.message.data()), cmd.message.size());
    auto sig = crypto::ecdsa_construct_signature<crypto::Sha256Hasher, secp256k1::fq, secp256k1::fr, secp256k1::g1>(
        message_str, key_pair);
    return { .r = sig.r, .s = sig.s, .v = sig.v };
}
wire::EcdsaSecp256r1ConstructSignatureResponse handle_ecdsa_secp256r1_construct_signature(
    BBApiRequest& /*ctx*/, wire::EcdsaSecp256r1ConstructSignature&& cmd)
{
    auto private_key = field_from_wire<secp256r1::fr>(cmd.private_key);
    auto pub_key = secp256r1::g1::one * private_key;
    crypto::ecdsa_key_pair<secp256r1::fr, secp256r1::g1> key_pair = { private_key, pub_key };
    std::string message_str(reinterpret_cast<const char*>(cmd.message.data()), cmd.message.size());
    auto sig = crypto::ecdsa_construct_signature<crypto::Sha256Hasher, secp256r1::fq, secp256r1::fr, secp256r1::g1>(
        message_str, key_pair);
    return { .r = sig.r, .s = sig.s, .v = sig.v };
}
wire::EcdsaSecp256k1RecoverPublicKeyResponse handle_ecdsa_secp256k1_recover_public_key(
    BBApiRequest& /*ctx*/, wire::EcdsaSecp256k1RecoverPublicKey&& cmd)
{
    crypto::ecdsa_signature sig = { cmd.r, cmd.s, cmd.v };
    std::string message_str(reinterpret_cast<const char*>(cmd.message.data()), cmd.message.size());
    auto pubkey = crypto::ecdsa_recover_public_key<crypto::Sha256Hasher, secp256k1::fq, secp256k1::fr, secp256k1::g1>(
        message_str, sig);
    return { .public_key = secp256k1_point_to_wire(pubkey) };
}
wire::EcdsaSecp256r1RecoverPublicKeyResponse handle_ecdsa_secp256r1_recover_public_key(
    BBApiRequest& /*ctx*/, wire::EcdsaSecp256r1RecoverPublicKey&& cmd)
{
    crypto::ecdsa_signature sig = { cmd.r, cmd.s, cmd.v };
    std::string message_str(reinterpret_cast<const char*>(cmd.message.data()), cmd.message.size());
    auto pubkey = crypto::ecdsa_recover_public_key<crypto::Sha256Hasher, secp256r1::fq, secp256r1::fr, secp256r1::g1>(
        message_str, sig);
    return { .public_key = secp256r1_point_to_wire(pubkey) };
}
wire::EcdsaSecp256k1VerifySignatureResponse handle_ecdsa_secp256k1_verify_signature(
    BBApiRequest& /*ctx*/, wire::EcdsaSecp256k1VerifySignature&& cmd)
{
    crypto::ecdsa_signature sig = { cmd.r, cmd.s, cmd.v };
    std::string message_str(reinterpret_cast<const char*>(cmd.message.data()), cmd.message.size());
    auto pubkey = secp256k1_point_from_wire(cmd.public_key);
    bool verified = crypto::ecdsa_verify_signature<crypto::Sha256Hasher, secp256k1::fq, secp256k1::fr, secp256k1::g1>(
        message_str, pubkey, sig);
    return { .verified = verified };
}
wire::EcdsaSecp256r1VerifySignatureResponse handle_ecdsa_secp256r1_verify_signature(
    BBApiRequest& /*ctx*/, wire::EcdsaSecp256r1VerifySignature&& cmd)
{
    crypto::ecdsa_signature sig = { cmd.r, cmd.s, cmd.v };
    std::string message_str(reinterpret_cast<const char*>(cmd.message.data()), cmd.message.size());
    auto pubkey = secp256r1_point_from_wire(cmd.public_key);
    bool verified = crypto::ecdsa_verify_signature<crypto::Sha256Hasher, secp256r1::fq, secp256r1::fr, secp256r1::g1>(
        message_str, pubkey, sig);
    return { .verified = verified };
}

// ===========================================================================
// SRS init
// ===========================================================================

wire::SrsInitSrsResponse handle_srs_init_srs(BBApiRequest& /*ctx*/, wire::SrsInitSrs&& cmd)
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
    return { .points_buf = std::move(uncompressed_out) };
}
wire::SrsInitGrumpkinSrsResponse handle_srs_init_grumpkin_srs(BBApiRequest& /*ctx*/, wire::SrsInitGrumpkinSrs&& cmd)
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
    return {};
}

} // namespace bb::bbapi
