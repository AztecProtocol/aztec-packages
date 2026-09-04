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
#include "barretenberg/bbapi/generated/bb_dispatch.hpp"

namespace bb::bbapi {

void handle_avm_prove(BBApiRequest& ctx, wire::BbAvmProve&& cmd, Responder<wire::BbAvmProveResponse> respond);
void handle_avm_verify(BBApiRequest& ctx, wire::BbAvmVerify&& cmd, Responder<wire::BbAvmVerifyResponse> respond);
void handle_avm_check_circuit(BBApiRequest& ctx,
                              wire::BbAvmCheckCircuit&& cmd,
                              Responder<wire::BbAvmCheckCircuitResponse> respond);
void handle_circuit_prove(BBApiRequest& ctx,
                          wire::BbCircuitProve&& cmd,
                          Responder<wire::BbCircuitProveResponse> respond);
void handle_circuit_compute_vk(BBApiRequest& ctx,
                               wire::BbCircuitComputeVk&& cmd,
                               Responder<wire::BbCircuitComputeVkResponse> respond);
void handle_circuit_stats(BBApiRequest& ctx,
                          wire::BbCircuitStats&& cmd,
                          Responder<wire::BbCircuitStatsResponse> respond);
void handle_circuit_verify(BBApiRequest& ctx,
                           wire::BbCircuitVerify&& cmd,
                           Responder<wire::BbCircuitVerifyResponse> respond);
void handle_chonk_compute_vk(BBApiRequest& ctx,
                             wire::BbChonkComputeVk&& cmd,
                             Responder<wire::BbChonkComputeVkResponse> respond);
void handle_chonk_start(BBApiRequest& ctx, wire::BbChonkStart&& cmd, Responder<wire::BbChonkStartResponse> respond);
void handle_chonk_load(BBApiRequest& ctx, wire::BbChonkLoad&& cmd, Responder<wire::BbChonkLoadResponse> respond);
void handle_chonk_accumulate(BBApiRequest& ctx,
                             wire::BbChonkAccumulate&& cmd,
                             Responder<wire::BbChonkAccumulateResponse> respond);
void handle_chonk_prove(BBApiRequest& ctx, wire::BbChonkProve&& cmd, Responder<wire::BbChonkProveResponse> respond);
void handle_chonk_verify(BBApiRequest& ctx, wire::BbChonkVerify&& cmd, Responder<wire::BbChonkVerifyResponse> respond);
void handle_chonk_verify_from_fields(BBApiRequest& ctx,
                                     wire::BbChonkVerifyFromFields&& cmd,
                                     Responder<wire::BbChonkVerifyFromFieldsResponse> respond);
void handle_chonk_batch_verify(BBApiRequest& ctx,
                               wire::BbChonkBatchVerify&& cmd,
                               Responder<wire::BbChonkBatchVerifyResponse> respond);
void handle_vk_as_fields(BBApiRequest& ctx, wire::BbVkAsFields&& cmd, Responder<wire::BbVkAsFieldsResponse> respond);
void handle_mega_app_vk_as_fields(BBApiRequest& ctx,
                                  wire::BbMegaAppVkAsFields&& cmd,
                                  Responder<wire::BbMegaAppVkAsFieldsResponse> respond);
void handle_mega_kernel_vk_as_fields(BBApiRequest& ctx,
                                     wire::BbMegaKernelVkAsFields&& cmd,
                                     Responder<wire::BbMegaKernelVkAsFieldsResponse> respond);
void handle_mega_z_k_vk_as_fields(BBApiRequest& ctx,
                                  wire::BbMegaZKVkAsFields&& cmd,
                                  Responder<wire::BbMegaZKVkAsFieldsResponse> respond);
void handle_mega_vk_as_fields(BBApiRequest& ctx,
                              wire::BbMegaVkAsFields&& cmd,
                              Responder<wire::BbMegaVkAsFieldsResponse> respond);
void handle_circuit_write_solidity_verifier(BBApiRequest& ctx,
                                            wire::BbCircuitWriteSolidityVerifier&& cmd,
                                            Responder<wire::BbCircuitWriteSolidityVerifierResponse> respond);
void handle_chonk_check_precomputed_vk(BBApiRequest& ctx,
                                       wire::BbChonkCheckPrecomputedVk&& cmd,
                                       Responder<wire::BbChonkCheckPrecomputedVkResponse> respond);
void handle_chonk_stats(BBApiRequest& ctx, wire::BbChonkStats&& cmd, Responder<wire::BbChonkStatsResponse> respond);
void handle_chonk_compress_proof(BBApiRequest& ctx,
                                 wire::BbChonkCompressProof&& cmd,
                                 Responder<wire::BbChonkCompressProofResponse> respond);
void handle_chonk_decompress_proof(BBApiRequest& ctx,
                                   wire::BbChonkDecompressProof&& cmd,
                                   Responder<wire::BbChonkDecompressProofResponse> respond);
void handle_poseidon2_hash(BBApiRequest& ctx,
                           wire::BbPoseidon2Hash&& cmd,
                           Responder<wire::BbPoseidon2HashResponse> respond);
void handle_poseidon2_permutation(BBApiRequest& ctx,
                                  wire::BbPoseidon2Permutation&& cmd,
                                  Responder<wire::BbPoseidon2PermutationResponse> respond);
void handle_pedersen_commit(BBApiRequest& ctx,
                            wire::BbPedersenCommit&& cmd,
                            Responder<wire::BbPedersenCommitResponse> respond);
void handle_pedersen_hash(BBApiRequest& ctx,
                          wire::BbPedersenHash&& cmd,
                          Responder<wire::BbPedersenHashResponse> respond);
void handle_pedersen_hash_buffer(BBApiRequest& ctx,
                                 wire::BbPedersenHashBuffer&& cmd,
                                 Responder<wire::BbPedersenHashBufferResponse> respond);
void handle_blake2s(BBApiRequest& ctx, wire::BbBlake2s&& cmd, Responder<wire::BbBlake2sResponse> respond);
void handle_blake2s_to_field(BBApiRequest& ctx,
                             wire::BbBlake2sToField&& cmd,
                             Responder<wire::BbBlake2sToFieldResponse> respond);
void handle_aes_encrypt(BBApiRequest& ctx, wire::BbAesEncrypt&& cmd, Responder<wire::BbAesEncryptResponse> respond);
void handle_aes_decrypt(BBApiRequest& ctx, wire::BbAesDecrypt&& cmd, Responder<wire::BbAesDecryptResponse> respond);
void handle_grumpkin_mul(BBApiRequest& ctx, wire::BbGrumpkinMul&& cmd, Responder<wire::BbGrumpkinMulResponse> respond);
void handle_grumpkin_add(BBApiRequest& ctx, wire::BbGrumpkinAdd&& cmd, Responder<wire::BbGrumpkinAddResponse> respond);
void handle_grumpkin_batch_mul(BBApiRequest& ctx,
                               wire::BbGrumpkinBatchMul&& cmd,
                               Responder<wire::BbGrumpkinBatchMulResponse> respond);
void handle_grumpkin_get_random_fr(BBApiRequest& ctx,
                                   wire::BbGrumpkinGetRandomFr&& cmd,
                                   Responder<wire::BbGrumpkinGetRandomFrResponse> respond);
void handle_grumpkin_reduce512(BBApiRequest& ctx,
                               wire::BbGrumpkinReduce512&& cmd,
                               Responder<wire::BbGrumpkinReduce512Response> respond);
void handle_secp256k1_mul(BBApiRequest& ctx,
                          wire::BbSecp256k1Mul&& cmd,
                          Responder<wire::BbSecp256k1MulResponse> respond);
void handle_secp256k1_get_random_fr(BBApiRequest& ctx,
                                    wire::BbSecp256k1GetRandomFr&& cmd,
                                    Responder<wire::BbSecp256k1GetRandomFrResponse> respond);
void handle_secp256k1_reduce512(BBApiRequest& ctx,
                                wire::BbSecp256k1Reduce512&& cmd,
                                Responder<wire::BbSecp256k1Reduce512Response> respond);
void handle_bn254_fr_sqrt(BBApiRequest& ctx, wire::BbBn254FrSqrt&& cmd, Responder<wire::BbBn254FrSqrtResponse> respond);
void handle_bn254_fq_sqrt(BBApiRequest& ctx, wire::BbBn254FqSqrt&& cmd, Responder<wire::BbBn254FqSqrtResponse> respond);
void handle_bn254_g1_mul(BBApiRequest& ctx, wire::BbBn254G1Mul&& cmd, Responder<wire::BbBn254G1MulResponse> respond);
void handle_bn254_g2_mul(BBApiRequest& ctx, wire::BbBn254G2Mul&& cmd, Responder<wire::BbBn254G2MulResponse> respond);
void handle_bn254_g1_is_on_curve(BBApiRequest& ctx,
                                 wire::BbBn254G1IsOnCurve&& cmd,
                                 Responder<wire::BbBn254G1IsOnCurveResponse> respond);
void handle_bn254_g1_from_compressed(BBApiRequest& ctx,
                                     wire::BbBn254G1FromCompressed&& cmd,
                                     Responder<wire::BbBn254G1FromCompressedResponse> respond);
void handle_schnorr_compute_public_key(BBApiRequest& ctx,
                                       wire::BbSchnorrComputePublicKey&& cmd,
                                       Responder<wire::BbSchnorrComputePublicKeyResponse> respond);
void handle_schnorr_construct_signature(BBApiRequest& ctx,
                                        wire::BbSchnorrConstructSignature&& cmd,
                                        Responder<wire::BbSchnorrConstructSignatureResponse> respond);
void handle_schnorr_verify_signature(BBApiRequest& ctx,
                                     wire::BbSchnorrVerifySignature&& cmd,
                                     Responder<wire::BbSchnorrVerifySignatureResponse> respond);
void handle_ecdsa_secp256k1_compute_public_key(BBApiRequest& ctx,
                                               wire::BbEcdsaSecp256k1ComputePublicKey&& cmd,
                                               Responder<wire::BbEcdsaSecp256k1ComputePublicKeyResponse> respond);
void handle_ecdsa_secp256r1_compute_public_key(BBApiRequest& ctx,
                                               wire::BbEcdsaSecp256r1ComputePublicKey&& cmd,
                                               Responder<wire::BbEcdsaSecp256r1ComputePublicKeyResponse> respond);
void handle_ecdsa_secp256k1_construct_signature(BBApiRequest& ctx,
                                                wire::BbEcdsaSecp256k1ConstructSignature&& cmd,
                                                Responder<wire::BbEcdsaSecp256k1ConstructSignatureResponse> respond);
void handle_ecdsa_secp256r1_construct_signature(BBApiRequest& ctx,
                                                wire::BbEcdsaSecp256r1ConstructSignature&& cmd,
                                                Responder<wire::BbEcdsaSecp256r1ConstructSignatureResponse> respond);
void handle_ecdsa_secp256k1_recover_public_key(BBApiRequest& ctx,
                                               wire::BbEcdsaSecp256k1RecoverPublicKey&& cmd,
                                               Responder<wire::BbEcdsaSecp256k1RecoverPublicKeyResponse> respond);
void handle_ecdsa_secp256r1_recover_public_key(BBApiRequest& ctx,
                                               wire::BbEcdsaSecp256r1RecoverPublicKey&& cmd,
                                               Responder<wire::BbEcdsaSecp256r1RecoverPublicKeyResponse> respond);
void handle_ecdsa_secp256k1_verify_signature(BBApiRequest& ctx,
                                             wire::BbEcdsaSecp256k1VerifySignature&& cmd,
                                             Responder<wire::BbEcdsaSecp256k1VerifySignatureResponse> respond);
void handle_ecdsa_secp256r1_verify_signature(BBApiRequest& ctx,
                                             wire::BbEcdsaSecp256r1VerifySignature&& cmd,
                                             Responder<wire::BbEcdsaSecp256r1VerifySignatureResponse> respond);
void handle_srs_init_srs(BBApiRequest& ctx, wire::BbSrsInitSrs&& cmd, Responder<wire::BbSrsInitSrsResponse> respond);
void handle_chonk_batch_verifier_start(BBApiRequest& ctx,
                                       wire::BbChonkBatchVerifierStart&& cmd,
                                       Responder<wire::BbChonkBatchVerifierStartResponse> respond);
void handle_chonk_batch_verifier_queue(BBApiRequest& ctx,
                                       wire::BbChonkBatchVerifierQueue&& cmd,
                                       Responder<wire::BbChonkBatchVerifierQueueResponse> respond);
void handle_chonk_batch_verifier_stop(BBApiRequest& ctx,
                                      wire::BbChonkBatchVerifierStop&& cmd,
                                      Responder<wire::BbChonkBatchVerifierStopResponse> respond);
void handle_srs_init_grumpkin_srs(BBApiRequest& ctx,
                                  wire::BbSrsInitGrumpkinSrs&& cmd,
                                  Responder<wire::BbSrsInitGrumpkinSrsResponse> respond);
} // namespace bb::bbapi
