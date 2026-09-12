#!/usr/bin/env bash
set -euo pipefail

if python3 -c 'import sys; assert sys.version_info >= (3, 14); from compression import zstd' &>/dev/null; then
  exit 0
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
case "$(uname -m)" in
  x86_64|aarch64) platform="$(uname -m)-unknown-linux-gnu" ;;
  *) echo "Unsupported Python install platform: $(uname -m)" >&2; exit 1 ;;
esac
curl -fsSL "https://github.com/astral-sh/uv/releases/download/0.12.13/uv-$platform.tar.gz" | tar -xz -C "$work"
UV_PYTHON_INSTALL_DIR=/opt/ci3-python UV_PYTHON_BIN_DIR=/usr/local/bin \
  "$work/uv-$platform/uv" python install 3.14
# Leave /usr/bin/python3 available for Ubuntu's own packages and tools.
ln -sf /usr/local/bin/python3.14 /usr/local/bin/python3
hash -r
python3 -c 'from compression import zstd'
