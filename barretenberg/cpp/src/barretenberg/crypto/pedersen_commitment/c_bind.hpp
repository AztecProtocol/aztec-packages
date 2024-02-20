#pragma once
#include "barretenberg/common/wasm_export.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"

WASM_EXPORT void pedersen_commit(fr::vec_in_buf inputs_buffer, grumpkin::g1::affine_element::out_buf output);