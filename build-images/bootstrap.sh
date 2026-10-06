#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

version="3.1"
arch=$(arch)
branch=${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}

function check_login {
  if [ -z "${DOCKERHUB_PASSWORD:-}" ]; then
    echo "No DOCKERHUB_PASSWORD provided."
    exit 1
  fi
}

function docker_login {
  check_login
  echo $DOCKERHUB_PASSWORD | docker login -u aztecprotocolci --password-stdin
}

function build_images {
  cd src
  for target in build devbox sysbox; do
    docker build -t aztecprotocol/$target:$version-$arch --target $target .
  done
}

function push_images {
  for target in build devbox sysbox; do
    docker push aztecprotocol/$target:$version-$arch
  done
}

function build_ec2 {
  set -euo pipefail
  local cpus=$1
  local arch=$2

  # Verify that the local latest commit has been pushed.
  current_commit=$(git rev-parse HEAD)
  if [[ "$(git fetch origin --negotiate-only --negotiation-tip=$current_commit)" != *"$current_commit"* ]]; then
    echo "Commit $current_commit is not pushed, exiting."
    exit 1
  fi

  # Request new on-demand instance. The helper writes ip/iid into the state dir and the terminate
  # helper takes that same dir. SSH mode (KEY_NAME set) so we can drive the build over ssh.
  instance_name=build_image_$(echo -n "$branch" | tr -c 'a-zA-Z0-9-' '_')_$arch
  local state_dir=$(mktemp -d /tmp/aws_request_instance.XXXXXX)
  trap 'aws_terminate_instance $state_dir || true' EXIT
  NO_SPOT=1 KEY_NAME=${KEY_NAME:-build-instance} aws_request_instance $instance_name $cpus $arch $state_dir
  local ip=$(cat $state_dir/ip)

  ssh -F $ci3/aws/build_instance_ssh_config ubuntu@$ip "
    set -euo pipefail
    export DOCKERHUB_PASSWORD=$DOCKERHUB_PASSWORD
    mkdir aztec-packages
    cd aztec-packages
    git init . &>/dev/null
    git remote add origin https://github.com/aztecprotocol/aztec-packages
    git fetch --depth 1 origin $current_commit
    git checkout FETCH_HEAD
    ./build-images/bootstrap.sh
    ./build-images/bootstrap.sh push-images
  "
}

function update_manifests {
  for target in build devbox sysbox; do
    # We update the manifest to point to the latest arch specific images, pushed above.
    local image=aztecprotocol/$target:$version
    # Remove any old local manifest if present.
    docker manifest rm $image || true
    # Create new manifest and push.
    docker manifest create $image \
      --amend aztecprotocol/$target:$version-amd64 \
      --amend aztecprotocol/$target:$version-arm64
    docker manifest push $image
  done
}

function build_all {
  parallel --tag --line-buffer ./bootstrap.sh {} ::: ec2-amd64 ec2-arm64
}

function update_amis {
  parallel --tag --line-buffer ARCH={} $ci3/aws/ami_update.sh ::: amd64 arm64
}

case "$cmd" in
  "")
    build_images
    ;;
  "push-images")
    docker_login
    push_images
    ;;
  "push-manifests")
    docker_login
    update_manifests
    ;;
  "ec2-amd64")
    check_login
    build_ec2 128 amd64
    ;;
  "ec2-arm64")
    check_login
    build_ec2 64 arm64
    ;;
  "deploy")
    git diff --quiet && git diff --cached --quiet || { echo "Uncommitted changes detected. Please commit or stash them before deploying."; exit 1; }
    docker_login
    build_all
    update_manifests
    update_amis
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
