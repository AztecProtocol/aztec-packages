/**
 * @file bbapi_handlers.cpp
 * @brief Per-command handlers consumed by the codegen-emitted server dispatch.
 *
 * Each handler matches the signature declared by generated/bb_ipc_server.hpp
 * but as a non-template overload for `BBApiRequest` so make_bb_handler<BBApiRequest>
 * instantiation resolves to these definitions via overload resolution.
 *
 * The wire-typed command and the hand-written domain command share a
 * SERIALIZATION_FIELDS shape (same field names, msgpack-compatible field
 * types), so each handler is a one-liner: msgpack-roundtrip wire->domain,
 * call execute(), msgpack-roundtrip domain->wire. PR-F will replace the
 * roundtrips with field-by-field conversions and delete the hand-written
 * domain types.
 */
#include "barretenberg/bbapi/bbapi_handlers.hpp"
#include "barretenberg/bbapi/bbapi_avm.hpp"
#include "barretenberg/bbapi/bbapi_chonk.hpp"
#include "barretenberg/bbapi/bbapi_crypto.hpp"
#include "barretenberg/bbapi/bbapi_ecc.hpp"
#include "barretenberg/bbapi/bbapi_ecdsa.hpp"
#include "barretenberg/bbapi/bbapi_schnorr.hpp"
#include "barretenberg/bbapi/bbapi_srs.hpp"
#include "barretenberg/bbapi/bbapi_ultra_honk.hpp"
#include "barretenberg/bbapi/bbapi_wire_convert.hpp"
#include "barretenberg/bbapi/generated/bb_ipc_server.hpp"

namespace bb::bbapi {

template <typename Wire, typename Domain> static inline Wire roundtrip(const Domain& src)
{
    return msgpack_roundtrip<Wire>(src);
}

wire::AvmProveResponse handle_avm_prove(BBApiRequest& ctx, wire::AvmProve&& cmd)
{
    return roundtrip<wire::AvmProveResponse>(roundtrip<AvmProve>(cmd).execute(ctx));
}
wire::AvmVerifyResponse handle_avm_verify(BBApiRequest& ctx, wire::AvmVerify&& cmd)
{
    return roundtrip<wire::AvmVerifyResponse>(roundtrip<AvmVerify>(cmd).execute(ctx));
}
wire::AvmCheckCircuitResponse handle_avm_check_circuit(BBApiRequest& ctx, wire::AvmCheckCircuit&& cmd)
{
    return roundtrip<wire::AvmCheckCircuitResponse>(roundtrip<AvmCheckCircuit>(cmd).execute(ctx));
}
wire::CircuitProveResponse handle_circuit_prove(BBApiRequest& ctx, wire::CircuitProve&& cmd)
{
    return roundtrip<wire::CircuitProveResponse>(roundtrip<CircuitProve>(cmd).execute(ctx));
}
wire::CircuitComputeVkResponse handle_circuit_compute_vk(BBApiRequest& ctx, wire::CircuitComputeVk&& cmd)
{
    return roundtrip<wire::CircuitComputeVkResponse>(roundtrip<CircuitComputeVk>(cmd).execute(ctx));
}
wire::CircuitInfoResponse handle_circuit_stats(BBApiRequest& ctx, wire::CircuitStats&& cmd)
{
    return roundtrip<wire::CircuitInfoResponse>(roundtrip<CircuitStats>(cmd).execute(ctx));
}
wire::CircuitVerifyResponse handle_circuit_verify(BBApiRequest& ctx, wire::CircuitVerify&& cmd)
{
    return roundtrip<wire::CircuitVerifyResponse>(roundtrip<CircuitVerify>(cmd).execute(ctx));
}
wire::ChonkComputeVkResponse handle_chonk_compute_vk(BBApiRequest& ctx, wire::ChonkComputeVk&& cmd)
{
    return roundtrip<wire::ChonkComputeVkResponse>(roundtrip<ChonkComputeVk>(cmd).execute(ctx));
}
wire::ChonkStartResponse handle_chonk_start(BBApiRequest& ctx, wire::ChonkStart&& cmd)
{
    return roundtrip<wire::ChonkStartResponse>(roundtrip<ChonkStart>(cmd).execute(ctx));
}
wire::ChonkLoadResponse handle_chonk_load(BBApiRequest& ctx, wire::ChonkLoad&& cmd)
{
    return roundtrip<wire::ChonkLoadResponse>(roundtrip<ChonkLoad>(cmd).execute(ctx));
}
wire::ChonkAccumulateResponse handle_chonk_accumulate(BBApiRequest& ctx, wire::ChonkAccumulate&& cmd)
{
    return roundtrip<wire::ChonkAccumulateResponse>(roundtrip<ChonkAccumulate>(cmd).execute(ctx));
}
wire::ChonkProveResponse handle_chonk_prove(BBApiRequest& ctx, wire::ChonkProve&& cmd)
{
    return roundtrip<wire::ChonkProveResponse>(roundtrip<ChonkProve>(cmd).execute(ctx));
}
wire::ChonkVerifyResponse handle_chonk_verify(BBApiRequest& ctx, wire::ChonkVerify&& cmd)
{
    return roundtrip<wire::ChonkVerifyResponse>(roundtrip<ChonkVerify>(cmd).execute(ctx));
}
wire::ChonkVerifyFromFieldsResponse handle_chonk_verify_from_fields(BBApiRequest& ctx,
                                                                    wire::ChonkVerifyFromFields&& cmd)
{
    return roundtrip<wire::ChonkVerifyFromFieldsResponse>(roundtrip<ChonkVerifyFromFields>(cmd).execute(ctx));
}
wire::ChonkBatchVerifyResponse handle_chonk_batch_verify(BBApiRequest& ctx, wire::ChonkBatchVerify&& cmd)
{
    return roundtrip<wire::ChonkBatchVerifyResponse>(roundtrip<ChonkBatchVerify>(cmd).execute(ctx));
}
wire::VkAsFieldsResponse handle_vk_as_fields(BBApiRequest& ctx, wire::VkAsFields&& cmd)
{
    return roundtrip<wire::VkAsFieldsResponse>(roundtrip<VkAsFields>(cmd).execute(ctx));
}
wire::MegaVkAsFieldsResponse handle_mega_vk_as_fields(BBApiRequest& ctx, wire::MegaVkAsFields&& cmd)
{
    return roundtrip<wire::MegaVkAsFieldsResponse>(roundtrip<MegaVkAsFields>(cmd).execute(ctx));
}
wire::CircuitWriteSolidityVerifierResponse handle_circuit_write_solidity_verifier(
    BBApiRequest& ctx, wire::CircuitWriteSolidityVerifier&& cmd)
{
    return roundtrip<wire::CircuitWriteSolidityVerifierResponse>(
        roundtrip<CircuitWriteSolidityVerifier>(cmd).execute(ctx));
}
wire::ChonkCheckPrecomputedVkResponse handle_chonk_check_precomputed_vk(BBApiRequest& ctx,
                                                                        wire::ChonkCheckPrecomputedVk&& cmd)
{
    return roundtrip<wire::ChonkCheckPrecomputedVkResponse>(roundtrip<ChonkCheckPrecomputedVk>(cmd).execute(ctx));
}
wire::ChonkStatsResponse handle_chonk_stats(BBApiRequest& ctx, wire::ChonkStats&& cmd)
{
    return roundtrip<wire::ChonkStatsResponse>(roundtrip<ChonkStats>(cmd).execute(ctx));
}
wire::ChonkCompressProofResponse handle_chonk_compress_proof(BBApiRequest& ctx, wire::ChonkCompressProof&& cmd)
{
    return roundtrip<wire::ChonkCompressProofResponse>(roundtrip<ChonkCompressProof>(cmd).execute(ctx));
}
wire::ChonkDecompressProofResponse handle_chonk_decompress_proof(BBApiRequest& ctx, wire::ChonkDecompressProof&& cmd)
{
    return roundtrip<wire::ChonkDecompressProofResponse>(roundtrip<ChonkDecompressProof>(cmd).execute(ctx));
}
wire::Poseidon2HashResponse handle_poseidon2_hash(BBApiRequest& ctx, wire::Poseidon2Hash&& cmd)
{
    return roundtrip<wire::Poseidon2HashResponse>(roundtrip<Poseidon2Hash>(cmd).execute(ctx));
}
wire::Poseidon2PermutationResponse handle_poseidon2_permutation(BBApiRequest& ctx, wire::Poseidon2Permutation&& cmd)
{
    return roundtrip<wire::Poseidon2PermutationResponse>(roundtrip<Poseidon2Permutation>(cmd).execute(ctx));
}
wire::PedersenCommitResponse handle_pedersen_commit(BBApiRequest& ctx, wire::PedersenCommit&& cmd)
{
    return roundtrip<wire::PedersenCommitResponse>(roundtrip<PedersenCommit>(cmd).execute(ctx));
}
wire::PedersenHashResponse handle_pedersen_hash(BBApiRequest& ctx, wire::PedersenHash&& cmd)
{
    return roundtrip<wire::PedersenHashResponse>(roundtrip<PedersenHash>(cmd).execute(ctx));
}
wire::PedersenHashBufferResponse handle_pedersen_hash_buffer(BBApiRequest& ctx, wire::PedersenHashBuffer&& cmd)
{
    return roundtrip<wire::PedersenHashBufferResponse>(roundtrip<PedersenHashBuffer>(cmd).execute(ctx));
}
wire::Blake2sResponse handle_blake2s(BBApiRequest& ctx, wire::Blake2s&& cmd)
{
    return roundtrip<wire::Blake2sResponse>(roundtrip<Blake2s>(cmd).execute(ctx));
}
wire::Blake2sToFieldResponse handle_blake2s_to_field(BBApiRequest& ctx, wire::Blake2sToField&& cmd)
{
    return roundtrip<wire::Blake2sToFieldResponse>(roundtrip<Blake2sToField>(cmd).execute(ctx));
}
wire::AesEncryptResponse handle_aes_encrypt(BBApiRequest& ctx, wire::AesEncrypt&& cmd)
{
    return roundtrip<wire::AesEncryptResponse>(roundtrip<AesEncrypt>(cmd).execute(ctx));
}
wire::AesDecryptResponse handle_aes_decrypt(BBApiRequest& ctx, wire::AesDecrypt&& cmd)
{
    return roundtrip<wire::AesDecryptResponse>(roundtrip<AesDecrypt>(cmd).execute(ctx));
}
wire::GrumpkinMulResponse handle_grumpkin_mul(BBApiRequest& ctx, wire::GrumpkinMul&& cmd)
{
    return roundtrip<wire::GrumpkinMulResponse>(roundtrip<GrumpkinMul>(cmd).execute(ctx));
}
wire::GrumpkinAddResponse handle_grumpkin_add(BBApiRequest& ctx, wire::GrumpkinAdd&& cmd)
{
    return roundtrip<wire::GrumpkinAddResponse>(roundtrip<GrumpkinAdd>(cmd).execute(ctx));
}
wire::GrumpkinBatchMulResponse handle_grumpkin_batch_mul(BBApiRequest& ctx, wire::GrumpkinBatchMul&& cmd)
{
    return roundtrip<wire::GrumpkinBatchMulResponse>(roundtrip<GrumpkinBatchMul>(cmd).execute(ctx));
}
wire::GrumpkinGetRandomFrResponse handle_grumpkin_get_random_fr(BBApiRequest& ctx, wire::GrumpkinGetRandomFr&& cmd)
{
    return roundtrip<wire::GrumpkinGetRandomFrResponse>(roundtrip<GrumpkinGetRandomFr>(cmd).execute(ctx));
}
wire::GrumpkinReduce512Response handle_grumpkin_reduce512(BBApiRequest& ctx, wire::GrumpkinReduce512&& cmd)
{
    return roundtrip<wire::GrumpkinReduce512Response>(roundtrip<GrumpkinReduce512>(cmd).execute(ctx));
}
wire::Secp256k1MulResponse handle_secp256k1_mul(BBApiRequest& ctx, wire::Secp256k1Mul&& cmd)
{
    return roundtrip<wire::Secp256k1MulResponse>(roundtrip<Secp256k1Mul>(cmd).execute(ctx));
}
wire::Secp256k1GetRandomFrResponse handle_secp256k1_get_random_fr(BBApiRequest& ctx, wire::Secp256k1GetRandomFr&& cmd)
{
    return roundtrip<wire::Secp256k1GetRandomFrResponse>(roundtrip<Secp256k1GetRandomFr>(cmd).execute(ctx));
}
wire::Secp256k1Reduce512Response handle_secp256k1_reduce512(BBApiRequest& ctx, wire::Secp256k1Reduce512&& cmd)
{
    return roundtrip<wire::Secp256k1Reduce512Response>(roundtrip<Secp256k1Reduce512>(cmd).execute(ctx));
}
wire::Bn254FrSqrtResponse handle_bn254_fr_sqrt(BBApiRequest& ctx, wire::Bn254FrSqrt&& cmd)
{
    return roundtrip<wire::Bn254FrSqrtResponse>(roundtrip<Bn254FrSqrt>(cmd).execute(ctx));
}
wire::Bn254FqSqrtResponse handle_bn254_fq_sqrt(BBApiRequest& ctx, wire::Bn254FqSqrt&& cmd)
{
    return roundtrip<wire::Bn254FqSqrtResponse>(roundtrip<Bn254FqSqrt>(cmd).execute(ctx));
}
wire::Bn254G1MulResponse handle_bn254_g1_mul(BBApiRequest& ctx, wire::Bn254G1Mul&& cmd)
{
    return roundtrip<wire::Bn254G1MulResponse>(roundtrip<Bn254G1Mul>(cmd).execute(ctx));
}
wire::Bn254G2MulResponse handle_bn254_g2_mul(BBApiRequest& ctx, wire::Bn254G2Mul&& cmd)
{
    return roundtrip<wire::Bn254G2MulResponse>(roundtrip<Bn254G2Mul>(cmd).execute(ctx));
}
wire::Bn254G1IsOnCurveResponse handle_bn254_g1_is_on_curve(BBApiRequest& ctx, wire::Bn254G1IsOnCurve&& cmd)
{
    return roundtrip<wire::Bn254G1IsOnCurveResponse>(roundtrip<Bn254G1IsOnCurve>(cmd).execute(ctx));
}
wire::Bn254G1FromCompressedResponse handle_bn254_g1_from_compressed(BBApiRequest& ctx,
                                                                    wire::Bn254G1FromCompressed&& cmd)
{
    return roundtrip<wire::Bn254G1FromCompressedResponse>(roundtrip<Bn254G1FromCompressed>(cmd).execute(ctx));
}
wire::SchnorrComputePublicKeyResponse handle_schnorr_compute_public_key(BBApiRequest& ctx,
                                                                        wire::SchnorrComputePublicKey&& cmd)
{
    return roundtrip<wire::SchnorrComputePublicKeyResponse>(roundtrip<SchnorrComputePublicKey>(cmd).execute(ctx));
}
wire::SchnorrConstructSignatureResponse handle_schnorr_construct_signature(BBApiRequest& ctx,
                                                                           wire::SchnorrConstructSignature&& cmd)
{
    return roundtrip<wire::SchnorrConstructSignatureResponse>(roundtrip<SchnorrConstructSignature>(cmd).execute(ctx));
}
wire::SchnorrVerifySignatureResponse handle_schnorr_verify_signature(BBApiRequest& ctx,
                                                                     wire::SchnorrVerifySignature&& cmd)
{
    return roundtrip<wire::SchnorrVerifySignatureResponse>(roundtrip<SchnorrVerifySignature>(cmd).execute(ctx));
}
wire::EcdsaSecp256k1ComputePublicKeyResponse handle_ecdsa_secp256k1_compute_public_key(
    BBApiRequest& ctx, wire::EcdsaSecp256k1ComputePublicKey&& cmd)
{
    return roundtrip<wire::EcdsaSecp256k1ComputePublicKeyResponse>(
        roundtrip<EcdsaSecp256k1ComputePublicKey>(cmd).execute(ctx));
}
wire::EcdsaSecp256r1ComputePublicKeyResponse handle_ecdsa_secp256r1_compute_public_key(
    BBApiRequest& ctx, wire::EcdsaSecp256r1ComputePublicKey&& cmd)
{
    return roundtrip<wire::EcdsaSecp256r1ComputePublicKeyResponse>(
        roundtrip<EcdsaSecp256r1ComputePublicKey>(cmd).execute(ctx));
}
wire::EcdsaSecp256k1ConstructSignatureResponse handle_ecdsa_secp256k1_construct_signature(
    BBApiRequest& ctx, wire::EcdsaSecp256k1ConstructSignature&& cmd)
{
    return roundtrip<wire::EcdsaSecp256k1ConstructSignatureResponse>(
        roundtrip<EcdsaSecp256k1ConstructSignature>(cmd).execute(ctx));
}
wire::EcdsaSecp256r1ConstructSignatureResponse handle_ecdsa_secp256r1_construct_signature(
    BBApiRequest& ctx, wire::EcdsaSecp256r1ConstructSignature&& cmd)
{
    return roundtrip<wire::EcdsaSecp256r1ConstructSignatureResponse>(
        roundtrip<EcdsaSecp256r1ConstructSignature>(cmd).execute(ctx));
}
wire::EcdsaSecp256k1RecoverPublicKeyResponse handle_ecdsa_secp256k1_recover_public_key(
    BBApiRequest& ctx, wire::EcdsaSecp256k1RecoverPublicKey&& cmd)
{
    return roundtrip<wire::EcdsaSecp256k1RecoverPublicKeyResponse>(
        roundtrip<EcdsaSecp256k1RecoverPublicKey>(cmd).execute(ctx));
}
wire::EcdsaSecp256r1RecoverPublicKeyResponse handle_ecdsa_secp256r1_recover_public_key(
    BBApiRequest& ctx, wire::EcdsaSecp256r1RecoverPublicKey&& cmd)
{
    return roundtrip<wire::EcdsaSecp256r1RecoverPublicKeyResponse>(
        roundtrip<EcdsaSecp256r1RecoverPublicKey>(cmd).execute(ctx));
}
wire::EcdsaSecp256k1VerifySignatureResponse handle_ecdsa_secp256k1_verify_signature(
    BBApiRequest& ctx, wire::EcdsaSecp256k1VerifySignature&& cmd)
{
    return roundtrip<wire::EcdsaSecp256k1VerifySignatureResponse>(
        roundtrip<EcdsaSecp256k1VerifySignature>(cmd).execute(ctx));
}
wire::EcdsaSecp256r1VerifySignatureResponse handle_ecdsa_secp256r1_verify_signature(
    BBApiRequest& ctx, wire::EcdsaSecp256r1VerifySignature&& cmd)
{
    return roundtrip<wire::EcdsaSecp256r1VerifySignatureResponse>(
        roundtrip<EcdsaSecp256r1VerifySignature>(cmd).execute(ctx));
}
wire::SrsInitSrsResponse handle_srs_init_srs(BBApiRequest& ctx, wire::SrsInitSrs&& cmd)
{
    return roundtrip<wire::SrsInitSrsResponse>(roundtrip<SrsInitSrs>(cmd).execute(ctx));
}
wire::ChonkBatchVerifierStartResponse handle_chonk_batch_verifier_start(BBApiRequest& ctx,
                                                                        wire::ChonkBatchVerifierStart&& cmd)
{
    return roundtrip<wire::ChonkBatchVerifierStartResponse>(roundtrip<ChonkBatchVerifierStart>(cmd).execute(ctx));
}
wire::ChonkBatchVerifierQueueResponse handle_chonk_batch_verifier_queue(BBApiRequest& ctx,
                                                                        wire::ChonkBatchVerifierQueue&& cmd)
{
    return roundtrip<wire::ChonkBatchVerifierQueueResponse>(roundtrip<ChonkBatchVerifierQueue>(cmd).execute(ctx));
}
wire::ChonkBatchVerifierStopResponse handle_chonk_batch_verifier_stop(BBApiRequest& ctx,
                                                                      wire::ChonkBatchVerifierStop&& cmd)
{
    return roundtrip<wire::ChonkBatchVerifierStopResponse>(roundtrip<ChonkBatchVerifierStop>(cmd).execute(ctx));
}
wire::SrsInitGrumpkinSrsResponse handle_srs_init_grumpkin_srs(BBApiRequest& ctx, wire::SrsInitGrumpkinSrs&& cmd)
{
    return roundtrip<wire::SrsInitGrumpkinSrsResponse>(roundtrip<SrsInitGrumpkinSrs>(cmd).execute(ctx));
}
} // namespace bb::bbapi
