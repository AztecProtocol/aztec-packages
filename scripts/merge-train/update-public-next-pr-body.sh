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

function append_pr_section {
  local pr_number="$1"
  local pr_json="$2"
  local title url base_ref head_ref merged_at merge_sha

  title=$(jq -r '.title' <<<"$pr_json")
  url=$(jq -r '.url' <<<"$pr_json")
  base_ref=$(jq -r '.baseRefName' <<<"$pr_json")
  head_ref=$(jq -r '.headRefName' <<<"$pr_json")
  merged_at=$(jq -r '.mergedAt // "not merged"' <<<"$pr_json")
  merge_sha=$(jq -r '.mergeCommit.oid // empty' <<<"$pr_json")

  {
    echo "- [#${pr_number}: ${title}](${url})"
    echo "  - ${head_ref} -> ${base_ref}; merged: ${merged_at}"
    if [[ -n "$merge_sha" ]]; then
      echo "  - merge commit: \`${merge_sha:0:10}\`"
    fi
    echo "  - commits:"
  } >>"$body_file"

  gh api "repos/{owner}/{repo}/pulls/${pr_number}/commits" \
    --jq '.[] | "    - `\(.sha[0:10])` \(.commit.message | split("\n")[0])"' >>"$body_file"
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
  echo "BEGIN_COMMIT_OVERRIDE"
  echo "## Private PRs included in \`${HEAD_BRANCH}\`"
  echo
  echo "Generated from first-parent history for \`${BASE_BRANCH}..${HEAD_BRANCH}\`."
  echo
  echo "- Base: \`${BASE_BRANCH}\` @ \`${base_sha:0:10}\`"
  echo "- Head: \`${HEAD_BRANCH}\` @ \`${head_sha:0:10}\`"
  echo "- Holding PR: ${pr_url}"
  echo
} >"$body_file"

declare -A seen_prs=()
declare -a unresolved=()

while IFS=$'\t' read -r sha subject; do
  [[ -n "$sha" ]] || continue

  pr_candidate=$(pr_for_commit "$sha" "$subject")
  if [[ -z "$pr_candidate" ]]; then
    case "$subject" in
      "chore: merge upstream next"*) ;;
      "Merge branch 'next' into "*) ;;
      *) unresolved+=("${sha:0:10} ${subject}") ;;
    esac
    continue
  fi

  if [[ -n "${seen_prs[$pr_candidate]:-}" ]]; then
    continue
  fi

  pr_json=$(gh pr view "$pr_candidate" \
    --json number,title,url,baseRefName,headRefName,mergedAt,mergeCommit,state \
    --jq '.')

  if [[ "$(jq -r '.state' <<<"$pr_json")" != "MERGED" ]]; then
    unresolved+=("${sha:0:10} ${subject} (associated PR #${pr_candidate} is not merged)")
    continue
  fi

  seen_prs[$pr_candidate]=1
  append_pr_section "$pr_candidate" "$pr_json"
done < <(git log --first-parent --reverse --pretty=format:'%H%x09%s' "${base_ref}..${head_ref}")

if [[ "${#seen_prs[@]}" -eq 0 ]]; then
  echo "*No merged private PRs found in the compare range.*" >>"$body_file"
fi

if [[ "${#unresolved[@]}" -gt 0 ]]; then
  {
    echo
    echo "## Unresolved first-parent commits"
    echo
    printf -- "- \`%s\`\n" "${unresolved[@]}"
  } >>"$body_file"
fi

echo "END_COMMIT_OVERRIDE" >>"$body_file"

payload_file=$(mktemp)
jq -n --rawfile body "$body_file" '{ body: $body }' >"$payload_file"
gh api --method PATCH "repos/{owner}/{repo}/issues/${pr_number}" --input "$payload_file" >/dev/null
echo "Updated PR #${pr_number} body from ${BASE_BRANCH}..${HEAD_BRANCH}"
