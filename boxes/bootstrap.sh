#!/bin/bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

export TRANSPILER=$PWD/../avm-transpiler/target/release/avm-transpiler
export BB=$PWD/../barretenberg/cpp/build/bin/bb
export NARGO=$PWD/../noir/noir-repo/target/release/nargo
export AZTEC_NARGO=$PWD/../aztec-nargo/compile_then_postprocess.sh
export AZTEC_BUILDER=$PWD/../yarn-project/builder/aztec-builder-dest

hash=$(cache_content_hash \
  .rebuild_patterns \
  ../noir/.rebuild_patterns \
  ../{avm-transpiler,noir-projects,l1-contracts,yarn-project}/.rebuild_patterns \
  ../barretenberg/*/.rebuild_patterns)

function build {
  echo_header "boxes build"
  denoise yarn

  if ! cache_download boxes-$hash.tar.gz; then
    denoise 'yarn build'
    cache_upload boxes-$hash.tar.gz boxes/*/{artifacts,dist,src/contracts/target}
  fi
}

function test {
  echo_header "boxes test"
  test_cmds | parallelise
}

function test_cmds {
  for browser in chromium webkit; do
    for box in vanilla react vite; do
      echo "$hash boxes/scripts/run_test.sh $box $browser"
    done
  done
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
  local mirrored_repo_url="git@github.com:AztecProtocol/aztec-starter-vanilla.git"

  cd boxes/vanilla
  rm -rf release-out && mkdir release-out
  git archive HEAD | tar -x -C release-out
  cd release-out

  # Update the package version in package.json.
  tmp=$(mktemp)
  jq --arg v $version '.version = $v' package.json >$tmp && mv $tmp package.json

  # Update each dependent @aztec package version in package.json.
  for pkg in $(jq --raw-output "(.dependencies // {}) | keys[] | select(contains(\"@aztec/\"))" package.json); do
    jq --arg v $version ".dependencies[\"$pkg\"] = \$v" package.json >$tmp && mv $tmp package.json
  done

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

  git add .
  git commit -m "Release $tag_name." >/dev/null
  git tag -a "$tag_name" -m "Release $tag_name."
  git push origin "$branch_name" --quiet
  git push origin --quiet --force "$tag_name" --tags

  echo "Release complete ($tag_name) on branch $branch_name."
}

function release {
  echo_header "boxes release"
  local branch=$(dist_tag)
  if [ $branch = latest ]; then
    branch=master
  fi
  release_git_push $branch $REF_NAME ${REF_NAME#v}
}

function release_commit {
  echo_header "boxes release commit"
  release_git_push "$CURRENT_VERSION" "commit-$COMMIT_HASH" "$CURRENT_VERSION-commit.$COMMIT_HASH"
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
  test|test_cmds|release|release_commit)
    $cmd
    ;;
  "hash")
    echo $hash
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
