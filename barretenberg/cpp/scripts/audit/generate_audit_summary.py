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
VALID_EXTS = ('.cpp', '.hpp', '.h')

def extract_audit_block(file_path):
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

def scan_directory(root_dir):
    summary = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))

    for dirpath, _, filenames in os.walk(root_dir):
        for fname in filenames:
            if not fname.endswith(VALID_EXTS):
                continue

            full_path = os.path.join(dirpath, fname)
            rel_path = os.path.relpath(full_path, root_dir)
            top_module = rel_path.split(os.sep)[0]

            header_data = extract_audit_block(full_path)
            if not header_data:
                continue

            for role, info in header_data.items():
                status = info.get("status", "unknown")
                summary[top_module][role][status] += 1

    return summary

def main():
    summary = scan_directory(ROOT_DIR)

    def to_dict(d):
        if isinstance(d, defaultdict):
            return {k: to_dict(v) for k, v in d.items()}
        return d

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(to_dict(summary), f, indent=2)

    print(f"Audit summary written to:\n  {OUTPUT_JSON}")

if __name__ == "__main__":
    main()
