# Building with Zig

Why would one want to build with zig?

- Zig has first class C/C++ interop.
- You don't need to have any zig code to benefit from Zig's toolchain.
- You get cross-compilation out the box targeting a wide range of architectures and operating systems.
- So you can delete cmake, clang, wasi-sdk, osxcross. (For development you'll still want to install clangd and clang-format).
- Zig's syntax and build system is far superior to that of cmake.
- Compilation becomes a ~1 line zig install followed by desired build command.

_Caveat on the above, we do still presently need wasi-sdk at its normal location as wasi-libc in the zig installation
does not enable multithreading. This will change in the near future._

## Installing Zig

To demo how easy it is to get cross-compilation, we'll start with a barebones ubuntu.
Start a fresh ubuntu container within cpp folder:

```
docker run -ti --rm -v "$PWD":/cpp -v/opt/wasi-sdk:/opt/wasi-sdk -w /cpp -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" ubuntu:latest
```

Install zig and become host user:

```
apt update
apt install -y curl xz-utils
mkdir -p /opt/zig
curl -sL https://ziglang.org/download/0.15.1/zig-x86_64-linux-0.15.1.tar.xz | tar -xJ -C /opt/zig --strip-components=1
ln -s /opt/zig/zig /usr/local/bin/zig

groupadd -g "$HOST_GID" hostuser
useradd -m -u "$HOST_UID" -g "$HOST_GID" hostuser
su hostuser -s /bin/bash
```

To see build options:

```
zig build --help
```

## Building

Build bb binary and library for all platforms:

```
zig build cross --release=small --summary all
```

This will print a nice summary of the build graph described in build.zig with timings and memory usage.
You will get an output folder zig-out with the following structure:

```
zig-out
├── aarch64-linux
│   ├── bb
│   └── libbarretenberg.a
├── aarch64-macos
│   ├── bb
│   └── libbarretenberg.a
├── aarch64-windows
│   ├── barretenberg.lib
│   ├── bb.exe
│   └── bb.pdb
├── wasm32-wasi
│   ├── barretenberg.wasm
│   ├── barretenberg.wasm.gz
│   ├── bb.wasm
│   └── libbarretenberg.a
├── x86_64-linux
│   ├── bb
│   └── libbarretenberg.a
├── x86_64-macos
│   ├── bb
│   └── libbarretenberg.a
└── x86_64-windows
    ├── barretenberg.lib
    ├── bb.exe
    └── bb.pdb
```

If you want to build the bb binary and library for a specific target:

```
zig build -Dtarget=aarch64-macos --release=small
```

If you want to enable avm in the bb binary:

```
zig build -Davm=true --release=small
```

If you want to build the bb binary for wasm plus the reactor wasm for JS.
Note that wasm is _always build with --release=small, even if unspecified_.
Otherwise it's too huge:

```
zig build -Dtarget=wasm32-wasi --release=small
```

If you want a debug build, just exclude the --release:

```
zig build
```

## The Build System

Files:

- `build.zig` - Main build logic. Defines the build graph and available steps.
- `zig-build/deps.zig` - Exports functions that build dependent libs e.g. libdefalte, libllmdb, etc.
- `zig-build/sources.zig` - Collections of source files that are composed to build artifacts. Also lists test groups, and bencharmark files etc.

If you create a new cpp file, you'll need to add it to it's appropriate collection in `sources.zig`.

Zig builds use a cache in `.zig-cache`. You can delete this (and `zig-out`) to do completely fresh builds.
