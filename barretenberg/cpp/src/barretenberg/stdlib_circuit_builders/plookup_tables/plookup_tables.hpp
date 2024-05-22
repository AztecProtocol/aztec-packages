#pragma once
#include "barretenberg/common/throw_or_abort.hpp"

#include "./fixed_base/fixed_base.hpp"
#include "aes128.hpp"
#include "blake2s.hpp"
#include "dummy.hpp"
#include "keccak/keccak_chi.hpp"
#include "keccak/keccak_input.hpp"
#include "keccak/keccak_output.hpp"
#include "keccak/keccak_rho.hpp"
#include "keccak/keccak_theta.hpp"
#include "non_native_group_generator.hpp"
#include "sha256.hpp"
#include "sparse.hpp"
#include "types.hpp"
#include "uint.hpp"

namespace bb::plookup {

const MultiTable& create_table(MultiTableId id);

ReadData<bb::fr> get_lookup_accumulators(MultiTableId id,
                                         const bb::fr& key_a,
                                         const bb::fr& key_b = 0,
                                         bool is_2_to_1_lookup = false);

BasicTable create_basic_table(const BasicTableId id, const size_t index);
} // namespace bb::plookup
