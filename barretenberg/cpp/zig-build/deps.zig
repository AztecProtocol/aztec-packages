const std = @import("std");
const builtin = @import("builtin");

pub fn buildLmdb(b: *std.Build, target: std.Build.ResolvedTarget, optimize: std.builtin.OptimizeMode) *std.Build.Step.Compile {
    const lmdb_dep = b.dependency("lmdb", .{
        .target = target,
        .optimize = optimize,
    });

    const lmdb_lib = b.addLibrary(.{
        .name = "lmdb",
        .linkage = .static,
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
        }),
    });

    lmdb_lib.addCSourceFiles(.{
        .files = &.{
            "libraries/liblmdb/mdb.c",
            "libraries/liblmdb/midl.c",
        },
        .root = lmdb_dep.path("."),
    });

    lmdb_lib.addIncludePath(lmdb_dep.path("libraries/liblmdb"));
    lmdb_lib.linkLibC();

    return lmdb_lib;
}

pub fn buildLibdeflate(b: *std.Build, target: std.Build.ResolvedTarget, optimize: std.builtin.OptimizeMode) *std.Build.Step.Compile {
    const libdeflate_dep = b.dependency("libdeflate", .{
        .target = target,
        .optimize = optimize,
    });

    const libdeflate_lib = b.addLibrary(.{
        .name = "deflate",
        .linkage = .static,
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
        }),
    });

    const libdeflate_sources = [_][]const u8{
        "lib/utils.c",
        "lib/deflate_compress.c",
        "lib/deflate_decompress.c",
        "lib/gzip_compress.c",
        "lib/gzip_decompress.c",
        "lib/zlib_compress.c",
        "lib/zlib_decompress.c",
        "lib/adler32.c",
        "lib/crc32.c",
        "lib/arm/cpu_features.c",
        "lib/x86/cpu_features.c",
    };

    libdeflate_lib.addCSourceFiles(.{
        .files = &libdeflate_sources,
        .flags = &[_][]const u8{"-std=c99"},
        .root = libdeflate_dep.path("."),
    });

    libdeflate_lib.addIncludePath(libdeflate_dep.path("."));
    libdeflate_lib.addIncludePath(libdeflate_dep.path("lib"));
    libdeflate_lib.linkLibC();

    return libdeflate_lib;
}

pub fn buildGTest(b: *std.Build, target: std.Build.ResolvedTarget, optimize: std.builtin.OptimizeMode) *std.Build.Step.Compile {
    const gtest_dep = b.dependency("googletest", .{
        .target = target,
        .optimize = optimize,
    });

    const gtest_lib = b.addLibrary(.{
        .name = "gtest",
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
        }),
    });

    const gtest_sources = [_][]const u8{
        "googletest/src/gtest-all.cc",
        "googletest/src/gtest_main.cc",
        "googlemock/src/gmock-all.cc",
        "googlemock/src/gmock_main.cc",
    };

    gtest_lib.addCSourceFiles(.{
        .files = &gtest_sources,
        .flags = &[_][]const u8{"-std=c++14"},
        .root = gtest_dep.path("."),
    });

    gtest_lib.addIncludePath(gtest_dep.path("googletest/include"));
    gtest_lib.addIncludePath(gtest_dep.path("googletest"));
    gtest_lib.addIncludePath(gtest_dep.path("googlemock/include"));
    gtest_lib.addIncludePath(gtest_dep.path("googlemock"));
    gtest_lib.linkLibCpp();

    return gtest_lib;
}

pub fn buildGoogleBenchmark(b: *std.Build, target: std.Build.ResolvedTarget, optimize: std.builtin.OptimizeMode) *std.Build.Step.Compile {
    const gbench_dep = b.dependency("googlebenchmark", .{
        .target = target,
        .optimize = optimize,
    });

    const gbench_lib = b.addLibrary(.{
        .name = "gbench",
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
        }),
    });

    const gbench_sources = [_][]const u8{
        "src/benchmark.cc",
        "src/benchmark_api_internal.cc",
        "src/benchmark_main.cc",
        "src/benchmark_name.cc",
        "src/benchmark_register.cc",
        "src/benchmark_runner.cc",
        "src/check.cc",
        "src/colorprint.cc",
        "src/commandlineflags.cc",
        "src/complexity.cc",
        "src/console_reporter.cc",
        "src/counter.cc",
        "src/csv_reporter.cc",
        "src/json_reporter.cc",
        "src/perf_counters.cc",
        "src/reporter.cc",
        "src/statistics.cc",
        "src/string_util.cc",
        "src/sysinfo.cc",
        "src/timers.cc",
    };

    gbench_lib.addCSourceFiles(.{
        .files = &gbench_sources,
        .flags = &[_][]const u8{"-std=c++14"},
        .root = gbench_dep.path("."),
    });

    gbench_lib.addIncludePath(gbench_dep.path("include"));
    gbench_lib.linkLibCpp();

    // Platform-specific settings
    switch (target.result.os.tag) {
        .windows => {
            gbench_lib.linkSystemLibrary("shlwapi");
        },
        .linux => {
            gbench_lib.linkSystemLibrary("rt");
            gbench_lib.linkSystemLibrary("pthread");
        },
        .macos => {
            // No additional libraries needed for macOS
        },
        else => {},
    }

    return gbench_lib;
}

// The libcxx bundled in zig, when compiled, is done so without filesystem support.
// The relevant files have been copied from the zig installation to src/libcxx.
// If we want to build bb for wasm32-wasi target, we need to build this filesystem library as well.
pub fn buildWasmCxxFs(b: *std.Build) *std.Build.Step.Compile {
    const target = b.resolveTargetQuery(.{
        .cpu_arch = .wasm32,
        .os_tag = .wasi,
        .cpu_features_add = std.Target.wasm.featureSet(&.{ .atomics, .bulk_memory }),
    });

    const lib = b.addLibrary(.{
        .name = "cxxfs",
        .root_module = b.createModule(.{
            .target = target,
            .optimize = .ReleaseFast,
        }),
        .linkage = .static,
    });

    lib.linkLibC();

    // Hack within the hack. We need to get path to zig installation to include libc++ headers.
    var cp = std.process.Child.init(&[_][]const u8{ "which", "zig" }, b.allocator);
    cp.stdout_behavior = .Pipe;
    cp.stderr_behavior = .Pipe;
    cp.spawn() catch unreachable;
    const stdout = cp.stdout.?.readToEndAlloc(b.allocator, 256) catch unreachable;
    _ = cp.wait() catch unreachable;
    const zig_path = std.mem.trimRight(u8, stdout, "\r\n");
    const zig_real = std.fs.realpathAlloc(b.allocator, zig_path) catch unreachable;
    const base_zig = std.fs.path.dirname(zig_real);
    const include_path = std.fs.path.join(b.allocator, &.{ base_zig.?, "lib/libcxx/include" }) catch unreachable;

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

            "-I",
            include_path,
        },
    });

    return lib;
}
