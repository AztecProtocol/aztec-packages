#!/usr/bin/env python3
"""
Audit status tracking tool for barretenberg.

Usage:
    python3 generate_audit_summary.py                      # Generate audit_summary.json
    python3 generate_audit_summary.py --status "not started"  # List only not started files
    python3 generate_audit_summary.py --status "planned"      # List only planned files
    python3 generate_audit_summary.py --status "complete"     # List files with complete audit
    python3 generate_audit_summary.py --status "incomplete"   # List all incomplete files
    python3 generate_audit_summary.py --status "not started" --dir chonk  # Filter by module
    python3 generate_audit_summary.py --list-missing       # List files without audit headers
"""

import argparse
import os
import yaml
import json
from collections import defaultdict

# --- Resolve script location and root paths ---
SCRIPT_DIR = os.path.dirname(os.path.realpath(__file__))
ROOT_DIR = os.path.realpath(os.path.join(SCRIPT_DIR, "../../src/barretenberg"))
OUTPUT_JSON = os.path.join(SCRIPT_DIR, "audit_summary.json")

STATUS_START = "=== AUDIT STATUS ==="
STATUS_END = "===================="
VALID_EXTS = ('.cpp', '.hpp', '.h', '.tcc')

# Normalize status strings to handle case variations
def normalize_status(status):
    """Normalize status to lowercase for consistent comparison."""
    if status is None:
        return "unknown"
    s = str(status).lower().strip()
    # Handle common variations
    if s in ("complete", "completed", "done"):
        return "complete"
    if s in ("not started", "notstarted", "not_started", ""):
        return "not started"
    if s in ("in progress", "inprogress", "in_progress", "wip"):
        return "in progress"
    return s


def extract_audit_block(file_path):
    """Extract and parse the audit status block from a file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
    except Exception:
        return None

    inside = False
    block = []
    for line in lines:
        if STATUS_START in line:
            inside = True
            continue
        if inside and STATUS_END in line:
            break
        if inside:
            clean = line.lstrip('/').strip()
            if clean:
                block.append(clean)

    if not block:
        return None

    try:
        return yaml.safe_load("\n".join(block))
    except Exception:
        return None


def scan_all_files(root_dir, filter_dir=None):
    """
    Scan all source files and return detailed information.

    Returns:
        dict with keys:
            - 'files': list of (rel_path, module, header_data) tuples
            - 'missing_header': list of rel_paths without audit headers
    """
    result = {
        'files': [],
        'missing_header': []
    }

    for dirpath, _, filenames in os.walk(root_dir):
        for fname in filenames:
            if not fname.endswith(VALID_EXTS):
                continue

            # Skip test files
            if '.test.' in fname or '.fuzzer.' in fname:
                continue

            full_path = os.path.join(dirpath, fname)
            rel_path = os.path.relpath(full_path, root_dir)
            top_module = rel_path.split(os.sep)[0]

            # Apply directory filter if specified
            if filter_dir and not rel_path.startswith(filter_dir):
                continue

            header_data = extract_audit_block(full_path)

            if header_data is None:
                result['missing_header'].append(rel_path)
            else:
                result['files'].append((rel_path, top_module, header_data))

    return result


def generate_summary(files_data):
    """Generate summary counts from scanned files."""
    summary = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))

    for rel_path, top_module, header_data in files_data['files']:
        for role, info in header_data.items():
            raw_status = info.get("status", "unknown")
            status = normalize_status(raw_status)
            summary[top_module][role][status] += 1

    return summary


def list_by_status(files_data, role="internal", status_filter=None):
    """List files filtered by audit status.

    Args:
        files_data: Scanned file data
        role: Audit role to check (e.g., 'internal', 'external_1')
        status_filter: Status to filter by:
            - Specific status: 'not started', 'planned', 'in progress', 'complete'
            - 'incomplete': all files where status != 'complete'
            - None: all files
    """
    results = []

    for rel_path, top_module, header_data in files_data['files']:
        if role in header_data:
            status = normalize_status(header_data[role].get("status", "unknown"))

            # Determine if file matches filter
            matches = False
            if status_filter is None:
                matches = True
            elif normalize_status(status_filter) == "incomplete":
                matches = (status != "complete")
            else:
                matches = (status == normalize_status(status_filter))

            if matches:
                auditors = header_data[role].get("auditors", [])
                results.append((rel_path, status, auditors))

    return sorted(results)


def print_by_directory(file_list, show_status=True, show_auditors=False):
    """Print files grouped by their top-level directory."""
    by_dir = defaultdict(list)

    for item in file_list:
        if isinstance(item, tuple):
            rel_path = item[0]
            extra = item[1:]
        else:
            rel_path = item
            extra = ()

        top_dir = rel_path.split(os.sep)[0]
        by_dir[top_dir].append((rel_path, extra))

    for dir_name in sorted(by_dir.keys()):
        files = by_dir[dir_name]
        print(f"\n{dir_name}/ ({len(files)} files)")
        print("-" * 40)
        for rel_path, extra in files:
            if extra and show_status:
                status = extra[0]
                output = f"  {rel_path}  [{status}]"
                if show_auditors and len(extra) > 1 and extra[1]:
                    auditors = ", ".join(extra[1])
                    output += f"  (auditors: {auditors})"
                print(output)
            else:
                print(f"  {rel_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Audit status tracking tool for barretenberg",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument(
        "--status",
        type=str,
        default=None,
        help="Filter by status: 'not started', 'planned', 'in progress', 'complete', or 'incomplete' (all non-complete)"
    )
    parser.add_argument(
        "--list-missing",
        action="store_true",
        help="List files without audit headers"
    )
    parser.add_argument(
        "--dir",
        type=str,
        default=None,
        help="Filter to a specific module/directory (e.g., 'chonk', 'stdlib/primitives')"
    )
    parser.add_argument(
        "--role",
        type=str,
        default="internal",
        help="Audit role to check (default: internal)"
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output results as JSON instead of human-readable format"
    )

    args = parser.parse_args()

    # Scan all files
    files_data = scan_all_files(ROOT_DIR, filter_dir=args.dir)

    if args.list_missing:
        missing = sorted(files_data['missing_header'])
        if args.json:
            print(json.dumps(missing, indent=2))
        else:
            print(f"\nFiles without audit headers: {len(missing)}")
            print_by_directory(missing, show_status=False)
        return

    if args.status:
        results = list_by_status(files_data, role=args.role, status_filter=args.status)
        if args.json:
            print(json.dumps([{"file": f, "status": s, "auditors": a} for f, s, a in results], indent=2))
        else:
            status_display = args.status if args.status != "incomplete" else "incomplete (not complete)"
            print(f"\nFiles with {args.role} audit status '{status_display}': {len(results)}")
            show_auditors = (normalize_status(args.status) == "complete")
            print_by_directory(results, show_status=True, show_auditors=show_auditors)
        return

    # Default: generate summary JSON
    summary = generate_summary(files_data)

    def to_dict(d):
        if isinstance(d, defaultdict):
            return {k: to_dict(v) for k, v in d.items()}
        return d

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(to_dict(summary), f, indent=2)

    print(f"Audit summary written to:\n  {OUTPUT_JSON}")

    # Print quick stats
    total_files = len(files_data['files'])
    complete_count = len([1 for _, _, h in files_data['files']
                          if normalize_status(h.get("internal", {}).get("status")) == "complete"])
    missing_count = len(files_data['missing_header'])

    print(f"\nQuick stats:")
    print(f"  Total files with headers: {total_files}")
    print(f"  Internal audit complete:  {complete_count}")
    print(f"  Internal audit pending:   {total_files - complete_count}")
    print(f"  Files missing headers:    {missing_count}")


if __name__ == "__main__":
    main()
