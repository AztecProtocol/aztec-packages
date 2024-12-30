barretenberg_module(crypto_poseidon)

execute_process(
    COMMAND ${CMAKE_C_COMPILER} -dumpmachine
    OUTPUT_VARIABLE BUILD_TARGET
)

file(RELATIVE_PATH CURRENT_RELATIVE_PATH "${CMAKE_SOURCE_DIR}" "${CMAKE_CURRENT_SOURCE_DIR}")

set(SOURCE_RELATIVE_PATH ${CURRENT_RELATIVE_PATH}/sources)

set(SOURCE_DIR ${CMAKE_SOURCE_DIR}/${SOURCE_RELATIVE_PATH})

set(BUILD_DIR ${CMAKE_BINARY_DIR}/${SOURCE_RELATIVE_PATH})

file(COPY ${SOURCE_DIR}/ DESTINATION ${BUILD_DIR}/)

if (BUILD_TARGET MATCHES "x86_64")
    set(LIBRARY_RELATIVE_PATH ${SOURCE_RELATIVE_PATH}/lib_pos_asm.so)
else()
    set(LIBRARY_RELATIVE_PATH ${SOURCE_RELATIVE_PATH}/lib_pos.so)
endif()

set(LIBRARY_FILE ${CMAKE_BINARY_DIR}/${LIBRARY_RELATIVE_PATH})

file(GLOB SOURCE_FILES ${SOURCE_DIR}/*.h ${SOURCE_DIR}/*.c ${SOURCE_DIR}/*.S)

add_custom_command(
    OUTPUT ${LIBRARY_FILE}
    COMMAND make clean > /dev/null && make > /dev/null
    WORKING_DIRECTORY ${BUILD_DIR}
    DEPENDS ${SOURCE_FILES}
    COMMENT "Building C static library ${LIBRARY_RELATIVE_PATH}"
)

add_custom_target(crypto_poseidon_sources ALL DEPENDS ${LIBRARY_FILE})

add_dependencies(bb crypto_poseidon_sources)

target_link_libraries(bb PRIVATE ${LIBRARY_FILE})
