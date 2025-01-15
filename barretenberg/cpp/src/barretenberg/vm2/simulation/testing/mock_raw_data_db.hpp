#include "barretenberg/vm2/simulation/lib/raw_data_db.hpp"

#include <cassert>
#include <gmock/gmock.h>

namespace bb::avm2::simulation {

class MockRawDataDB : public RawDataDBInterface {
    // https://google.github.io/googletest/gmock_cook_book.html#making-the-compilation-faster
    MockRawDataDB();
    ~MockRawDataDB() override;

    MOCK_METHOD(ContractInstance, get_contract_instance, (const AztecAddress& address), (const, override));
    MOCK_METHOD(ContractClass, get_contract_class, (const ContractClassId& class_id), (const, override));
};

} // namespace bb::avm2::simulation