---
id: building_from_source
title: Building Node Software from Source
description: Build the Aztec node Docker image from source code for development, testing, or running a specific version.
displayed_sidebar: operatorsSidebar
---

## Overview

This guide shows you how to build the Aztec node Docker image from source, including all build tools and dependencies.

Building from source allows you to:

- Run a specific tagged version
- Verify the build process matches the official CI pipeline
- Customize the software for development or testing
- Audit the complete build chain

### Requirements

**Hardware:**
- 4 core / 8 vCPU
- 16 GB RAM for Docker
- 150 GB free disk space
- Stable internet connection

**Software:**
- Git to clone the repository
- Docker version 20.10 or later with at least 16 GB RAM allocated

This guide assumes you're using a standard Linux distribution such as Debian or Ubuntu. While other operating systems may work, these instructions are tested and optimized for Linux environments.

These requirements are for building the software. Running a node has different requirements—see [Running a Full Node](./running-a-node.md).

## Build Steps

### Step 1: Clone the Repository

Clone the Aztec packages repository:

```bash
git clone https://github.com/AztecProtocol/aztec-packages.git
cd aztec-packages
```

### Step 2: Check Out a Version Tag

Check out the version tag you want to build. For example, to build version #release_version:

```bash
git checkout v#release_version
```

:::tip
View all available release tags with:
```bash
git tag | grep "^v[0-9]"
```
:::

### Step 3: Build the Container with Build Tools

Build the container image with all necessary compilation tools:

```bash
cd build-images/src
docker build --target build -t aztec-build-local:3.0 .
cd ../..
```

:::tip
The tag `aztec-build-local:3.0` avoids conflicts with the official Docker Hub image and clearly indicates this is a locally-built version.
:::

**What this does:**
- Builds the `build` stage from `build-images/src/Dockerfile`
- Installs Node.js 24.12.0 from NodeSource repository
- Installs Clang 16, 18, and 20 from LLVM
- Installs Rust 1.85.0 using the Rust toolchain installer with wasm32 targets
- Downloads and installs WASI SDK 27 from GitHub releases
- Builds Foundry v1.4.1 from source
- Installs CMake, Ninja, and other build essentials

:::note
This step builds all compilation tooling from scratch. The Dockerfile uses multi-stage builds—you only need the `build` target. Other targets (`devbox` and `sysbox`) are for development environments.
:::

:::tip Verifying the Build Image
After the build completes, inspect the image to verify its contents:

```bash
# Run a shell in the container to explore
docker run -it --rm aztec-build-local:3.0 /bin/bash

# Check specific versions once inside:
node --version        # Should show v24.12.0
rustc --version       # Should show Rust 1.85.0
clang-20 --version    # Should show clang 20.x
forge --version       # Should show v1.4.1
cmake --version       # Should show cmake 3.24+
```

You can review the Dockerfile at `build-images/src/Dockerfile` to see exactly what's installed and verify each step.
:::

### Step 4: Compile the Source Code

Run the bootstrap script inside the build container to compile all source code:

```bash
docker run --rm \
  -v $(pwd):/workspaces/aztec-packages \
  -w /workspaces/aztec-packages \
  aztec-build-local:3.0 \
  ./bootstrap.sh full
```

**What this does:**
- Mounts your local repository into the container
- Compiles C++ code (Barretenberg proving system)
- Compiles Rust code (Noir compiler and ACVM)
- Builds TypeScript/JavaScript packages
- Writes compiled artifacts to your local filesystem (persist after container exits)
- Runs tests to verify the build

:::note
The bootstrap process is incremental—if interrupted, restart it to resume from where it left off. Git submodules for L1 contract dependencies are initialized automatically during the build.
:::

### Step 5: Build the Runtime Base Image

Build the runtime base image with Node.js dependencies. This image contains only runtime requirements—no build tools or compiled code:

```bash
docker build -f release-image/Dockerfile.base -t aztecprotocol/release-image-base .
```

:::note
The tag `aztecprotocol/release-image-base` must match exactly—the Dockerfile in Step 6 references this specific tag. This image is not published to Docker Hub; it exists only locally.
:::

**What this does:**
- Installs production Node.js dependencies (no dev dependencies)
- Includes Node.js 24 runtime and system utilities
- Copies Foundry tools (anvil, cast) from the build container
- Creates a slim Ubuntu-based runtime environment without build tools

### Step 6: Build the Final Release Image

Build the final node image, combining the runtime environment (Step 5) with your compiled code (Step 4):

```bash
docker build -f release-image/Dockerfile --build-arg VERSION=#release_version -t aztec-local:#release_version .
```

:::tip
The tag `aztec-local:#release_version` avoids conflicts with the official Docker Hub image and clearly indicates this is a locally-built version.
:::

**Build arguments:**
- `VERSION` - Sets the version string that appears in `aztec --version`

**What this does:**
- Starts from the `aztecprotocol/release-image-base` image (Step 5)
- Copies compiled source code from your local filesystem (Step 4)
- Sets up environment variables for Barretenberg and ACVM binaries
- Configures the entrypoint to run the Aztec node

## Verification

Verify your build completed successfully:

### Check Image Exists

```bash
docker images aztec-local
```

You should see your image listed:

```
REPOSITORY      TAG       IMAGE ID       CREATED        SIZE
aztec-local     #release_version     abc123def456   2 minutes ago  2.5GB
```

### Verify Version

```bash
docker run --rm aztec-local:#release_version --version
```

Should display version #release_version.

### Test Basic Functionality

```bash
docker run --rm aztec-local:#release_version --help
```

Should display CLI help information without errors.

If all checks pass, your image is ready to use.

## Troubleshooting

### Build fails with "no space left on device"

**Issue**: Insufficient disk space.

**Solutions**:
- Clean up unused Docker images and build cache: `docker system prune -a`
- Free up at least 150 GB of disk space
- Ensure adequate storage for intermediate build artifacts

### Build image fails

**Issue**: Errors during Step 3 when building `aztec-build-local:3.0`.

**Solutions**:
- Verify you're in the `build-images/src` directory
- Ensure the `--target build` flag is specified
- Retry the build if network issues occur while downloading Rust, LLVM, or WASI SDK
- Review `build-images/src/Dockerfile` to identify the failing stage

### Build fails with "failed to solve with frontend dockerfile.v0: failed to create LLB definition"

**Issue**: The release image build cannot find the base image.

**Solutions**:
- Ensure you completed Step 5 and built the base image with the exact tag: `aztecprotocol/release-image-base`
- Verify the base image exists locally: `docker images aztecprotocol/release-image-base`
- If missing, return to Step 5 and rebuild the base image

### Bootstrap compilation fails

**Issue**: Errors during `./bootstrap.sh` in Step 4.

**Solutions**:
- Verify you're using the correct build image: `aztec-build-local:3.0`
- Confirm you checked out a valid release tag (not a branch)
- Retry the build—the bootstrap script is incremental and resumes where it left off
- Review error messages for specifics—missing dependencies should not occur in the build container

### Docker runs out of memory

**Issue**: Build crashes due to insufficient memory.

**Solutions**:
- Increase Docker's memory limit to at least 16 GB (Docker Desktop: Settings → Resources → Memory)
- Close other applications to free system memory
- Build on a machine with more RAM if possible

### Wrong version shows in `aztec --version`

**Issue**: Version argument not passed correctly.

**Solutions**:
- Ensure you used `--build-arg VERSION=X.Y.Z` when building the release image
- The version should match the git tag without the 'v' prefix (e.g., `#release_version` not `v#release_version`)

## Using Your Custom Build

### Running a Node

Use your locally-built image with any node setup method. For Docker Compose, update your `docker-compose.yml`:

```yaml
services:
  aztec-node:
    image: "aztec-local:#release_version"
    # ... rest of configuration
```

See [Running a Full Node](./running-a-node.md) for complete setup instructions.

### Using the CLI

Run the Aztec CLI directly from your custom image:

```bash
docker run --rm aztec-local:#release_version --version
```

## Alternative Approaches

### Using Pre-built Build Image

To save time, skip Step 3 and pull the pre-built image from Docker Hub, then tag it locally:

```bash
docker pull aztecprotocol/build:3.0
docker tag aztecprotocol/build:3.0 aztec-build-local:3.0
```

This approach is faster but requires trusting the published image. The official image is built from the same `build-images/src/Dockerfile`.

### Building Without Docker

To build without Docker, install all build dependencies locally and run `./bootstrap.sh` directly:

- Install all toolchains from the build image (Node.js 24, Rust 1.85.0, Clang 20, CMake, wasi-sdk)
- Run `bootstrap.sh check` to verify your environment
- See `build-images/README.md` for details

Using the build container is strongly recommended to ensure a consistent, tested environment.

## Understanding the Build Process

The build process uses these key files in the repository:

- **`build-images/src/Dockerfile`** - Defines the build container with all compilation tools
- **`bootstrap.sh`** - Main build script that compiles all source code (C++, Rust, TypeScript)
- **`release-image/Dockerfile.base`** - Multi-stage Dockerfile that creates a slim runtime base image
- **`release-image/Dockerfile`** - Final release image with compiled Aztec software
- **`release-image/bootstrap.sh`** - Build script used in CI for Docker images

The official CI pipeline follows a similar process. See `.github/workflows/ci3.yml` for how production images are built and deployed.

## Next Steps

- Use your custom build to [run a full node](./running-a-node.md)
- Set up [monitoring](../monitoring/index.md) for your node
- Review the [CLI reference](../reference/cli-reference.md) for configuration options
- Join the [Aztec Discord](https://discord.gg/aztec) to discuss development and customization
