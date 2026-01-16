#!/usr/bin/env python3
"""Find issues referenced in merged PRs that were never auto-closed.

This script scans merge-train commits to find PRs that reference issues
using keywords like "Closes #123", then checks which of those issues are
still open and would benefit from being closed.
"""

import subprocess
import sys
import re
import json
from collections import defaultdict
import argparse

def run_command(cmd):
    """Run a command and return its output."""
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return result.stdout.strip()
    except subprocess.CalledProcessError:
        return ""

def run_gh_api(endpoint):
    """Run gh api command."""
    try:
        result = subprocess.run(
            ["gh", "api", endpoint],
            capture_output=True,
            text=True,
            check=True
        )
        return json.loads(result.stdout)
    except (subprocess.CalledProcessError, json.JSONDecodeError):
        return None

def get_merge_train_commits(branch="next", since="10 years ago"):
    """Get all merge-train commits."""
    cmd = ["git", "log", "--merges", f"--since={since}", "--pretty=format:%H|%s", branch]
    output = run_command(cmd)

    if not output:
        return []

    commits = []
    for line in output.split('\n'):
        if not line:
            continue

        sha, subject = line.split('|', 1)

        # Only process merge-train commits
        if 'merge-train/' not in subject or '#' not in subject:
            continue

        commits.append((sha, subject))

    return commits

def get_train_prs(commit_sha):
    """Get PRs from a merge-train commit by examining the train commits."""
    # Get first parent
    first_parent = run_command(["git", "rev-parse", f"{commit_sha}^1"])
    if not first_parent:
        return []

    # Get commits in the train
    train_commits = run_command(["git", "rev-list", "--reverse", f"{first_parent}..{commit_sha}^2"])
    if not train_commits:
        return []

    prs = []
    for train_commit in train_commits.split('\n'):
        if not train_commit:
            continue

        # Get commit message
        message = run_command(["git", "log", "--format=%s", "-n1", train_commit])

        # Skip merge commits without PR numbers
        if message.startswith('Merge branch') and '#' not in message:
            continue

        # Extract PR number
        match = re.search(r'#(\d+)', message)
        if match:
            prs.append(int(match.group(1)))

    return prs

def extract_issue_refs(text):
    """Extract issue references from text like 'Closes #123' or 'Fixes owner/repo#456' or URL format."""
    if not text:
        return []

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

def main():
    parser = argparse.ArgumentParser(
        description="Find issues referenced in merged PRs that are still open"
    )
    parser.add_argument(
        '--since',
        default='10 years ago',
        help='Only process commits since this date (default: 10 years ago)'
    )
    parser.add_argument(
        '--repo',
        default='AztecProtocol/aztec-packages',
        help='Repository in format owner/repo (default: AztecProtocol/aztec-packages)'
    )

    args = parser.parse_args()

    print(f"Scanning merge-train commits since {args.since}...")
    commits = get_merge_train_commits(since=args.since)
    print(f"Found {len(commits)} merge-train commits")
    print()

    print("Extracting PRs from merge-trains...")
    all_prs = set()
    for sha, subject in commits:
        prs = get_train_prs(sha)
        all_prs.update(prs)

    print(f"Found {len(all_prs)} unique PRs in merge-trains")
    print()

    print(f"Checking PRs for issue references...")

    issue_to_prs = defaultdict(list)
    checked = 0

    for pr_num in sorted(all_prs):
        checked += 1
        if checked % 50 == 0:
            print(f"  Checked {checked}/{len(all_prs)} PRs...", file=sys.stderr)

        pr_data = run_gh_api(f"repos/{args.repo}/pulls/{pr_num}")

        if not pr_data:
            continue

        title = pr_data.get('title', '')
        body = pr_data.get('body', '') or ''

        combined = f"{title}\n{body}"
        refs = extract_issue_refs(combined)

        if refs:
            for issue in refs:
                issue_to_prs[issue].append((pr_num, title))

    if not issue_to_prs:
        print("No issues found!")
        return

    print()
    print("Checking issue status...")
    print()

    open_issues = []
    closed_issues = []
    not_found = []

    for issue in sorted(issue_to_prs.keys(), key=int):
        issue_data = run_gh_api(f"repos/{args.repo}/issues/{issue}")

        if not issue_data:
            not_found.append(issue)
            continue

        state = issue_data.get('state')
        issue_title = issue_data.get('title', '')

        if state == 'open':
            open_issues.append((issue, issue_title, issue_to_prs[issue]))
        else:
            closed_issues.append((issue, issue_title, issue_to_prs[issue]))

    print("="*70)
    print("ORPHANED ISSUES (still open, should have been auto-closed)")
    print("="*70)
    if open_issues:
        for issue, issue_title, prs in open_issues:
            print(f"\n#{issue}: {issue_title}")
            for pr_num, pr_title in prs:
                print(f"  ← PR #{pr_num}: {pr_title}")
    else:
        print("None found!")

    print()
    print("="*70)
    print("SUMMARY")
    print("="*70)
    print(f"Total issues referenced: {len(issue_to_prs)}")
    print(f"  Open (orphaned): {len(open_issues)}")
    print(f"  Already closed: {len(closed_issues)}")
    print(f"  Not found: {len(not_found)}")
    print()

    if open_issues:
        print("To close these issues, run:")
        print()
        for issue, _, _ in open_issues:
            print(f"  gh issue close {issue} --comment 'Auto-closed from merged PR'")
        print()

if __name__ == "__main__":
    main()
