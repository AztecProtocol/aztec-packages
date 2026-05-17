#include "barretenberg/bbapi/bbapi_chonk.hpp"
#include "barretenberg/bbapi/bbapi_crypto.hpp"
#include "barretenberg/bbapi/bbapi_ecc.hpp"
#include "barretenberg/bbapi/bbapi_ecdsa.hpp"
#include "barretenberg/bbapi/bbapi_schnorr.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/bbapi/bbapi_srs.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"

namespace bb::bbapi {
namespace {
template <typename T> void pack_command_schema_entry(MsgpackSchemaPacker& packer)
{
    packer.pack_array(2);
    packer.pack(T::MSGPACK_SCHEMA_NAME);
    packer.pack_schema(*std::make_unique<T>());
}
} // namespace

void pack_msgpack_command_schema_second(MsgpackSchemaPacker& packer)
{
    pack_command_schema_entry<Poseidon2Hash>(packer);
    pack_command_schema_entry<Poseidon2Permutation>(packer);
    pack_command_schema_entry<PedersenCommit>(packer);
    pack_command_schema_entry<PedersenHash>(packer);
    pack_command_schema_entry<PedersenHashBuffer>(packer);
    pack_command_schema_entry<Blake2s>(packer);
    pack_command_schema_entry<Blake2sToField>(packer);
    pack_command_schema_entry<AesEncrypt>(packer);
    pack_command_schema_entry<AesDecrypt>(packer);
    pack_command_schema_entry<GrumpkinMul>(packer);
    pack_command_schema_entry<GrumpkinAdd>(packer);
    pack_command_schema_entry<GrumpkinBatchMul>(packer);
    pack_command_schema_entry<GrumpkinGetRandomFr>(packer);
    pack_command_schema_entry<GrumpkinReduce512>(packer);
    pack_command_schema_entry<Secp256k1Mul>(packer);
    pack_command_schema_entry<Secp256k1GetRandomFr>(packer);
    pack_command_schema_entry<Secp256k1Reduce512>(packer);
    pack_command_schema_entry<Bn254FrSqrt>(packer);
    pack_command_schema_entry<Bn254FqSqrt>(packer);
    pack_command_schema_entry<Bn254G1Mul>(packer);
    pack_command_schema_entry<Bn254G2Mul>(packer);
    pack_command_schema_entry<Bn254G1IsOnCurve>(packer);
    pack_command_schema_entry<Bn254G1FromCompressed>(packer);
    pack_command_schema_entry<SchnorrComputePublicKey>(packer);
    pack_command_schema_entry<SchnorrConstructSignature>(packer);
    pack_command_schema_entry<SchnorrVerifySignature>(packer);
    pack_command_schema_entry<EcdsaSecp256k1ComputePublicKey>(packer);
    pack_command_schema_entry<EcdsaSecp256r1ComputePublicKey>(packer);
    pack_command_schema_entry<EcdsaSecp256k1ConstructSignature>(packer);
    pack_command_schema_entry<EcdsaSecp256r1ConstructSignature>(packer);
    pack_command_schema_entry<EcdsaSecp256k1RecoverPublicKey>(packer);
    pack_command_schema_entry<EcdsaSecp256r1RecoverPublicKey>(packer);
    pack_command_schema_entry<EcdsaSecp256k1VerifySignature>(packer);
    pack_command_schema_entry<EcdsaSecp256r1VerifySignature>(packer);
    pack_command_schema_entry<SrsInitSrs>(packer);
    pack_command_schema_entry<ChonkBatchVerifierStart>(packer);
    pack_command_schema_entry<ChonkBatchVerifierQueue>(packer);
    pack_command_schema_entry<ChonkBatchVerifierStop>(packer);
    pack_command_schema_entry<SrsInitGrumpkinSrs>(packer);
    pack_command_schema_entry<Shutdown>(packer);
}
} // namespace bb::bbapi
