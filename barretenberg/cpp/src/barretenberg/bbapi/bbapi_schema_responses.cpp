#include "barretenberg/bbapi/bbapi_avm.hpp"
#include "barretenberg/bbapi/bbapi_chonk.hpp"
#include "barretenberg/bbapi/bbapi_crypto.hpp"
#include "barretenberg/bbapi/bbapi_ecc.hpp"
#include "barretenberg/bbapi/bbapi_ecdsa.hpp"
#include "barretenberg/bbapi/bbapi_schnorr.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/bbapi/bbapi_srs.hpp"
#include "barretenberg/bbapi/bbapi_ultra_honk.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"

namespace bb::bbapi {
namespace {
template <typename T> void pack_response_schema_entry(MsgpackSchemaPacker& packer)
{
    packer.pack_array(2);
    packer.pack(T::MSGPACK_SCHEMA_NAME);
    packer.pack_schema(*std::make_unique<T>());
}
} // namespace

void pack_msgpack_response_schema(MsgpackSchemaPacker& packer)
{
    packer.pack_array(2);
    packer.pack("named_union");
    packer.pack_array(63);
    pack_response_schema_entry<ErrorResponse>(packer);
    pack_response_schema_entry<AvmProve::Response>(packer);
    pack_response_schema_entry<AvmVerify::Response>(packer);
    pack_response_schema_entry<AvmCheckCircuit::Response>(packer);
    pack_response_schema_entry<CircuitProve::Response>(packer);
    pack_response_schema_entry<CircuitComputeVk::Response>(packer);
    pack_response_schema_entry<CircuitStats::Response>(packer);
    pack_response_schema_entry<CircuitVerify::Response>(packer);
    pack_response_schema_entry<ChonkComputeVk::Response>(packer);
    pack_response_schema_entry<ChonkStart::Response>(packer);
    pack_response_schema_entry<ChonkLoad::Response>(packer);
    pack_response_schema_entry<ChonkAccumulate::Response>(packer);
    pack_response_schema_entry<ChonkProve::Response>(packer);
    pack_response_schema_entry<ChonkVerify::Response>(packer);
    pack_response_schema_entry<ChonkVerifyFromFields::Response>(packer);
    pack_response_schema_entry<ChonkBatchVerify::Response>(packer);
    pack_response_schema_entry<VkAsFields::Response>(packer);
    pack_response_schema_entry<MegaVkAsFields::Response>(packer);
    pack_response_schema_entry<CircuitWriteSolidityVerifier::Response>(packer);
    pack_response_schema_entry<ChonkCheckPrecomputedVk::Response>(packer);
    pack_response_schema_entry<ChonkStats::Response>(packer);
    pack_response_schema_entry<ChonkCompressProof::Response>(packer);
    pack_response_schema_entry<ChonkDecompressProof::Response>(packer);
    pack_response_schema_entry<Poseidon2Hash::Response>(packer);
    pack_response_schema_entry<Poseidon2Permutation::Response>(packer);
    pack_response_schema_entry<PedersenCommit::Response>(packer);
    pack_response_schema_entry<PedersenHash::Response>(packer);
    pack_response_schema_entry<PedersenHashBuffer::Response>(packer);
    pack_response_schema_entry<Blake2s::Response>(packer);
    pack_response_schema_entry<Blake2sToField::Response>(packer);
    pack_response_schema_entry<AesEncrypt::Response>(packer);
    pack_response_schema_entry<AesDecrypt::Response>(packer);
    pack_response_schema_entry<GrumpkinMul::Response>(packer);
    pack_response_schema_entry<GrumpkinAdd::Response>(packer);
    pack_response_schema_entry<GrumpkinBatchMul::Response>(packer);
    pack_response_schema_entry<GrumpkinGetRandomFr::Response>(packer);
    pack_response_schema_entry<GrumpkinReduce512::Response>(packer);
    pack_response_schema_entry<Secp256k1Mul::Response>(packer);
    pack_response_schema_entry<Secp256k1GetRandomFr::Response>(packer);
    pack_response_schema_entry<Secp256k1Reduce512::Response>(packer);
    pack_response_schema_entry<Bn254FrSqrt::Response>(packer);
    pack_response_schema_entry<Bn254FqSqrt::Response>(packer);
    pack_response_schema_entry<Bn254G1Mul::Response>(packer);
    pack_response_schema_entry<Bn254G2Mul::Response>(packer);
    pack_response_schema_entry<Bn254G1IsOnCurve::Response>(packer);
    pack_response_schema_entry<Bn254G1FromCompressed::Response>(packer);
    pack_response_schema_entry<SchnorrComputePublicKey::Response>(packer);
    pack_response_schema_entry<SchnorrConstructSignature::Response>(packer);
    pack_response_schema_entry<SchnorrVerifySignature::Response>(packer);
    pack_response_schema_entry<EcdsaSecp256k1ComputePublicKey::Response>(packer);
    pack_response_schema_entry<EcdsaSecp256r1ComputePublicKey::Response>(packer);
    pack_response_schema_entry<EcdsaSecp256k1ConstructSignature::Response>(packer);
    pack_response_schema_entry<EcdsaSecp256r1ConstructSignature::Response>(packer);
    pack_response_schema_entry<EcdsaSecp256k1RecoverPublicKey::Response>(packer);
    pack_response_schema_entry<EcdsaSecp256r1RecoverPublicKey::Response>(packer);
    pack_response_schema_entry<EcdsaSecp256k1VerifySignature::Response>(packer);
    pack_response_schema_entry<EcdsaSecp256r1VerifySignature::Response>(packer);
    pack_response_schema_entry<SrsInitSrs::Response>(packer);
    pack_response_schema_entry<ChonkBatchVerifierStart::Response>(packer);
    pack_response_schema_entry<ChonkBatchVerifierQueue::Response>(packer);
    pack_response_schema_entry<ChonkBatchVerifierStop::Response>(packer);
    pack_response_schema_entry<SrsInitGrumpkinSrs::Response>(packer);
    pack_response_schema_entry<Shutdown::Response>(packer);
}
} // namespace bb::bbapi
