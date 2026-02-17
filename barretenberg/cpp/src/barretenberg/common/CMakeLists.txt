add_subdirectory(tracy_mem)
barretenberg_module(common env libdeflate::libdeflate_static nlohmann_json::nlohmann_json)

# Need -fPIC because it's linked into the nodejs_module shared library
set_target_properties(common_objects PROPERTIES POSITION_INDEPENDENT_CODE ON)
