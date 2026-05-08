#!/usr/bin/env bash

set -euo pipefail

BASE_BRANCH="${BASE_BRANCH:-public-next}"
HEAD_BRANCH="${HEAD_BRANCH:-next}"
REMOTE="${REMOTE:-origin}"

function require_command {
  local command="$1"
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing required command: $command" >&2
    exit 1
  fi
}

function pr_for_commit {
  local _sha="$1"
  local subject="$2"

  if [[ "$subject" =~ Merge[[:space:]]pull[[:space:]]request[[:space:]]#([0-9]+) ]]; then
    echo "${BASH_REMATCH[1]}"
    return
  fi

  if [[ "$subject" =~ \(\#([0-9]+)\)$ ]]; then
    echo "${BASH_REMATCH[1]}"
  fi
}

function append_pr_line {
  local pr_number="$1"
  local pr_json="$2"
  local title url

  title=$(jq -r '.title' <<<"$pr_json")
  url=$(jq -r '.url' <<<"$pr_json")

  echo "- [#${pr_number}: ${title}](${url})" >>"$body_file"
}

require_command git
require_command gh
require_command jq

git fetch "$REMOTE" "$BASE_BRANCH" "$HEAD_BRANCH" --no-tags

base_ref="${REMOTE}/${BASE_BRANCH}"
head_ref="${REMOTE}/${HEAD_BRANCH}"
base_sha=$(git rev-parse "$base_ref")
head_sha=$(git rev-parse "$head_ref")

pr_info=$(gh pr list \
  --state open \
  --base "$BASE_BRANCH" \
  --head "$HEAD_BRANCH" \
  --json number,url \
  --jq '.[0] // empty')

if [[ -z "$pr_info" ]]; then
  echo "No open PR found for ${HEAD_BRANCH} -> ${BASE_BRANCH}; skipping"
  exit 0
fi

pr_number=$(jq -r '.number' <<<"$pr_info")
pr_url=$(jq -r '.url' <<<"$pr_info")

body_file=$(mktemp)
payload_file=""
trap 'rm -f "$body_file" "$payload_file"' EXIT

{
  echo "## Private PRs in \`${BASE_BRANCH}..${HEAD_BRANCH}\`"
  echo
  echo "_${base_sha:0:10}..${head_sha:0:10}_"
  echo
} >"$body_file"

declare -A seen_prs=()

while read -r pr_candidate; do
  [[ -n "$pr_candidate" ]] || continue

  [[ -z "${seen_prs[$pr_candidate]:-}" ]] || continue

  pr_json=$(gh pr view "$pr_candidate" \
    --json number,title,url,state \
    --jq '.' 2>/dev/null || true)

  if [[ -z "$pr_json" || "$(jq -r '.state' <<<"$pr_json")" != "MERGED" ]]; then
    continue
  fi

  seen_prs[$pr_candidate]=1
  append_pr_line "$pr_candidate" "$pr_json"
done < <(
  git log --reverse --pretty=format:'%s' "${base_ref}..${head_ref}" |
    grep -Eo 'Merge pull request #[0-9]+|\(#[0-9]+\)' |
    grep -Eo '[0-9]+'
)

if [[ "${#seen_prs[@]}" -eq 0 ]]; then
  echo "*No merged private PRs found in the compare range.*" >>"$body_file"
fi

payload_file=$(mktemp)
jq -n --rawfile body "$body_file" '{ body: $body }' >"$payload_file"
gh api --method PATCH "repos/{owner}/{repo}/issues/${pr_number}" --input "$payload_file" >/dev/null
echo "Updated PR #${pr_number} body from ${BASE_BRANCH}..${HEAD_BRANCH}"
