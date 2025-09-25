const std = @import("std");

pub fn build(b: *std.Build) void {
    // WASM target for testing
    const target = b.resolveTargetQuery(.{
        .cpu_arch = .wasm32,
        .os_tag = .wasi,
        .cpu_features_add = std.Target.wasm.featureSet(&.{ .atomics, .bulk_memory }),
    });

    const optimize = b.standardOptimizeOption(.{});

    const lib = b.addLibrary(.{
        .name = "cxxfs",
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
        }),
        .linkage = .static,
    });

    lib.linkLibC();

    // Compute base relative to cwd.
    // const root = "/mnt/user-data/charlie/.zvm/0.15.1/lib/libcxx/src";
    // const base = std.fs.path.relative(b.allocator, ".", root) catch unreachable;

    // Filesystem sources copied locally.
    const base = "./src/libcxx";
    lib.addCSourceFiles(.{
        .files = &.{
            b.pathJoin(&.{ base, "filesystem/directory_entry.cpp" }),
            b.pathJoin(&.{ base, "filesystem/directory_iterator.cpp" }),
            b.pathJoin(&.{ base, "filesystem/filesystem_clock.cpp" }),
            b.pathJoin(&.{ base, "filesystem/filesystem_error.cpp" }),
            b.pathJoin(&.{ base, "filesystem/operations.cpp" }),
            b.pathJoin(&.{ base, "filesystem/path.cpp" }),
            b.pathJoin(&.{ base, "ios.instantiations.cpp" }),
        },
        .flags = &.{
            // libc++ config
            "-DNDEBUG",
            "-D_LIBCPP_ABI_VERSION=1",
            "-D_LIBCPP_ABI_NAMESPACE=__1",
            "-D_LIBCPP_HAS_NO_THREADS",
            "-D_LIBCPP_HAS_NO_MUSL_LIBC",
            "-D_LIBCPP_HAS_NO_STD_MODULES",
            "-D_LIBCPP_PSTL_BACKEND_SERIAL",
            "-D_LIBCPP_DISABLE_VISIBILITY_ANNOTATIONS",
            "-D_LIBCXXABI_DISABLE_VISIBILITY_ANNOTATIONS",
            "-D_LIBCPP_HAS_MONOTONIC_CLOCK",
            "-D_LIBCPP_HAS_TERMINAL",
            "-D_LIBCPP_HAS_UNICODE",
            "-D_LIBCPP_HAS_WIDE_CHARACTERS",
            "-D_LIBCPP_HAS_FILESYSTEM",
            "-D_LIBCPP_HAS_LOCALIZATION",
            "-D_LIBCPP_ENABLE_CXX17_REMOVED_UNEXPECTED_FUNCTIONS",
            // fix missing default in __config
            "-D_LIBCPP_HARDENING_MODE_DEFAULT=_LIBCPP_HARDENING_MODE_FAST",

            // building the library
            "-D_LIBCPP_BUILDING_LIBRARY",
            "-DLIBCXX_BUILDING_LIBCXXABI",
            "-D_LIBCPP_HAS_NO_PRAGMA_SYSTEM_HEADER",

            // C++ flags
            "-fno-exceptions",
            "-fvisibility=hidden",
            "-fvisibility-inlines-hidden",
            "-faligned-allocation",
            "-nostdinc++",
            "-std=c++23",
            "-Wno-user-defined-literals",
            "-Wno-covered-switch-default",
            "-Wno-suggest-override",

            // libc++ headers & internals from the Zig installation
            "-I",
            "/mnt/user-data/charlie/.zvm/0.15.1/lib/libcxx/include",
            "-I",
            "/mnt/user-data/charlie/.zvm/0.15.1/lib/libcxxabi/include",
            "-I",
            "/mnt/user-data/charlie/.zvm/0.15.1/lib/libcxx/src",
            "-I",
            "/mnt/user-data/charlie/.zvm/0.15.1/lib/libcxx/libc",
        },
    });

    const install_step = b.addInstallArtifact(lib, .{});

    const test_step = b.step("cxxfs", "Build libc++ filesystem static library for wasm32-wasi");
    test_step.dependOn(&install_step.step);

    // // Create a simple executable to test threading
    // const exe = b.addExecutable(.{
    //     .name = "threading-test",
    //     .root_module = b.createModule(.{
    //         .target = target,
    //         .optimize = optimize,
    //     }),
    // });

    // // Add the main.cpp file
    // exe.addCSourceFile(.{
    //     .file = b.path("main.cpp"),
    //     .flags = &.{
    //         "-std=c++20",
    //     },
    // });

    // exe.linkLibC();
    // exe.linkLibCpp();

    // // Install the executable
    // b.installArtifact(exe);

    // // Create a run step
    // const run_cmd = b.addRunArtifact(exe);
    // run_cmd.step.dependOn(b.getInstallStep());
    // if (b.args) |args| {
    //     run_cmd.addArgs(args);
    // }

    // const run_step = b.step("run", "Run the threading test");
    // run_step.dependOn(&run_cmd.step);

    const wasm_exe = b.addExecutable(.{
        .name = "threading-test-wasm",
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
            .single_threaded = false,
        }),
    });

    wasm_exe.libc_file = b.path("wasi-libc-posix.txt");
    wasm_exe.shared_memory = true;
    wasm_exe.import_memory = true;
    wasm_exe.export_memory = true;
    wasm_exe.export_table = true;
    // wasm_exe.import_table = true;
    wasm_exe.initial_memory = 1024 * 1024 * 64;
    wasm_exe.max_memory = 1024 * 1024 * 1024 * 4;
    wasm_exe.stack_size = 1024 * 1024 * 8;
    // wasm_exe.import_symbols = true;
    // wasm_exe.wasi_exec_model = .reactor;

    // Add C++ file
    wasm_exe.addCSourceFile(.{
        .file = b.path("main.cpp"),
        .flags = &.{
            "-std=c++20",
            "-fno-exceptions",
            "-fno-rtti",
            "-D_LIBCPP_HAS_FILESYSTEM",
            "-D_LIBCPP_HAS_LOCALIZATION",
        },
    });

    wasm_exe.linkLibC();
    wasm_exe.linkLibCpp();
    wasm_exe.linkLibrary(lib);

    const wasm_install = b.addInstallArtifact(wasm_exe, .{ .dest_dir = .{ .override = .bin } });

    const wasm_step = b.step("wasm", "Build WASM version");
    wasm_step.dependOn(&wasm_install.step);

    // Test with wasmtime (if available)
    const wasmtime_cmd = b.addSystemCommand(&.{
        "/mnt/user-data/charlie/.wasmtime/bin/wasmtime",
        "--wasm",
        "threads=y",
        "--wasm",
        "bulk-memory=y",
        "--wasi",
        "threads=y",
        "--dir=.",
        "./zig-out/bin/threading-test-wasm.wasm",
    });
    wasmtime_cmd.step.dependOn(&wasm_install.step);

    const test_wasm_step = b.step("test-wasm", "Test WASM version with wasmtime");
    test_wasm_step.dependOn(&wasmtime_cmd.step);
}
