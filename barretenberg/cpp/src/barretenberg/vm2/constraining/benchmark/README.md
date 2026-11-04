Compile with (from `barretenberg/cpp/`)

- `cmake --preset bench`.
- `cmake --build --preset bench --target relations_acc_bench`.

Run with `( cd build-bench && bin/relations_acc_bench )`.

The `bench` preset inherits `clang20`. It needs Zig (`scripts/zig-cc.sh` wraps `zig cc`) and expects the avm-transpiler library at `avm-transpiler/target/release/libavm_transpiler.a`.
