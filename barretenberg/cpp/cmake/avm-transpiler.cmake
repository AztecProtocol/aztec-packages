# avm-transpiler static library configuration
# AVM_TRANSPILER_LIB should be set by the CMake preset to point to the appropriate library
if(NOT AVM_TRANSPILER_LIB)
    message(FATAL_ERROR "AVM_TRANSPILER_LIB is not set. Set it in your CMake preset to the path of libavm_transpiler.a")
endif()

# Set the path to avm-transpiler relative to barretenberg
set(AVM_TRANSPILER_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../avm-transpiler")
set(AVM_TRANSPILER_INCLUDE "${AVM_TRANSPILER_DIR}")

# Check if the library exists
if(NOT EXISTS ${AVM_TRANSPILER_LIB})
    message(FATAL_ERROR "avm-transpiler library not found at ${AVM_TRANSPILER_LIB}\nPlease run './bootstrap.sh' in ${AVM_TRANSPILER_DIR} to build libraries")
endif()

# Create imported library target
add_library(avm_transpiler STATIC IMPORTED)
set_target_properties(avm_transpiler PROPERTIES
    IMPORTED_LOCATION ${AVM_TRANSPILER_LIB}
    INTERFACE_INCLUDE_DIRECTORIES ${AVM_TRANSPILER_INCLUDE}
)

# Define ENABLE_AVM_TRANSPILER globally when transpiler is available
add_definitions(-DENABLE_AVM_TRANSPILER)

message(STATUS "avm-transpiler library: ${AVM_TRANSPILER_LIB}")
message(STATUS "avm-transpiler include: ${AVM_TRANSPILER_INCLUDE}")
