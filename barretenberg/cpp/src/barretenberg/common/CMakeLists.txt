add_subdirectory(tracy_mem)
barretenberg_module(common env libdeflate::libdeflate_static nlohmann_json::nlohmann_json)

set_target_properties(common_objects PROPERTIES POSITION_INDEPENDENT_CODE ON)
