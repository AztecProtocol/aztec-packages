# avm-transpiler static library configuration

# Set the path to avm-transpiler relative to barretenberg
set(AVM_TRANSPILER_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../avm-transpiler")

# Add include directory
set(AVM_TRANSPILER_INCLUDE "${AVM_TRANSPILER_DIR}")

set(AVM_TRANSPILER_LIB "${AVM_TRANSPILER_DIR}/target/release/libavm_transpiler.a")

# Check if the library exists, if not, provide instructions
if(NOT EXISTS ${AVM_TRANSPILER_LIB})
    message(STATUS "avm-transpiler library not found at ${AVM_TRANSPILER_LIB}")
    message(STATUS "Building avm-transpiler...")
    execute_process(
        COMMAND cargo build --release --lib
        WORKING_DIRECTORY ${AVM_TRANSPILER_DIR}
        RESULT_VARIABLE BUILD_RESULT
    )
    if(NOT BUILD_RESULT EQUAL 0)
        message(FATAL_ERROR "Failed to build avm-transpiler. Please run 'cargo build --release --lib' in ${AVM_TRANSPILER_DIR}")
    endif()
endif()

# Create imported library target
add_library(avm_transpiler STATIC IMPORTED)
set_target_properties(avm_transpiler PROPERTIES
    IMPORTED_LOCATION ${AVM_TRANSPILER_LIB}
    INTERFACE_INCLUDE_DIRECTORIES ${AVM_TRANSPILER_INCLUDE}
)

message(STATUS "avm-transpiler library: ${AVM_TRANSPILER_LIB}")
message(STATUS "avm-transpiler include: ${AVM_TRANSPILER_INCLUDE}")
