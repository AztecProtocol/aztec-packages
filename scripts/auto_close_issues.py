#!/usr/bin/env python3
"""Auto-close issues referenced in merged PRs.

When PRs target intermediate branches (like merge-train), GitHub's native
auto-close doesn't work. This script processes new commits and closes any
issues referenced in merged PRs.
"""

import os
import re
import subprocess
import sys
import json


def run(cmd):
    """Run command and return output, or empty string on error."""
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return result.stdout.strip()
    except subprocess.CalledProcessError:
        return ""


def gh_api(endpoint):
    """Call GitHub API and return JSON, or None on error."""
    try:
        output = run(["gh", "api", endpoint])
        return json.loads(output) if output else None
    except json.JSONDecodeError:
        return None


def parse_issue_ref(repo, issue_ref):
    """Parse issue reference into (target_repo, issue_num)."""
    if '#' in issue_ref and '/' in issue_ref:
        # Cross-repo: owner/repo#123
        target_repo, issue_num = issue_ref.rsplit('#', 1)
    else:
        # Same-repo: 123
        target_repo, issue_num = repo, issue_ref
    return target_repo, issue_num


def extract_issue_refs(text):
    """Extract issue references from text like 'Closes #123' or 'Fixes owner/repo#456'."""
    issues = []
    cross_repo_refs = []

    # First, extract all URL-based references (these work with or without keywords)
    for owner, repo, num in re.findall(r'https?://github\.com/([a-zA-Z0-9_-]+)/([a-zA-Z0-9_-]+)/issues/(\d+)', text):
        cross_repo_refs.append(num)
        issues.append(f"{owner}/{repo}#{num}")

    # Then extract keyword-based references
    for line in text.split('\n'):
        if re.search(r'\b(close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b', line, re.IGNORECASE):
            # Cross-repo: owner/repo#123
            for owner_repo, num in re.findall(r'([a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+)#(\d+)', line):
                cross_repo_refs.append(num)
                issues.append(f"{owner_repo}#{num}")

            # Same-repo: #123 (skip if already captured as cross-repo or URL)
            for num in re.findall(r'#(\d+)', line):
                if num not in cross_repo_refs:
                    issues.append(num)

    return list(set(issues))


def close_issue(repo, issue_ref, pr_number, pr_title, dry_run=False):
    """Close issue if it's open."""
    target_repo, issue_num = parse_issue_ref(repo, issue_ref)

    # Check if issue is open
    issue_data = gh_api(f"repos/{target_repo}/issues/{issue_num}")
    if not issue_data:
        return False

    state = issue_data.get('state')
    if state == 'closed':
        print(f"Already closed: {target_repo}#{issue_num} (from PR #{pr_number}: {pr_title})")
        return False

    if state != 'open':
        return False

    if dry_run:
        print(f"Would close {target_repo}#{issue_num} (from PR #{pr_number}: {pr_title})")
        return True

    # Close the issue
    run_url = ""
    if os.environ.get('GITHUB_RUN_ID'):
        server_url = os.environ.get('GITHUB_SERVER_URL', 'https://github.com')
        run_url = f"\n\n[View workflow run]({server_url}/{repo}/actions/runs/{os.environ['GITHUB_RUN_ID']})"

    comment = f"This issue was automatically closed because it was referenced in {'PR' if target_repo == repo else f'{repo} PR'} #{pr_number} which has been merged to the default branch.{run_url}"

    result = run(["gh", "issue", "close", issue_num, "--repo", target_repo, "--comment", comment])
    if result or result == "":  # gh issue close may return empty on success
        print(f"Closed {target_repo}#{issue_num} (from PR #{pr_number}: {pr_title})")
        return True

    print(f"Warning: Failed to close {target_repo}#{issue_num}", file=sys.stderr)
    return False


def process_commit(commit_sha, repo, dry_run=False):
    """Process a commit and close any referenced issues."""
    # Get all PR numbers from commit message
    message = run(["git", "log", "-1", "--pretty=%B", commit_sha])
    pr_numbers = re.findall(r'#(\d+)', message)

    for pr_number in pr_numbers:
        # Get PR data
        pr_data = gh_api(f"repos/{repo}/pulls/{pr_number}")
        if not pr_data or not pr_data.get('merged'):
            continue

        # Find issue references in PR
        text = f"{pr_data.get('title', '')}\n{pr_data.get('body', '') or ''}"
        issue_refs = extract_issue_refs(text)

        # Close each issue
        for issue_ref in issue_refs:
            close_issue(repo, issue_ref, pr_number, pr_data['title'], dry_run)


def main():
    if len(sys.argv) < 2:
        print("Usage: auto_close_issues.py <before_sha> <after_sha>", file=sys.stderr)
        print("   or: auto_close_issues.py <commit_sha>", file=sys.stderr)
        sys.exit(1)

    repo = os.environ.get('GITHUB_REPOSITORY', 'AztecProtocol/aztec-packages')
    dry_run = os.environ.get('DRY_RUN', '0') == '1'

    # Get commits to process
    if len(sys.argv) == 3:
        before, after = sys.argv[1], sys.argv[2]
        if before == '0000000000000000000000000000000000000000':
            commits = [after]
        else:
            commits = [c for c in run(["git", "rev-list", f"{before}..{after}"]).split('\n') if c]
    else:
        commits = [sys.argv[1]]

    # Process each commit
    for commit in commits:
        process_commit(commit, repo, dry_run)


if __name__ == '__main__':
    main()
