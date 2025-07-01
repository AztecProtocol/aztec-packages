AUDIT TRACKING DASHBOARD
=========================

Tooling for tracking the audit status of barretenberg. Audit metadata is embedded directly in each source file and summarized in an interactive dashboard.

HOW IT WORKS
------------

1. Audit headers in source files
   Each file being audited includes a structured comment block with audit status for multiple roles, e.g.:

   // === AUDIT STATUS ===
   // internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
   // external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
   // external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
   // =====================

   The script generate_audit_status_headers.sh populates all source files (in included dirs) with this header, unless one is already present.

2. The header in each file should be manually updated when the audit status changes, e.g.:

   // === AUDIT STATUS ===
   // internal:    { status: complete, auditors: [luke], date: 2025-04-17 }
   // external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
   // external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
   // =====================

3. Summary generation
   A script (generate_audit_summary.py) scans the codebase and produces a `audit_summary.json` file with the status breakdown per module and role.

4. Dashboard visualization
   A static HTML file (audit_dashboard.html) visualizes the JSON using pie charts, with one chart per audit role per module. A summary section at the top gives a full-repo overview.

USAGE
-----

1. Run the server on the remote machine:

   ./scripts/audit/run_dashboard_server.sh

2. Open a tunnel from your local machine:

   ssh -L 8080:localhost:8080 youruser@remotehost

3. View the dashboard in your browser:

   http://localhost:8080/audit_dashboard.html
