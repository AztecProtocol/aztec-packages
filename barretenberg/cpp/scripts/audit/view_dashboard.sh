#!/bin/bash

set -e

# Default port (can be overridden with $PORT env variable)
PORT="${PORT:-8080}"

# Find the directory where the script is
script_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
dashboard_html="$script_dir/audit_dashboard.html"

# Step 1: Generate the dashboard
echo "[1/2] Generating audit dashboard..."
python3 "$script_dir/generate_audit_dashboard.py"

# Confirm dashboard was written
if [[ ! -f "$dashboard_html" ]]; then
  echo "❌ Dashboard HTML not found at $dashboard_html"
  exit 1
fi

# Step 2: Serve it
echo "[2/2] Starting HTTP server..."

echo ""
echo "✅ Dashboard ready!"
echo "--------------------------------------------------"
echo "🔗 Local browser URL (via SSH tunnel):"
echo "    http://localhost:$PORT/audit_dashboard.html"
echo ""
echo "📡 To tunnel from your local machine, run:"
echo "    ssh -L $PORT:localhost:$PORT user@your-remote-host"
echo "--------------------------------------------------"
echo ""

cd "$script_dir"
python3 -m http.server "$PORT"
