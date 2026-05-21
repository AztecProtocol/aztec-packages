barretenberg_module(ipc_bench crypto_poseidon2 ipc_runtime)

# barretenberg_module's bench codepath only links MODULE_DEPENDENCIES to the
# exe, not to the *_bench_objects lib. Existing bench deps live under
# barretenberg/cpp/src/ which is already on -I, so they didn't notice;
# ipc_runtime lives at /ipc-runtime/cpp/ so its include directory has to be
# threaded into the bench_objects target explicitly.
if(TARGET ipc_bench_objects)
    target_link_libraries(ipc_bench_objects PRIVATE ipc_runtime)
endif()
