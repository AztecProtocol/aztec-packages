#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::tracegen {

class GetEnvVarSpec {
  public:
    struct Table {
        bool invalid_enum;
        bool envvar_pi_lookup_col0;
        bool envvar_pi_lookup_col1;
        uint32_t envvar_pi_row_idx;
        bool is_address;
        bool is_sender;
        bool is_transactionfee;
        bool is_isstaticcall;
        bool is_l2gasleft;
        bool is_dagasleft;
        uint8_t out_tag;
    };

    static Table get_table(uint8_t envvar);

  private:
    GetEnvVarSpec();
};

} // namespace bb::avm2::tracegen
