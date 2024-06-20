#!/usr/bin/env bash
set -eu

if [ command -v cargo-binstall  &> /dev/null ]; then
  cargo-binstall cargo-binstall -y
else;
  curl -L --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh | bash
fi

