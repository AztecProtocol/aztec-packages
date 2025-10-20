if(NOT DISABLE_AZTEC_VM)
    barretenberg_module(avm_fuzzer vm2_objects vm2 libdeflate::libdeflate_static nlohmann_json::nlohmann_json)
endif()

