#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
version="3.0"
arch=$(arch)
branch=${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}

function docker_login {
  if [ -z "$DOCKERHUB_PASSWORD" ]; then
    echo "No DOCKERHUB_PASSWORD provided."
    exit 1
  fi
  echo $DOCKERHUB_PASSWORD | docker login -u aztecprotocolci --password-stdin
}

function build_images {
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

  # Request new instance.
  instance_name=build_image_$(echo -n "$branch" | tr -c 'a-zA-Z0-9-' '_')_$arch
  ip_sir=$(aws_request_instance $instance_name $cpus $arch)
  parts=(${ip_sir//:/ })
  ip="${parts[0]}"
  sir="${parts[1]}"
  iid="${parts[2]}"
  trap 'aws_terminate_instance $iid $sir || true' EXIT

  ssh -F $ci3/aws/build_instance_ssh_config ubuntu@$ip "
    set -euo pipefail
    export DOCKERHUB_PASSWORD=$DOCKERHUB_PASSWORD
    mkdir aztec-packages
    cd aztec-packages
    git init . &>/dev/null
    git remote add origin https://github.com/aztecprotocol/aztec-packages
    git fetch --depth 1 origin $current_commit
    git checkout FETCH_HEAD
    ./build-images/bootstrap.sh || bash
    ./build-images/bootstrap.sh push-images || bash
  "
}

function update_manifest {
  # We update the manifest to point to the latest arch specific images, pushed above.
  local image=aztecprotocol/$target:$version
  # Remove any old local manifest if present.
  docker manifest rm $image || true
  # Create new manifest and push.
  docker manifest create $image \
    --amend aztecprotocol/$target:$version-amd64 \
    --amend aztecprotocol/$target:$version-arm64
  docker manifest push $image
}

function build_all {
  parallel --tag --line-buffer ./bootstrap.sh {} :: ec2-amd64 ec2-arm64
}

case "$cmd" in
  "")
    build_images
    ;;
  "push-images")
    docker_login
    push_images
    ;;
  "ci")
    docker_login
    build_all
    update_manifest
    ;;
  "ec2-amd64")
    docker_login
    build_ec2 128 amd64
    ;;
  "ec2-arm64")
    docker_login
    build_ec2 64 arm64
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
    ;;
esac