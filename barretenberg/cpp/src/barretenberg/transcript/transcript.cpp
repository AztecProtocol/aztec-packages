#include "transcript.hpp"

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"

bb::NativeTranscriptParams::Fr bb::NativeTranscriptParams::hash(const std::vector<Fr>& data)
{
    return crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(data);
}
