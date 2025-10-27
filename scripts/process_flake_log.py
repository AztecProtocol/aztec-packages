#!/usr/bin/env python3
"""Process flake logs: check thresholds and optionally post PR comments"""
import argparse
import os
import re
import subprocess
import sys
import json

FLAKE_MARKER = "<!-- CI3_FLAKE_DETECTION_COMMENT -->"
TEST_PATTERNS_FILE = ".test_patterns.yml"

def run(cmd, input_data=None):
    """Execute command and return (success, stdout, stderr)"""
    if isinstance(cmd, str):
        cmd = cmd.split()
    result = subprocess.run(cmd, input=input_data, capture_output=True, text=True, check=False)
    return result.returncode == 0, result.stdout.strip(), result.stderr.strip()

def get_pr_number():
    """Detect PR number from environment variables"""
    if head_ref := os.getenv("GITHUB_HEAD_REF"):
        ok, out, _ = run(["gh", "pr", "list", "--head", head_ref, "--json", "number", "--jq", ".[0].number"])
        if ok and out and out != "null":
            return out
    if ref_name := os.getenv("REF_NAME"):
        if match := re.match(r"^gh-readonly-queue/.*(pr-(\d+))", ref_name):
            return match.group(2)
        ok, out, _ = run(["gh", "pr", "list", "--head", ref_name, "--json", "number", "--jq", ".[0].number"])
        if ok and out and out != "null":
            return out
    return None

def read_flakes(file_path):
    """Read flake data from file"""
    try:
        with open(file_path, 'r') as f:
            lines = [line.strip() for line in f if line.strip()]
            return lines
    except FileNotFoundError:
        return []

def get_comment_id(pr_number):
    """Find existing flake comment ID on PR"""
    ok, out, _ = run([
        "gh", "api", f"repos/{{owner}}/{{repo}}/issues/{pr_number}/comments",
        "--jq", f'.[] | select(.body | contains("{FLAKE_MARKER}")) | .id'
    ])
    return out.split("\n")[0] if ok and out else None

def post_comment(pr_number, body):
    """Create or update flake comment on PR"""
    if comment_id := get_comment_id(pr_number):
        print(f"Updating comment {comment_id} on PR #{pr_number}")
        ok, _, err = run(["gh", "api", f"repos/{{owner}}/{{repo}}/issues/comments/{comment_id}", "-X", "PATCH", "-f", f"body={body}"])
        if not ok:
            print(f"Update failed: {err}")
        return ok
    print(f"Creating new comment on PR #{pr_number}")
    ok, _, err = run(["gh", "pr", "comment", pr_number, "--body", body])
    if not ok:
        print(f"Creation failed: {err}")
    return ok

def load_flake_groups():
    """Load flake groups configuration from .test_patterns.yml using yq"""
    try:
        ok, out, _ = run(["yq", "e", "-o=json", ".flake_groups", TEST_PATTERNS_FILE])
        if not ok or not out:
            return {}
        groups = json.loads(out)
        if not groups or groups == "null":
            return {}
        # Convert to dict keyed by id
        return {g['id']: g for g in groups}
    except (json.JSONDecodeError, KeyError):
        return {}

def parse_flakes_by_group(flakes):
    """Parse flake lines and group them by flake_group_id"""
    group_pattern = re.compile(r'group:(\S+)')
    groups = {}
    ungrouped = []

    for flake in flakes:
        match = group_pattern.search(flake)
        if match:
            group_id = match.group(1)
            if group_id not in groups:
                groups[group_id] = []
            groups[group_id].append(flake)
        else:
            ungrouped.append(flake)

    return groups, ungrouped

def check_flake_thresholds(flake_groups_config, flakes_by_group):
    """
    Check if any flake group exceeds its error threshold.

    flake_error_threshold: Only use during times of expected instability (eg. pre-release crunch).
    This allows a limited number of flakes before failing the build.
    DO NOT use this without buy-in from the team. It's a last resort, not a standard practice.

    Returns list of exceeded threshold messages.
    """
    exceeded = []

    for group_id, flakes in flakes_by_group.items():
        group_config = flake_groups_config.get(group_id)
        if not group_config:
            continue

        threshold = group_config.get('flake_error_threshold')
        if threshold is None:
            continue

        flake_count = len(flakes)
        if flake_count >= threshold:
            group_name = group_config.get('name', group_id)
            exceeded.append(f"Group '{group_name}' ({group_id}): {flake_count} flakes >= threshold of {threshold}")

    return exceeded

def strip_ansi_colors(text):
    """Strip ANSI color codes from text"""
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    return ansi_escape.sub('', text)

def build_comment(flakes, threshold_exceeded=None):
    """Build markdown comment body from flake list"""
    count = len(flakes)
    # Strip color codes from flakes for clean markdown display
    tests = "\n".join(strip_ansi_colors(flake) for flake in flakes)

    threshold_warning = ""
    if threshold_exceeded:
        threshold_warning = "\n\n⚠️  **FLAKE THRESHOLD EXCEEDED**\n\n" + "\n".join(f"- {msg}" for msg in threshold_exceeded)

    return f"""{FLAKE_MARKER}
## Flakey Tests

🤖 says: This CI run detected **{count}** tests that failed, but were tolerated due to a .test_patterns.yml entry.{threshold_warning}

```
{tests}
```
"""

def main():
    parser = argparse.ArgumentParser(description="Process flake logs and optionally post PR comments")
    parser.add_argument("flakes_file", help="Path to flakes file")
    parser.add_argument("--post-comment", action="store_true", help="Post PR comment (only use in CI)")
    args = parser.parse_args()

    flakes = read_flakes(args.flakes_file)
    if not flakes:
        print(f"No flaked tests found in {args.flakes_file}")
        return 0
    print(f"Found {len(flakes)} flaked test(s)")

    # Load flake group configuration
    flake_groups_config = load_flake_groups()

    # Parse flakes by group
    flakes_by_group, ungrouped = parse_flakes_by_group(flakes)

    # Check thresholds
    threshold_exceeded = check_flake_thresholds(flake_groups_config, flakes_by_group)

    # Post comment if requested
    if args.post_comment:
        if not (pr_number := get_pr_number()):
            print("Not in a PR context or unable to determine PR number. Skipping flake comment.")
        else:
            comment = build_comment(flakes, threshold_exceeded)
            if post_comment(pr_number, comment):
                print(f"Flake comment posted/updated successfully for PR #{pr_number}")
            else:
                print("Failed to post/update flake comment. This may be due to permissions or rate limits.")

    # Fail the build if thresholds exceeded
    if threshold_exceeded:
        print("ERROR: Flake error thresholds exceeded:")
        for msg in threshold_exceeded:
            print(f"  - {msg}")
        return 1

    return 0

if __name__ == "__main__":
    sys.exit(main())
