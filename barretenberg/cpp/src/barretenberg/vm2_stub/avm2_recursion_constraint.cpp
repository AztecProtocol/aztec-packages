#include "avm2_recursion_constraint.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include <stdexcept>

namespace acir_format {

/**
 * @brief Stub implementation for AVM2 recursion constraints
 * @details This function is linked when building bb-no-avm. It throws a runtime error
 * if AVM recursion is attempted. Users should use the full 'bb' binary for AVM support.
 */
AvmRecursionConstraintOutput create_avm2_recursion_constraints_goblin([[maybe_unused]] UltraCircuitBuilder& builder,
                                                                      [[maybe_unused]] const RecursionConstraint& input)
{
    throw_or_abort(
        "AVM recursion is not supported in this build. Please use the 'bb-avm' binary with full AVM support.");
}

} // namespace acir_format
