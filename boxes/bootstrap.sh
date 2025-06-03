#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

export TRANSPILER=$PWD/../avm-transpiler/target/release/avm-transpiler
export BB=$PWD/../barretenberg/cpp/build/bin/bb
export NARGO=$PWD/../noir/noir-repo/target/release/nargo
export AZTEC_NARGO=$PWD/../aztec-nargo/compile_then_postprocess.sh
export AZTEC_BUILDER=$PWD/../yarn-project/builder/aztec-builder-dest

hash=$(hash_str \
  $(../noir/bootstrap.sh hash) \
  $(cache_content_hash \
    .rebuild_patterns \
    ../{avm-transpiler,noir-projects,l1-contracts,yarn-project}/.rebuild_patterns \
    ../barretenberg/*/.rebuild_patterns))

function build {
  echo_header "boxes build"
  npm_install_deps

  if ! cache_download boxes-$hash.tar.gz; then
    denoise 'yarn build'
    cache_upload boxes-$hash.tar.gz boxes/*/{artifacts,dist,src/contracts/target,contracts/target}
  fi
}

function test {
  echo_header "boxes test"
  test_cmds | filter_test_cmds | parallelise
}

function test_cmds {
  for browser in chromium webkit firefox; do
    for box in react vite; do
      echo "$hash:ONLY_TERM_PARENT=1 BOX=$box BROWSER=$browser run_compose_test $box-$browser box boxes"
    done
  done

  # The vanilla app works with deployed contracts configured during the build.
  # To avoid building the app three times, we test it with one sandbox and multiple browsers.
  echo "$hash:ONLY_TERM_PARENT=1 BOX=vanilla BROWSER=* run_compose_test vanilla-all-browsers box boxes"
}

# First argument is a branch name (e.g. master, or the latest version e.g. 1.2.3) to push to the head of.
# Second argument is the tag name (e.g. v1.2.3, or commit-<hash>).
# Third argument is the semver for package.json (e.g. 1.2.3 or 1.2.3-commit.<hash>)
#
#   v1.2.3    commit-123cafebabe
#      |     /
#   v1.2.2  commit-123deadbeef
#      |   /
#   v1.2.1
#
function release_git_push {
  local branch_name=$1
  local tag_name=$2
  local version=$3
  local mirrored_repo_url="https://github.com/AztecProtocol/l1-contracts.git"

  cd boxes/vanilla
  rm -rf release-out && mkdir release-out
  git archive HEAD | tar -x -C release-out
  cd release-out

  $root/ci3/npm/release_prep_package_json $version

  # CI needs to authenticate from GITHUB_TOKEN.
  gh auth setup-git &>/dev/null || true

  git init &>/dev/null
  git remote add origin "$mirrored_repo_url" &>/dev/null
  git fetch origin --quiet

  # Checkout the existing branch or create it if it doesn't exist.
  if git ls-remote --heads origin "$branch_name" | grep -q "$branch_name"; then
    # Update branch reference without checkout.
    git branch -f "$branch_name" origin/"$branch_name"
    # Point HEAD to the branch.
    git symbolic-ref HEAD refs/heads/"$branch_name"
    # Move to latest commit, keep working tree.
    git reset --soft origin/"$branch_name"
  else
    git checkout -b "$branch_name"
  fi

  if git rev-parse "$tag_name" >/dev/null 2>&1; then
    echo "Tag $tag_name already exists. Skipping release."
  else
    git add .
    git commit -m "Release $tag_name." >/dev/null
    git tag -a "$tag_name" -m "Release $tag_name."
    do_or_dryrun git push origin "$branch_name" --quiet
    do_or_dryrun git push origin --quiet --force "$tag_name" --tags

    echo "Release complete ($tag_name) on branch $branch_name."
  fi
}

function release {
  echo_header "boxes release"
  local branch=$(dist_tag)
  if [ $branch = latest ]; then
    branch=master
  fi
  release_git_push $branch $REF_NAME ${REF_NAME#v}
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  "ci")
    build
    test
    ;;
  ""|"fast"|"full")
    build
    ;;
  test|test_cmds|release)
    $cmd
    ;;
  "hash")
    echo $hash
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
