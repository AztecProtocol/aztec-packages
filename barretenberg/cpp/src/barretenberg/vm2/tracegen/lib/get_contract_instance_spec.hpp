#pragma once

#include <cstdint>

namespace bb::avm2::tracegen {

class GetContractInstanceSpec {
  public:
    struct Table {
        bool is_valid_member_enum;
        bool is_deployer;
        bool is_class_id;
        bool is_init_hash;
        bool is_immutables_hash;
    };

    static Table get_table(uint8_t member_enum);

  private:
    GetContractInstanceSpec();
};

} // namespace bb::avm2::tracegen
