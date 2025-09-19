const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    // Build ECC library from C++ sources using Zig
    const ecc_lib = b.addLibrary(.{
        .name = "barretenberg-ecc",
        .linkage = .static,
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
        }),
    });

    // C binding files plus their essential dependencies
    const sources = [_][]const u8{
        // C bindings that contain our API functions
        "src/barretenberg/ecc/curves/grumpkin/c_bind.cpp",
        "src/barretenberg/ecc/curves/secp256k1/c_bind.cpp",
        "src/barretenberg/ecc/curves/bn254/c_bind.cpp",

        // Essential numeric library dependencies
        "src/barretenberg/numeric/random/engine.cpp",
        "src/barretenberg/numeric/uintx/uintx.cpp",

        // Essential common library dependencies
        "src/barretenberg/common/c_bind.cpp",
        "src/barretenberg/common/thread.cpp",
        "src/barretenberg/common/bb_bench.cpp",

        "src/barretenberg/env/logstr.cpp",
        "src/barretenberg/env/hardware_concurrency.cpp",
        "src/barretenberg/env/throw_or_abort_impl.cpp",

        // Other dependencies discovered from linker errors
        "src/barretenberg/common/parallel_for_queued.cpp",
        "src/barretenberg/common/parallel_for_atomic_pool.cpp",
        "src/barretenberg/common/parallel_for_mutex_pool.cpp",
        "src/barretenberg/common/debug_log.cpp",
    };

    const flags = [_][]const u8{
        "-std=c++20",
        "-DDISABLE_ADX",
        "-DDISABLE_AZTEC_VM=1",
        "-fno-sanitize=undefined",
        "-Wno-unused-function",
        // Disable tracy profiling
        "-DTRACY_ENABLE=0",
        // Add msgpack include path
        "-Ibuild/_deps/msgpack-c/src/msgpack-c/include",
    };

    ecc_lib.addCSourceFiles(.{
        .files = &sources,
        .flags = &flags,
    });

    ecc_lib.addIncludePath(b.path("src"));
    ecc_lib.addIncludePath(b.path("build/_deps/msgpack-c/src/msgpack-c/include"));
    ecc_lib.addIncludePath(b.path("build/_deps/tracy-src/public"));
    ecc_lib.linkLibCpp();

    // Demo executable
    const demo_exe = b.addExecutable(.{
        .name = "grumpkin-demo",
        .root_module = b.createModule(.{
            .root_source_file = b.path("demo/main.zig"),
            .target = target,
            .optimize = optimize,
        }),
    });

    demo_exe.linkLibrary(ecc_lib);
    demo_exe.linkLibCpp();
    demo_exe.addIncludePath(b.path("src"));
    demo_exe.addIncludePath(b.path("demo"));

    b.installArtifact(demo_exe);

    // Run step
    const run_cmd = b.addRunArtifact(demo_exe);
    const run_step = b.step("run", "Run the Grumpkin ECC demo");
    run_step.dependOn(&run_cmd.step);

    // WASM build with threading support
    const wasm_target = b.resolveTargetQuery(.{
        .cpu_arch = .wasm32,
        .os_tag = .wasi,
        .cpu_features_add = std.Target.wasm.featureSet(&.{ .atomics, .bulk_memory }),
    });

    const wasm_exe = b.addExecutable(.{
        .name = "grumpkin-demo-wasm",
        .root_module = b.createModule(.{
            .root_source_file = b.path("demo/main.zig"),
            .target = wasm_target,
            .optimize = .ReleaseSmall,
            .single_threaded = false,
        }),
    });

    const wasm_lib = b.addLibrary(.{
        .name = "barretenberg-ecc-wasm",
        .linkage = .static,
        .root_module = b.createModule(.{
            .target = wasm_target,
            .optimize = .ReleaseSmall,
            .single_threaded = false,
        }),
    });

    // Use the same source files as native build for WASM but with WASM-specific flags
    const wasm_flags = [_][]const u8{
        "-std=c++20",
        "-DDISABLE_ADX",
        "-DDISABLE_ASM", // Disable all assembly for WASM
        "-DDISABLE_AZTEC_VM=1",
        "-fno-sanitize=undefined",
        "-Wno-unused-function",
        "-DTRACY_ENABLE=0",
        "-fno-exceptions", // Disable exceptions for WASM
        "-fno-rtti",
        // Add msgpack include path
        "-Ibuild/_deps/msgpack-c/src/msgpack-c/include",
    };

    // For WASM, use most source files but exclude problematic ones
    // Adding polynomial_arithmetic.cpp will trigger pthread issues due to parallel_for usage
    const wasm_sources = [_][]const u8{
        "src/barretenberg/ecc/curves/grumpkin/c_bind.cpp",
        "src/barretenberg/ecc/curves/secp256k1/c_bind.cpp",
        "src/barretenberg/ecc/curves/bn254/c_bind.cpp",
        "src/barretenberg/numeric/random/engine.cpp",
        "src/barretenberg/numeric/uintx/uintx.cpp",
        // Skip c_bind.cpp as it includes timer.hpp which uses getrusage
        // "src/barretenberg/common/c_bind.cpp",
        "src/barretenberg/common/thread.cpp",
        // Skip bb_bench.cpp as it includes timer.hpp
        // "src/barretenberg/common/bb_bench.cpp",
        "src/barretenberg/env/logstr.cpp",
        "src/barretenberg/env/hardware_concurrency.cpp",
        // Skip throw_or_abort_impl.cpp as it uses exceptions
        // "src/barretenberg/env/throw_or_abort_impl.cpp",
        "src/barretenberg/common/parallel_for_queued.cpp",
        "src/barretenberg/common/parallel_for_atomic_pool.cpp",
        "src/barretenberg/common/parallel_for_mutex_pool.cpp", // This uses std::mutex and std::condition_variable!
        "src/barretenberg/common/debug_log.cpp",

        // ADD: Force threading usage by adding a file that calls parallel_for
        "src/barretenberg/polynomials/polynomial_arithmetic.cpp", // This calls parallel_for
        "src/barretenberg/threading/thread_test.cpp", // Direct parallel_for call that will be exported
    };

    wasm_lib.addCSourceFiles(.{
        .files = &wasm_sources,
        .flags = &wasm_flags,
    });

    wasm_lib.addIncludePath(b.path("src"));
    wasm_lib.addIncludePath(b.path("build/_deps/msgpack-c/src/msgpack-c/include"));
    wasm_lib.addIncludePath(b.path("build/_deps/tracy-src/public"));
    wasm_lib.linkLibCpp();

    wasm_exe.linkLibrary(wasm_lib);
    wasm_exe.linkLibCpp();
    wasm_exe.addIncludePath(b.path("src"));
    wasm_exe.addIncludePath(b.path("demo"));

    const wasm_step = b.step("wasm", "Build WASM version");
    wasm_step.dependOn(&b.addInstallArtifact(wasm_exe, .{}).step);
}
