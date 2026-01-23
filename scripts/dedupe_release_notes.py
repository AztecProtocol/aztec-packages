#!/usr/bin/env python3
"""
Script to deduplicate release notes by:
1. Removing exact duplicate lines
2. Removing entries without PR when there's a PR entry with the same description
3. Removing entries with the same description + PR number (keeps first occurrence)
4. Removing commit-only entries with the same description (keeps first occurrence)

Example of type 1 (exact duplicates):
  * Fix bug in parser ([#16667](...)) ([a2e7a4d](...))
  * Fix bug in parser ([#16667](...)) ([a2e7a4d](...))  <- removed

Example of type 2 (no PR when PR exists):
  * Slash lists, store expiration, veto checks  <- removed (no PR, no commit)
  * Slash lists, store expiration, veto checks ([c5fa2d3](...))  <- removed (commit only)
  * Slash lists, store expiration, veto checks ([#16667](...)) ([a2e7a4d](...))

Example of type 3 (same PR, different commits):
  * wasm fix ([#16751](...)) ([c29739c](...))
  * wasm fix ([#16751](...)) ([57954e3](...))  <- removed
  * wasm fix ([#16751](...)) ([683aca6](...))  <- removed

Example of type 4 (merge-train duplicates - same description, no PR):
  * use assert_ssa_does_not_change throughout tests ([a64a6eb](...))
  * use assert_ssa_does_not_change throughout tests ([b471339](...))  <- removed
"""

import re
import sys
from collections import defaultdict


def parse_entry(line):
    """
    Parse a release note entry to extract:
    - description: the text before any links
    - has_pr: whether it contains a PR reference (#XXXXX)
    - pr_number: the PR number if present
    - has_commit: whether it contains a commit hash
    """
    # Match the description (everything before the first link)
    desc_match = re.match(r'^(\s*\*\s*)(.+?)(\s*\([^\)]+\).*)?$', line)
    if not desc_match:
        return None

    indent = desc_match.group(1)
    description = desc_match.group(2).strip()
    links_part = desc_match.group(3) or ""

    # Extract PR number if present
    pr_match = re.search(r'\[#(\d+)\]', links_part)
    pr_number = pr_match.group(1) if pr_match else None

    # Check if it has a PR reference (#XXXXX)
    has_pr = bool(pr_match)

    # Check if it has a commit hash (7+ hex chars)
    has_commit = bool(re.search(r'\[[0-9a-f]{7,}\]', links_part, re.IGNORECASE))

    return {
        'indent': indent,
        'description': description,
        'links': links_part,
        'has_pr': has_pr,
        'pr_number': pr_number,
        'has_commit': has_commit,
        'full_line': line
    }


def deduplicate_release_notes(input_file, output_file=None):
    """
    Remove exact duplicates and commit-only entries when there's a PR entry with the same description.
    """
    if output_file is None:
        output_file = input_file

    with open(input_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    original_count = len(lines)

    # Step 1: Remove exact duplicates
    seen_lines = {}
    exact_dupes_removed = 0
    deduplicated_lines = []

    for i, line in enumerate(lines):
        if line not in seen_lines:
            seen_lines[line] = i
            deduplicated_lines.append(line)
        else:
            exact_dupes_removed += 1

    # Step 2: Remove entries without PR when a PR entry exists
    entries_by_desc = defaultdict(list)

    for i, line in enumerate(deduplicated_lines):
        parsed = parse_entry(line)
        if parsed and parsed['description']:
            entries_by_desc[parsed['description']].append((i, parsed))

    lines_to_remove = set()
    no_pr_dupes_removed = 0

    for description, entries in entries_by_desc.items():
        if len(entries) <= 1:
            continue

        # Check if there's at least one entry with a PR
        has_pr_entries = [e for e in entries if e[1]['has_pr']]
        no_pr_entries = [e for e in entries if not e[1]['has_pr']]

        if has_pr_entries and no_pr_entries:
            # Remove entries without PR (whether they have commit or not)
            for idx, parsed in no_pr_entries:
                lines_to_remove.add(idx)
                no_pr_dupes_removed += 1

    # Step 3: Remove entries with same description + PR number (keep first occurrence)
    entries_by_desc_pr = defaultdict(list)

    for i, line in enumerate(deduplicated_lines):
        if i in lines_to_remove:
            continue
        parsed = parse_entry(line)
        if parsed and parsed['description'] and parsed['pr_number']:
            key = (parsed['description'], parsed['pr_number'])
            entries_by_desc_pr[key].append((i, parsed))

    pr_dupes_removed = 0

    for key, entries in entries_by_desc_pr.items():
        if len(entries) <= 1:
            continue

        # Keep the first entry, remove the rest
        for idx, parsed in entries[1:]:
            lines_to_remove.add(idx)
            pr_dupes_removed += 1

    # Step 4: Remove entries with same description but no PR (keep first occurrence)
    # This handles merge-train duplicates where commits get added multiple times
    entries_by_desc_no_pr = defaultdict(list)

    for i, line in enumerate(deduplicated_lines):
        if i in lines_to_remove:
            continue
        parsed = parse_entry(line)
        if parsed and parsed['description'] and not parsed['pr_number'] and parsed['has_commit']:
            entries_by_desc_no_pr[parsed['description']].append((i, parsed))

    commit_only_desc_dupes_removed = 0

    for description, entries in entries_by_desc_no_pr.items():
        if len(entries) <= 1:
            continue

        # Keep the first entry (earliest commit to land), remove the rest
        for idx, parsed in entries[1:]:
            lines_to_remove.add(idx)
            commit_only_desc_dupes_removed += 1

    # Build final output
    output_lines = []
    for i, line in enumerate(deduplicated_lines):
        if i not in lines_to_remove:
            output_lines.append(line)

    # Write output
    with open(output_file, 'w', encoding='utf-8') as f:
        f.writelines(output_lines)

    return {
        'exact_duplicates': exact_dupes_removed,
        'no_pr_duplicates': no_pr_dupes_removed,
        'pr_duplicates': pr_dupes_removed,
        'commit_only_desc_duplicates': commit_only_desc_dupes_removed,
        'total_removed': exact_dupes_removed + no_pr_dupes_removed + pr_dupes_removed + commit_only_desc_dupes_removed,
        'original_lines': original_count,
        'final_lines': len(output_lines)
    }


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python dedupe_release_notes.py <release-notes.md> [output-file]")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else input_file

    stats = deduplicate_release_notes(input_file, output_file)

    print(f"✓ Removed {stats['exact_duplicates']} exact duplicate lines")
    print(f"✓ Removed {stats['no_pr_duplicates']} entries without PR (when PR exists)")
    print(f"✓ Removed {stats['pr_duplicates']} entries with same description + PR number")
    print(f"✓ Removed {stats['commit_only_desc_duplicates']} commit-only entries with same description")
    print(f"✓ Total removed: {stats['total_removed']} lines")
    print(f"✓ {stats['original_lines']} → {stats['final_lines']} lines")
    print(f"✓ Output written to {output_file}")
