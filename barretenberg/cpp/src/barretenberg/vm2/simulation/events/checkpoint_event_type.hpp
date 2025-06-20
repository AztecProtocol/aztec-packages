#pragma once

#include <cstddef>

namespace bb::avm2::simulation {

enum CheckPointEventType {
    CREATE_CHECKPOINT,
    COMMIT_CHECKPOINT,
    RESTORE_CHECKPOINT,
};

} // namespace bb::avm2::simulation
