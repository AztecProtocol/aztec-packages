#include "c_bind.hpp"

#include <vector>

#include "barretenberg/common/serialize.hpp"
#include "barretenberg/ecc/fields/field_declarations.hpp"
#include "barretenberg/ecc/fields/field_impl.hpp"
#include "barretenberg/ecc/fields/field_impl_generic.hpp"
#include "barretenberg/ecc/fields/field_impl_x64.hpp"
#include "barretenberg/numeric/uint256/uint256_impl.hpp"
#include "pedersen.hpp"

using namespace bb;

WASM_EXPORT void pedersen_commit(fr::vec_in_buf inputs_buffer, grumpkin::g1::affine_element::out_buf output)
{
    std::vector<grumpkin::fq> to_commit;
    read(inputs_buffer, to_commit);
    grumpkin::g1::affine_element pedersen_commitment = crypto::pedersen_commitment::commit_native(to_commit);

    serialize::write(output, pedersen_commitment);
}