#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/throw_or_abort.hpp"

namespace bb {
AssertMode& get_assert_mode()
{
    static AssertMode current_mode = AssertMode::ABORT;
    return current_mode;
}

void assert_failure(std::string const& err)
{
    if (get_assert_mode() == AssertMode::WARN) {
        info("NOT FOR PROD - assert as warning: ", err);
        return;
    }
    throw_or_abort(err);
}
} // namespace bb
