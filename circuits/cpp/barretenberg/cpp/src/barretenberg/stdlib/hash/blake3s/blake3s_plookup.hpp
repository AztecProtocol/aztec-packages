#pragma once
#include <array>
#include "barretenberg/proof_system/plookup_tables/plookup_tables.hpp"
#include "barretenberg/stdlib/primitives/uint/uint.hpp"

#include "barretenberg/numeric/bitop/sparse_form.hpp"

#include "../../primitives/field/field.hpp"
#include "../../primitives/composers/composers_fwd.hpp"
#include "../../primitives/packed_byte_array/packed_byte_array.hpp"

namespace proof_system::plonk {
namespace stdlib {

namespace blake3s_plookup {

template <typename Composer> byte_array<Composer> blake3s(const byte_array<Composer>& input);

#define BLAKE3S_PLOOKUP(COMPOSER_TYPE) byte_array<COMPOSER_TYPE> blake3s(const byte_array<COMPOSER_TYPE>& input)

EXTERN_STDLIB_ULTRA_METHOD(BLAKE3S_PLOOKUP);

} // namespace blake3s_plookup

} // namespace stdlib
} // namespace proof_system::plonk
