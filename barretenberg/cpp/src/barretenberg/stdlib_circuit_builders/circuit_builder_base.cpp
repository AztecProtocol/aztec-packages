#include "barretenberg/stdlib_circuit_builders/circuit_builder_base.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ecc/fields/field_impl.hpp"
#include "barretenberg/ecc/fields/field_impl_generic.hpp"
#include "barretenberg/ecc/fields/field_impl_x64.hpp"
#include "barretenberg/numeric/uint256/uint256_impl.hpp"

namespace bb {

// Standard honk/ plonk instantiation
template class CircuitBuilderBase<bb::fr>;
template class CircuitBuilderBase<grumpkin::fr>;
} // namespace bb
