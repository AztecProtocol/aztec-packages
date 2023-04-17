#pragma once
#include <aztec3/oracle/oracle.hpp>
#include <aztec3/circuits/apps/oracle_wrapper.hpp>
#include <aztec3/circuits/apps/function_execution_context.hpp>

#include <aztec3/circuits/recursion/aggregator.hpp>

#include <aztec3/circuits/abis/private_kernel/private_inputs.hpp>

#include <stdlib/types/types.hpp>
#include <stdlib/types/convert.hpp>
#include <stdlib/types/circuit_types.hpp>
#include <stdlib/types/native_types.hpp>

namespace aztec3::circuits::kernel::private_kernel {

// Turbo specific, at the moment:
using Composer = plonk::stdlib::types::Composer;
using plonk::stdlib::types::Prover;

using Aggregator = aztec3::circuits::recursion::Aggregator;

// Generic:
using CT = plonk::stdlib::types::CircuitTypes<Composer>;
using NT = plonk::stdlib::types::NativeTypes;
using plonk::stdlib::types::to_ct;

using DB = oracle::FakeDB;
using oracle::NativeOracle;
using OracleWrapper = aztec3::circuits::apps::OracleWrapperInterface<Composer>;

using FunctionExecutionContext = aztec3::circuits::apps::FunctionExecutionContext<Composer>;

} // namespace aztec3::circuits::kernel::private_kernel