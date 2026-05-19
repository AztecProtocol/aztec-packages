#pragma once

#include <memory>

namespace bb {

class ECCOpQueue;

bool ecc_op_queue_accumulator_is_empty(const std::shared_ptr<ECCOpQueue>& op_queue);

} // namespace bb
