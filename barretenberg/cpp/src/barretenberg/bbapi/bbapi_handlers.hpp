#pragma once
/**
 * @file bbapi_handlers.hpp
 * @brief Non-template handler declarations for the bb service.
 *
 * The codegen-emitted dispatch header (generated/bb_dispatch.hpp) declares
 * `template<Ctx> handle_<method>(Ctx&, wire::Cmd&&)`. These free-function
 * overloads provide concrete definitions for `Ctx = BBApiRequest`; overload
 * resolution prefers them at the template instantiation point inside
 * make_bb_handler<BBApiRequest>(...).
 */
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/bbapi/generated/bb_types.hpp"

namespace bb::bbapi {

wire::AvmProveResponse handle_avm_prove(BBApiRequest& ctx, wire::AvmProve&& cmd);
wire::AvmVerifyResponse handle_avm_verify(BBApiRequest& ctx, wire::AvmVerify&& cmd);
wire::AvmCheckCircuitResponse handle_avm_check_circuit(BBApiRequest& ctx, wire::AvmCheckCircuit&& cmd);
wire::CircuitProveResponse handle_circuit_prove(BBApiRequest& ctx, wire::CircuitProve&& cmd);
wire::CircuitComputeVkResponse handle_circuit_compute_vk(BBApiRequest& ctx, wire::CircuitComputeVk&& cmd);
wire::CircuitInfoResponse handle_circuit_stats(BBApiRequest& ctx, wire::CircuitStats&& cmd);
wire::CircuitVerifyResponse handle_circuit_verify(BBApiRequest& ctx, wire::CircuitVerify&& cmd);
wire::ChonkComputeVkResponse handle_chonk_compute_vk(BBApiRequest& ctx, wire::ChonkComputeVk&& cmd);
wire::ChonkStartResponse handle_chonk_start(BBApiRequest& ctx, wire::ChonkStart&& cmd);
wire::ChonkLoadResponse handle_chonk_load(BBApiRequest& ctx, wire::ChonkLoad&& cmd);
wire::ChonkAccumulateResponse handle_chonk_accumulate(BBApiRequest& ctx, wire::ChonkAccumulate&& cmd);
wire::ChonkProveResponse handle_chonk_prove(BBApiRequest& ctx, wire::ChonkProve&& cmd);
wire::ChonkVerifyResponse handle_chonk_verify(BBApiRequest& ctx, wire::ChonkVerify&& cmd);
wire::ChonkVerifyFromFieldsResponse handle_chonk_verify_from_fields(BBApiRequest& ctx,
                                                                    wire::ChonkVerifyFromFields&& cmd);
wire::ChonkBatchVerifyResponse handle_chonk_batch_verify(BBApiRequest& ctx, wire::ChonkBatchVerify&& cmd);
wire::VkAsFieldsResponse handle_vk_as_fields(BBApiRequest& ctx, wire::VkAsFields&& cmd);
wire::MegaVkAsFieldsResponse handle_mega_vk_as_fields(BBApiRequest& ctx, wire::MegaVkAsFields&& cmd);
wire::CircuitWriteSolidityVerifierResponse handle_circuit_write_solidity_verifier(
    BBApiRequest& ctx, wire::CircuitWriteSolidityVerifier&& cmd);
wire::ChonkCheckPrecomputedVkResponse handle_chonk_check_precomputed_vk(BBApiRequest& ctx,
                                                                        wire::ChonkCheckPrecomputedVk&& cmd);
wire::ChonkStatsResponse handle_chonk_stats(BBApiRequest& ctx, wire::ChonkStats&& cmd);
wire::ChonkCompressProofResponse handle_chonk_compress_proof(BBApiRequest& ctx, wire::ChonkCompressProof&& cmd);
wire::ChonkDecompressProofResponse handle_chonk_decompress_proof(BBApiRequest& ctx, wire::ChonkDecompressProof&& cmd);
wire::Poseidon2HashResponse handle_poseidon2_hash(BBApiRequest& ctx, wire::Poseidon2Hash&& cmd);
wire::Poseidon2PermutationResponse handle_poseidon2_permutation(BBApiRequest& ctx, wire::Poseidon2Permutation&& cmd);
wire::PedersenCommitResponse handle_pedersen_commit(BBApiRequest& ctx, wire::PedersenCommit&& cmd);
wire::PedersenHashResponse handle_pedersen_hash(BBApiRequest& ctx, wire::PedersenHash&& cmd);
wire::PedersenHashBufferResponse handle_pedersen_hash_buffer(BBApiRequest& ctx, wire::PedersenHashBuffer&& cmd);
wire::Blake2sResponse handle_blake2s(BBApiRequest& ctx, wire::Blake2s&& cmd);
wire::Blake2sToFieldResponse handle_blake2s_to_field(BBApiRequest& ctx, wire::Blake2sToField&& cmd);
wire::AesEncryptResponse handle_aes_encrypt(BBApiRequest& ctx, wire::AesEncrypt&& cmd);
wire::AesDecryptResponse handle_aes_decrypt(BBApiRequest& ctx, wire::AesDecrypt&& cmd);
wire::GrumpkinMulResponse handle_grumpkin_mul(BBApiRequest& ctx, wire::GrumpkinMul&& cmd);
wire::GrumpkinAddResponse handle_grumpkin_add(BBApiRequest& ctx, wire::GrumpkinAdd&& cmd);
wire::GrumpkinBatchMulResponse handle_grumpkin_batch_mul(BBApiRequest& ctx, wire::GrumpkinBatchMul&& cmd);
wire::GrumpkinGetRandomFrResponse handle_grumpkin_get_random_fr(BBApiRequest& ctx, wire::GrumpkinGetRandomFr&& cmd);
wire::GrumpkinReduce512Response handle_grumpkin_reduce512(BBApiRequest& ctx, wire::GrumpkinReduce512&& cmd);
wire::Secp256k1MulResponse handle_secp256k1_mul(BBApiRequest& ctx, wire::Secp256k1Mul&& cmd);
wire::Secp256k1GetRandomFrResponse handle_secp256k1_get_random_fr(BBApiRequest& ctx, wire::Secp256k1GetRandomFr&& cmd);
wire::Secp256k1Reduce512Response handle_secp256k1_reduce512(BBApiRequest& ctx, wire::Secp256k1Reduce512&& cmd);
wire::Bn254FrSqrtResponse handle_bn254_fr_sqrt(BBApiRequest& ctx, wire::Bn254FrSqrt&& cmd);
wire::Bn254FqSqrtResponse handle_bn254_fq_sqrt(BBApiRequest& ctx, wire::Bn254FqSqrt&& cmd);
wire::Bn254G1MulResponse handle_bn254_g1_mul(BBApiRequest& ctx, wire::Bn254G1Mul&& cmd);
wire::Bn254G2MulResponse handle_bn254_g2_mul(BBApiRequest& ctx, wire::Bn254G2Mul&& cmd);
wire::Bn254G1IsOnCurveResponse handle_bn254_g1_is_on_curve(BBApiRequest& ctx, wire::Bn254G1IsOnCurve&& cmd);
wire::Bn254G1FromCompressedResponse handle_bn254_g1_from_compressed(BBApiRequest& ctx,
                                                                    wire::Bn254G1FromCompressed&& cmd);
wire::SchnorrComputePublicKeyResponse handle_schnorr_compute_public_key(BBApiRequest& ctx,
                                                                        wire::SchnorrComputePublicKey&& cmd);
wire::SchnorrConstructSignatureResponse handle_schnorr_construct_signature(BBApiRequest& ctx,
                                                                           wire::SchnorrConstructSignature&& cmd);
wire::SchnorrVerifySignatureResponse handle_schnorr_verify_signature(BBApiRequest& ctx,
                                                                     wire::SchnorrVerifySignature&& cmd);
wire::EcdsaSecp256k1ComputePublicKeyResponse handle_ecdsa_secp256k1_compute_public_key(
    BBApiRequest& ctx, wire::EcdsaSecp256k1ComputePublicKey&& cmd);
wire::EcdsaSecp256r1ComputePublicKeyResponse handle_ecdsa_secp256r1_compute_public_key(
    BBApiRequest& ctx, wire::EcdsaSecp256r1ComputePublicKey&& cmd);
wire::EcdsaSecp256k1ConstructSignatureResponse handle_ecdsa_secp256k1_construct_signature(
    BBApiRequest& ctx, wire::EcdsaSecp256k1ConstructSignature&& cmd);
wire::EcdsaSecp256r1ConstructSignatureResponse handle_ecdsa_secp256r1_construct_signature(
    BBApiRequest& ctx, wire::EcdsaSecp256r1ConstructSignature&& cmd);
wire::EcdsaSecp256k1RecoverPublicKeyResponse handle_ecdsa_secp256k1_recover_public_key(
    BBApiRequest& ctx, wire::EcdsaSecp256k1RecoverPublicKey&& cmd);
wire::EcdsaSecp256r1RecoverPublicKeyResponse handle_ecdsa_secp256r1_recover_public_key(
    BBApiRequest& ctx, wire::EcdsaSecp256r1RecoverPublicKey&& cmd);
wire::EcdsaSecp256k1VerifySignatureResponse handle_ecdsa_secp256k1_verify_signature(
    BBApiRequest& ctx, wire::EcdsaSecp256k1VerifySignature&& cmd);
wire::EcdsaSecp256r1VerifySignatureResponse handle_ecdsa_secp256r1_verify_signature(
    BBApiRequest& ctx, wire::EcdsaSecp256r1VerifySignature&& cmd);
wire::SrsInitSrsResponse handle_srs_init_srs(BBApiRequest& ctx, wire::SrsInitSrs&& cmd);
wire::ChonkBatchVerifierStartResponse handle_chonk_batch_verifier_start(BBApiRequest& ctx,
                                                                        wire::ChonkBatchVerifierStart&& cmd);
wire::ChonkBatchVerifierQueueResponse handle_chonk_batch_verifier_queue(BBApiRequest& ctx,
                                                                        wire::ChonkBatchVerifierQueue&& cmd);
wire::ChonkBatchVerifierStopResponse handle_chonk_batch_verifier_stop(BBApiRequest& ctx,
                                                                      wire::ChonkBatchVerifierStop&& cmd);
wire::SrsInitGrumpkinSrsResponse handle_srs_init_grumpkin_srs(BBApiRequest& ctx, wire::SrsInitGrumpkinSrs&& cmd);
} // namespace bb::bbapi
