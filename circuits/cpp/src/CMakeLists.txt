set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)

add_compile_options(-Werror -Wall -Wextra -Wconversion -Wsign-conversion -Wno-deprecated -Wno-tautological-compare -Wfatal-errors)

if(CMAKE_CXX_COMPILER_ID MATCHES "Clang")
    add_compile_options(-fconstexpr-steps=100000000)
    if(MEMORY_CHECKS)
        message(STATUS "Compiling with memory checks.")
        set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fsanitize=address")
    endif()
endif()

if(CMAKE_CXX_COMPILER_ID MATCHES "GNU")
    add_compile_options(-fconstexpr-ops-limit=100000000)
endif()

include_directories(${CMAKE_CURRENT_SOURCE_DIR} ${CMAKE_CURRENT_SOURCE_DIR}/../barretenberg/cpp/src/msgpack-c/include)
include(ExternalProject)
ExternalProject_Add(cvc5
   GIT_REPOSITORY https://github.com/Sarkoxed/cvc5
   SOURCE_DIR src/cvc5
   BINARY_DIR build-cvc5
   CMAKE_ARGS
#       -DCMAKE_INSTAL_PREFIX:PATH=    
#       -DCMAKE_PREFIX_PATH="${CMAKE_BINARY_DIR}/tmp"
       -DCMAKE_BUILD_TYPE=Production
       -DCMAKE_CXX_COMPILER=${CMAKE_CXX_COMPILER}
        -DCMAKE_C_COMPILER=/usr/bin/clang 
        -DCMAKE_CXX_COMPILER=/usr/bin/clang++ 
        -DENABLE_AUTO_DOWNLOAD=ON 
        -DBUILD_SHARED_LIBS=OFF 
        -DUSE_CRYPTOMINISAT=ON 
        -DUSE_POLY=ON 
        -DUSE_COCOA=ON 
)
# I feel this should be limited to ecc, however it's currently used in headers that go across libraries,
# and there currently isn't an easy way to inherit the DDISABLE_SHENANIGANS parameter.
if(DISABLE_ASM)
    message(STATUS "Using fallback non-assembly methods for field multiplications.")
    add_definitions(-DDISABLE_SHENANIGANS=1)
else()
    message(STATUS "Using optimized assembly for field arithmetic.")
endif()

add_subdirectory(aztec3)
