#!/usr/bin/env bash
# Handles automatic VK regeneration when CI fails and the author has acknowledged
# the VK change via a VK-UPDATE commit message.
#
# Flow:
# 1. CI fails (potentially due to VK staleness)
# 2. This step checks if any commit in the PR contains "VK-UPDATE: <explanation>"
# 3. If found, regenerates VKs, commits the update, and pushes
# 4. The subsequent CI run should pass with updated VKs
#
# If no VK-UPDATE commit is found, this step is a no-op (the CI failure stands).
set -euo pipefail

NO_CD=1 source $(git rev-parse --show-toplevel)/ci3/source

function main {
  echo_header "VK Update Check"

  # Scan PR commit messages for VK-UPDATE acknowledgment.
  local vk_update_message
  vk_update_message=$(git log --format=%B -n "${PR_COMMITS:-50}" HEAD | grep -m1 "^VK-UPDATE:" || true)

  if [ -z "$vk_update_message" ]; then
    echo "No VK-UPDATE commit found. If VKs need updating, add a commit with:"
    echo '  git commit --allow-empty -m "VK-UPDATE: <explanation of why VKs changed>"'
    echo "CI failure stands."
    return
  fi

  local explanation="${vk_update_message#VK-UPDATE:}"
  explanation="${explanation# }" # trim leading space

  if [ -z "$explanation" ]; then
    echo "Found VK-UPDATE commit but no explanation provided."
    echo "Please include an explanation:"
    echo '  git commit --allow-empty -m "VK-UPDATE: changed public inputs in rollup circuit"'
    echo "CI failure stands."
    return
  fi

  echo "Found VK-UPDATE acknowledgment: $explanation"
  echo "Proceeding with VK regeneration..."

  local github_repository
  github_repository=$(git remote get-url origin | sed -E 's|.*github\.com[/:]([^/]+/[^/]+)(\.git)?$|\1|')

  # Reauth the git repo with our GITHUB_TOKEN
  git remote set-url origin "https://x-access-token:${GITHUB_TOKEN}@github.com/${github_repository}"

  # Generate fresh IVC inputs, upload to S3, and verify VKs
  # Run from barretenberg/cpp in a subshell so script_path resolves correctly
  (cd barretenberg/cpp && scripts/test_chonk_standalone_vks_havent_changed.sh --update_inputs)

  # Commit and push the updated pinned hash
  git add barretenberg/cpp/scripts/test_chonk_standalone_vks_havent_changed.sh
  git commit -m "chore: regenerate chonk VKs

VK-UPDATE acknowledged: ${explanation}"
  git push origin HEAD

  echo "VK update completed. A new CI run will be triggered."
}

main
