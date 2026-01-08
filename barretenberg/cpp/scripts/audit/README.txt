AUDIT TRACKING DASHBOARD
=========================

Tooling for tracking the audit status of barretenberg. Audit metadata is embedded directly in each source file and summarized in an interactive dashboard.

HOW IT WORKS
------------

1. Audit headers in source files
   Each file being audited includes a structured comment block with audit status for multiple roles, e.g.:

   // === AUDIT STATUS ===
   // internal:    { status: not started, auditors: [], commit: }
   // external_1:  { status: not started, auditors: [], commit: }
   // external_2:  { status: not started, auditors: [], commit: }
   // =====================

   The script generate_audit_status_headers.sh populates all source files (in included dirs) with this header, unless one is already present.

2. The header in each file should be manually updated when the audit status changes, e.g.:

   // === AUDIT STATUS ===
   // internal:    { status: Complete, auditors: [Luke], commit: abc123def }
   // external_1:  { status: not started, auditors: [], commit: }
   // external_2:  { status: not started, auditors: [], commit: }
   // =====================

3. Summary generation
   A script (generate_audit_summary.py) scans the codebase and produces a `audit_summary.json` file with the status breakdown per module and role.

4. Dashboard visualization
   A static HTML file (audit_dashboard.html) visualizes the JSON using pie charts, with one chart per audit role per module. A summary section at the top gives a full-repo overview.


CLI USAGE
---------

The Python script supports multiple modes:

# Generate audit_summary.json (default)
python3 generate_audit_summary.py

# List files with incomplete internal audit
python3 generate_audit_summary.py --list-unaudited

# List files with incomplete audit, filtered by directory
python3 generate_audit_summary.py --list-unaudited --dir chonk
python3 generate_audit_summary.py --list-unaudited --dir stdlib/primitives

# List files without any audit headers
python3 generate_audit_summary.py --list-missing

# List files with complete internal audit
python3 generate_audit_summary.py --list-complete

# Check a different audit role (default: internal)
python3 generate_audit_summary.py --list-unaudited --role external_1

# Output as JSON instead of human-readable
python3 generate_audit_summary.py --list-unaudited --json


DASHBOARD USAGE
---------------

1. Run the server on the remote machine:

   ./scripts/audit/run_dashboard_server.sh

2. Open a tunnel from your local machine:

   ssh -L 8080:localhost:8080 youruser@remotehost

3. View the dashboard in your browser:

   http://localhost:8080/audit_dashboard.html


QUICK EXAMPLES
--------------

# See what needs auditing in stdlib
python3 generate_audit_summary.py --list-unaudited --dir stdlib

# See which files are missing headers entirely
python3 generate_audit_summary.py --list-missing

# Quick stats
python3 generate_audit_summary.py
# Output:
#   Total files with headers: 551
#   Internal audit complete:  172
#   Internal audit pending:   379
#   Files missing headers:    1103
