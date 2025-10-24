#pragma once

#include "barretenberg/bbapi/bbapi_client_ivc.hpp"
#include "barretenberg/bbapi/bbapi_crypto.hpp"
#include "barretenberg/bbapi/bbapi_ecc.hpp"
#include "barretenberg/bbapi/bbapi_ecdsa.hpp"
#include "barretenberg/bbapi/bbapi_schnorr.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/bbapi/bbapi_srs.hpp"
#include "barretenberg/bbapi/bbapi_ultra_honk.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include <vector>

namespace bb::bbapi {

using Command = NamedUnion<CircuitProve,
                           CircuitComputeVk,
                           CircuitStats,
                           CircuitVerify,
                           ClientIvcComputeStandaloneVk,
                           ClientIvcComputeIvcVk,
                           ClientIvcStart,
                           ClientIvcLoad,
                           ClientIvcAccumulate,
                           ClientIvcProve,
                           ClientIvcVerify,
                           VkAsFields,
                           MegaVkAsFields,
                           CircuitWriteSolidityVerifier,
                           ClientIvcCheckPrecomputedVk,
                           ClientIvcStats,
                           Poseidon2Hash,
                           Poseidon2Permutation,
                           Poseidon2HashAccumulate,
                           PedersenCommit,
                           PedersenHash,
                           PedersenHashBuffer,
                           Blake2s,
                           Blake2sToField,
                           AesEncrypt,
                           AesDecrypt,
                           GrumpkinMul,
                           GrumpkinAdd,
                           GrumpkinBatchMul,
                           GrumpkinGetRandomFr,
                           GrumpkinReduce512,
                           Secp256k1Mul,
                           Secp256k1GetRandomFr,
                           Secp256k1Reduce512,
                           Bn254FrSqrt,
                           SchnorrComputePublicKey,
                           SchnorrConstructSignature,
                           SchnorrVerifySignature,
                           EcdsaSecp256k1ComputePublicKey,
                           EcdsaSecp256r1ComputePublicKey,
                           EcdsaSecp256k1ConstructSignature,
                           EcdsaSecp256r1ConstructSignature,
                           EcdsaSecp256k1RecoverPublicKey,
                           EcdsaSecp256r1RecoverPublicKey,
                           EcdsaSecp256k1VerifySignature,
                           EcdsaSecp256r1VerifySignature,
                           SrsInitSrs,
                           SrsInitGrumpkinSrs,
                           Shutdown>;

using CommandResponse = NamedUnion<CircuitProve::Response,
                                   CircuitComputeVk::Response,
                                   CircuitStats::Response,
                                   CircuitVerify::Response,
                                   ClientIvcComputeStandaloneVk::Response,
                                   ClientIvcComputeIvcVk::Response,
                                   ClientIvcStart::Response,
                                   ClientIvcLoad::Response,
                                   ClientIvcAccumulate::Response,
                                   ClientIvcProve::Response,
                                   ClientIvcVerify::Response,
                                   VkAsFields::Response,
                                   MegaVkAsFields::Response,
                                   CircuitWriteSolidityVerifier::Response,
                                   ClientIvcCheckPrecomputedVk::Response,
                                   ClientIvcStats::Response,
                                   Poseidon2Hash::Response,
                                   Poseidon2Permutation::Response,
                                   Poseidon2HashAccumulate::Response,
                                   PedersenCommit::Response,
                                   PedersenHash::Response,
                                   PedersenHashBuffer::Response,
                                   Blake2s::Response,
                                   Blake2sToField::Response,
                                   AesEncrypt::Response,
                                   AesDecrypt::Response,
                                   GrumpkinMul::Response,
                                   GrumpkinAdd::Response,
                                   GrumpkinBatchMul::Response,
                                   GrumpkinGetRandomFr::Response,
                                   GrumpkinReduce512::Response,
                                   Secp256k1Mul::Response,
                                   Secp256k1GetRandomFr::Response,
                                   Secp256k1Reduce512::Response,
                                   Bn254FrSqrt::Response,
                                   SchnorrComputePublicKey::Response,
                                   SchnorrConstructSignature::Response,
                                   SchnorrVerifySignature::Response,
                                   EcdsaSecp256k1ComputePublicKey::Response,
                                   EcdsaSecp256r1ComputePublicKey::Response,
                                   EcdsaSecp256k1ConstructSignature::Response,
                                   EcdsaSecp256r1ConstructSignature::Response,
                                   EcdsaSecp256k1RecoverPublicKey::Response,
                                   EcdsaSecp256r1RecoverPublicKey::Response,
                                   EcdsaSecp256k1VerifySignature::Response,
                                   EcdsaSecp256r1VerifySignature::Response,
                                   SrsInitSrs::Response,
                                   SrsInitGrumpkinSrs::Response,
                                   Shutdown::Response>;

/**
 * @brief Executes a command by visiting a variant of all possible commands.
 *
 * @param command The command to execute, consumed by this function.
 * @param request The circuit registry (acting as the request context).
 * @return A variant of all possible command responses.
 */
inline CommandResponse execute(BBApiRequest& request, Command&& command)
{
    return std::move(command).visit([&request](auto&& cmd) -> CommandResponse {
        using CmdType = std::decay_t<decltype(cmd)>;
        return std::forward<CmdType>(cmd).execute(request);
    });
}

// The msgpack scheme is an ad-hoc format that allows for cbind/compiler.ts to
// generate TypeScript bindings for the API.
std::string get_msgpack_schema_as_json();

} // namespace bb::bbapi
