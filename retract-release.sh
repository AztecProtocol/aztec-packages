#!/usr/bin/env bash
# Retracts a release. Deletes all artifacts for REF_NAME except npm packages.
# npm packages cannot be deleted after 72h (npmjs policy).
# Skipped: barretenberg/ts, noir (JS packages), yarn-project
#
# Usage:
#   REF_NAME=v1.2.3 ./retract-release.sh
#   REF_NAME=v1.2.3 DRY_RUN=1 ./retract-release.sh
set -euo pipefail
source $(git rev-parse --show-toplevel)/ci3/source

if [ -z "${REF_NAME:-}" ]; then
  echo "Usage: REF_NAME=v1.2.3 $0"
  exit 1
fi

echo_header "retract $REF_NAME"

# --- GitHub release + monorepo git tag ---
echo_header "github release"
if gh release view "$REF_NAME" &>/dev/null; then
  do_or_dryrun gh release delete "$REF_NAME" --yes --cleanup-tag
  [ "${DRY_RUN:-0}" = 0 ] && echo "Deleted GitHub release $REF_NAME."
else
  echo "No GitHub release for $REF_NAME, skipping."
fi

# --- Mirror git tags ---
echo_header "mirror git tags"
retract_git_tag "$REF_NAME" "https://github.com/AztecProtocol/l1-contracts.git"          "l1-contracts"
retract_git_tag "$REF_NAME" "https://github.com/AztecProtocol/aztec-nr.git"              "aztec-nr"
retract_git_tag "$REF_NAME" "https://github.com/AztecProtocol/aztec-starter-vanilla.git" "aztec-starter-vanilla"

# --- aztec-up S3 ---
echo_header "aztec-up S3"
version=${REF_NAME#v}
do_or_dryrun aws s3 rm "s3://install.aztec.network/$version/install"
do_or_dryrun aws s3 rm "s3://install.aztec.network/$version/versions"
do_or_dryrun aws s3 rm "s3://install.aztec.network/$version/aztec-install"
do_or_dryrun aws s3 rm "s3://install.aztec.network/$version/aztec-up"

current_alias=$(aws s3 cp "s3://install.aztec.network/aliases/$(dist_tag)" - 2>/dev/null || true)
if [ "$current_alias" = "$version" ]; then
  do_or_dryrun aws s3 rm "s3://install.aztec.network/aliases/$(dist_tag)"
  [ "${DRY_RUN:-0}" = 0 ] && echo "Removed alias $(dist_tag) -> $version."
else
  echo "Alias $(dist_tag) points to '$current_alias' (not '$version'), skipping."
fi

# --- playground S3 ---
echo_header "playground S3"
do_or_dryrun aws s3 rm --recursive "s3://play.aztec.network/$REF_NAME"

dtag=$(dist_tag)
current_playground_version=$(aws s3 cp "s3://play.aztec.network/$dtag/_version" - 2>/dev/null || true)
if [ "$current_playground_version" = "$REF_NAME" ]; then
  do_or_dryrun aws s3 rm --recursive "s3://play.aztec.network/$dtag"
  [ "${DRY_RUN:-0}" = 0 ] && echo "Removed playground dist_tag path $dtag."
else
  echo "Playground dist_tag $dtag points to '$current_playground_version' (not '$REF_NAME'), skipping."
fi

cf_id=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Aliases.Items && contains(Aliases.Items, 'play.aztec-labs.com')].Id | [0]" \
  --output text)
do_or_dryrun aws cloudfront create-invalidation --distribution-id "$cf_id" --paths "/*"

# --- DockerHub images ---
echo_header "DockerHub images"
if [ -z "${DOCKERHUB_PASSWORD:-}" ]; then
  echo "Warning: DOCKERHUB_PASSWORD not set, skipping DockerHub retract."
else
  tag=${REF_NAME#v}
  if [ "${DRY_RUN:-0}" = 0 ]; then
    hub_token=$(jq -rn --arg user "${DOCKERHUB_USERNAME:-aztecprotocolci}" --arg pass "$DOCKERHUB_PASSWORD" \
      '{"username":$user,"password":$pass}' \
      | curl -s -X POST "https://hub.docker.com/v2/users/login/" \
          -H "Content-Type: application/json" -d @- \
      | jq -r .token)

    if [ -z "$hub_token" ] || [ "$hub_token" = "null" ]; then
      echo "Error: DockerHub login failed."
      exit 1
    fi

    for image in aztec aztec-prover-agent; do
      for full_tag in "$tag-amd64" "$tag-arm64" "$tag"; do
        status=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
          "https://hub.docker.com/v2/repositories/aztecprotocol/$image/tags/$full_tag/" \
          -H "Authorization: JWT $hub_token")
        if [ "$status" = "204" ]; then
          echo "Deleted aztecprotocol/$image:$full_tag from DockerHub."
        else
          echo "Warning: Could not delete aztecprotocol/$image:$full_tag (HTTP $status), may not exist."
        fi
      done
    done
  else
    for image in aztec aztec-prover-agent; do
      for full_tag in "$tag-amd64" "$tag-arm64" "$tag"; do
        echo "DRY: DELETE https://hub.docker.com/v2/repositories/aztecprotocol/$image/tags/$full_tag/"
      done
    done
  fi
fi

echo_header "retract $REF_NAME complete"
