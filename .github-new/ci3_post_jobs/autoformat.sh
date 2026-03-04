#!/usr/bin/env bash
# Post-job: Auto-format code and push fixes when CI fails due to formatting.
# Runs only when SHOULD_AUTOFORMAT=1 (ci-autoformat label present).
# Installs minimal formatting tools on the GH Actions runner and pushes fixes.
#
# This runs on the GH Actions ubuntu-latest runner (not the EC2 build instance),
# so we install tools as needed. The code is already checked out.
#
# Env: SHOULD_AUTOFORMAT, GITHUB_TOKEN, PR_HEAD_REF, PR_NUMBER
set -euo pipefail

if [ "${SHOULD_AUTOFORMAT:-0}" -eq 0 ]; then
  exit 0
fi

if [ -z "${PR_HEAD_REF:-}" ] || [ -z "${PR_NUMBER:-}" ]; then
  echo "Not a PR context, skipping autoformat"
  exit 0
fi

echo "Auto-formatting code..."

# Setup git for pushing
repo=$(git remote get-url origin | sed -E 's|.*github\.com[/:]([^/]+/[^/]+)(\.git)?$|\1|')
git remote set-url origin "https://x-access-token:${GITHUB_TOKEN}@github.com/${repo}"
git config user.name "AztecBot"
git config user.email "tech@aztec-labs.com"

had_changes=0

# ── C++ formatting (barretenberg) ──
echo "=== Formatting C++ (barretenberg) ==="
if ! command -v clang-format-20 &>/dev/null; then
  echo "Installing clang-format-20..."
  # Add LLVM apt repo for clang-format-20
  wget -qO- https://apt.llvm.org/llvm-snapshot.gpg.key | sudo apt-key add - 2>/dev/null
  echo "deb http://apt.llvm.org/$(lsb_release -cs)/ llvm-toolchain-$(lsb_release -cs)-20 main" | \
    sudo tee /etc/apt/sources.list.d/llvm-20.list >/dev/null
  sudo apt-get update -qq && sudo apt-get install -y -qq clang-format-20 2>/dev/null
fi

if command -v clang-format-20 &>/dev/null; then
  (cd barretenberg/cpp && ./format.sh) || echo "Warning: C++ formatting had errors"
  if ! git diff --quiet -- barretenberg/; then
    had_changes=1
    echo "C++ formatting changes detected"
  fi
else
  echo "clang-format-20 installation failed, skipping C++ formatting"
fi

# ── TypeScript formatting (yarn-project) ──
echo "=== Formatting TypeScript (yarn-project) ==="
if [ ! -f yarn-project/node_modules/.bin/prettier ]; then
  echo "Installing prettier..."
  (cd yarn-project && npm install --no-save prettier @trivago/prettier-plugin-sort-imports 2>/dev/null) || true
fi

if [ -f yarn-project/node_modules/.bin/prettier ]; then
  (cd yarn-project && find ./*/src -type f -regex '.*\.\(json\|js\|mjs\|cjs\|ts\)$' | \
    xargs -P4 -n30 ./node_modules/.bin/prettier --log-level warn -w) || echo "Warning: TS formatting had errors"
  if ! git diff --quiet -- yarn-project/; then
    had_changes=1
    echo "TypeScript formatting changes detected"
  fi
else
  echo "prettier installation failed, skipping TypeScript formatting"
fi

# ── Check for changes and push ──
if [ "$had_changes" -eq 0 ]; then
  echo "No formatting changes needed"
  exit 0
fi

# Stage only formatting-relevant files (not node_modules or other artifacts)
git add barretenberg/ yarn-project/ || true
# Double-check we have staged changes
if git diff --cached --quiet; then
  echo "No formatting changes to commit"
  exit 0
fi

git commit -m "chore: autoformat" --no-verify
git push origin "HEAD:refs/heads/${PR_HEAD_REF}"

echo "Autoformat changes pushed to ${PR_HEAD_REF}"
