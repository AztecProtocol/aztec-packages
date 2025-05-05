#!/bin/bash
set -e

# Resolve script directory
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
summary_script="$script_dir/generate_audit_summary.py"
dashboard_html="$script_dir/audit_dashboard.html"

# Check that dashboard HTML exists
if [[ ! -f "$dashboard_html" ]]; then
  echo "Missing: $dashboard_html"
  echo "You need to create a static audit_dashboard.html that loads audit_summary.json dynamically."
  exit 1
fi

# Generate audit_summary.json
echo "[1/2] Generating audit summary..."
python3 "$summary_script"

# Start server
echo "[2/2] Starting HTTP server at http://localhost:8080"
echo "🔗 Visit: http://localhost:8080/audit_dashboard.html"
cd "$script_dir"
python3 -m http.server 8080
