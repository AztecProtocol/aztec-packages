barretenberg_module(api chonk bbapi dsl libdeflate::libdeflate_static nlohmann_json::nlohmann_json)

# Link avm_transpiler when library is provided
if(AVM_TRANSPILER_LIB)
    target_link_libraries(api_objects PRIVATE avm_transpiler)
endif()

# api_objects compiles api_msgpack.cpp / api_chonk.cpp / api_ultra_honk.cpp
# which transitively include bbapi/generated/bb_types.hpp → ipc_runtime/throw.hpp.
# ipc_runtime is a STATIC lib natively and an INTERFACE (header-only) lib under
# WASM, so linking under both modes just propagates the include path.
if(NOT BB_LITE)
    target_link_libraries(api_objects PRIVATE ipc_runtime)
endif()
