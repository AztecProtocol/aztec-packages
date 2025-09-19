# Building with Zig.

Why would one want to build with zig?

- Zig has first class C/C++ interop.
- You don't need to have any zig code to benefit from Zig's toolchain.
- You get cross-compilation out the box targeting a wide range of architectures and operating systems.
- So you can delete cmake, clang, wasi-sdk, osxcross. (For development you'll still want to install clangd and clang-format).

## Try it out.

To demo how easy it is to get cross-compilation, we'll start with a barebones ubuntu.
Start a fresh ubuntu container within cpp folder:

```
docker run -ti --rm -v "$PWD":/cpp -w /cpp -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" ubuntu:latest
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

Build all the things:

```
zig build cross -Doptimize=ReleaseSmall
```

You will get:

```
% tree zig-out
zig-out
├── aarch64-linux
│   └── bb
├── aarch64-macos
│   └── bb
├── aarch64-windows
│   └── bb.exe
├── x86_64-linux
│   └── bb
├── x86_64-macos
│   └── bb
└── x86_64-windows
    └── bb.exe
```

If you want to build a specific target:

```
zig build aarch64-macos -Doptimize=ReleaseSmall
```

If you want to enable avm (will be Debug build with no -Doptimize):

```
zig build x86_64-linux -Davm=true
```

For more options see:

```
zig build --help
```
