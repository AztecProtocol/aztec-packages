# Runs one public transaction through vm2_sim from its hinted inputs. Built natively and under the wasm-eh preset, so
# the two can be compared; under wasm it also checks the simulator's C++ exceptions work.
add_executable(vm2_sim_smoke vm2_sim_smoke.cpp)
target_link_libraries(vm2_sim_smoke PRIVATE vm2_sim env)
