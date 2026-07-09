#!/usr/bin/env bash
# Idempotent CUDA toolkit (nvcc) install for GPU builds (cmake --preset gpu).
# Intended for the devbox container on a GPU=1 CI instance; the NVIDIA *driver* is a
# host concern (see ci3/bootstrap_ec2), this only provides the compiler/runtime.
set -euo pipefail

CUDA_VERSION=${CUDA_VERSION:-12-6}

if command -v nvcc &>/dev/null || [ -x /usr/local/cuda/bin/nvcc ]; then
  echo "CUDA toolkit already installed: $(PATH=/usr/local/cuda/bin:$PATH nvcc --version | tail -1)"
  exit 0
fi

SUDO=""
if [ "$(id -u)" != 0 ]; then
  SUDO="sudo"
fi

. /etc/os-release
case "$VERSION_ID" in
  22.04) repo=ubuntu2204 ;;
  24.04) repo=ubuntu2404 ;;
  *)
    echo "Unsupported Ubuntu version for CUDA toolkit install: $VERSION_ID" >&2
    exit 1
    ;;
esac

arch=$(uname -m)
keyring=/tmp/cuda-keyring_1.1-1_all.deb
curl -fsSL "https://developer.download.nvidia.com/compute/cuda/repos/$repo/$arch/cuda-keyring_1.1-1_all.deb" -o "$keyring"
$SUDO dpkg -i "$keyring"
rm -f "$keyring"
$SUDO apt-get update -qq
$SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "cuda-toolkit-$CUDA_VERSION"

echo "CUDA toolkit installed: $(/usr/local/cuda/bin/nvcc --version | tail -1)"
echo "nvcc is at /usr/local/cuda/bin/nvcc (the gpu cmake preset sets CUDACXX accordingly)."
