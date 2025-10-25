#!/usr/bin/env python3
"""Post PR comments about flaky tests detected during CI runs"""
import os
import re
import subprocess
import sys

FLAKE_MARKER = "<!-- CI3_FLAKE_DETECTION_COMMENT -->"

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

def build_comment(flakes):
    """Build markdown comment body from flake list"""
    count = len(flakes)
    tests = "\n".join(flakes)
    return f"""{FLAKE_MARKER}
## Flakey Tests

🤖 says: This CI run detected **{count}** tests that failed, but were tolerated due to a .test_patterns.yml entry.
<details>
<summary>Flaked tests</summary>

```
{tests}
```

</details>
"""

def main():
    if len(sys.argv) < 2:
        print("Usage: post_flake_comment.py <flakes_file>")
        return 1
    flakes_file = sys.argv[1]
    flakes = read_flakes(flakes_file)
    if not flakes:
        print(f"No flaked tests found in {flakes_file}")
        return 0
    print(f"Found {len(flakes)} flaked test(s)")
    if not (pr_number := get_pr_number()):
        print("Not in a PR context or unable to determine PR number. Skipping flake comment.")
        return 0
    comment = build_comment(flakes)
    if post_comment(pr_number, comment):
        print(f"Flake comment posted/updated successfully for PR #{pr_number}")
    else:
        print("Failed to post/update flake comment. This may be due to permissions or rate limits.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
