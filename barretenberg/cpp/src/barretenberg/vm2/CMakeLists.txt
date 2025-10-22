barretenberg_module(vm2 sumcheck stdlib_honk_verifier stdlib_goblin_verifier api)

# Create a SHARED library variant for dynamic loading
if(NOT FUZZING AND NOT WASM)
    add_library(
        vm2_shared
        SHARED
        $<TARGET_OBJECTS:vm2_objects>
    )

    target_link_libraries(
        vm2_shared
        PUBLIC
        sumcheck
        stdlib_honk_verifier
        stdlib_goblin_verifier
        api
        ${TRACY_LIBS}
        ${TBB_IMPORTED_TARGETS}
    )

    # Set output name to libvm2.so / libvm2.dylib
    set_target_properties(
        vm2_shared
        PROPERTIES
        OUTPUT_NAME vm2
        POSITION_INDEPENDENT_CODE ON
        # Ensure create_avm_api symbol is exported
        CXX_VISIBILITY_PRESET default
    )
endif()
