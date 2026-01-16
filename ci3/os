#!/usr/bin/env bash
set -e
case "$(uname -s)" in
  Linux) echo linux ;;
  Darwin) echo macos ;;
  *) echo "Unsupported OS: $(uname -s). Only linux and macos are supported." >&2; exit 1 ;;
esac
