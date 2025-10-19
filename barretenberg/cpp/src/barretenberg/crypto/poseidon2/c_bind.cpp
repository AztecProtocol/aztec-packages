// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "c_bind.hpp"
#include "barretenberg/common/mem.hpp"
#include "barretenberg/common/serialize.hpp"
#include "poseidon2.hpp"

using namespace bb;

WASM_EXPORT void poseidon2_hash(fr::vec_in_buf inputs_buffer, fr::out_buf output)
{
    std::vector<fr> to_hash;
    read(inputs_buffer, to_hash);
    auto r = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(to_hash);
    fr::serialize_to_buffer(r, output);
}
