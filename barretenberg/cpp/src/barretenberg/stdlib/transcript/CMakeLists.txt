# Header-only compatibility shim so existing code can link `stdlib_transcript`.
add_library(stdlib_transcript INTERFACE)

# Forward usage requirements to the real transcript + stdlib deps.
target_link_libraries(stdlib_transcript INTERFACE
    transcript           # your new unified transcript target
    stdlib_circuit_builders
    stdlib_poseidon2
)
