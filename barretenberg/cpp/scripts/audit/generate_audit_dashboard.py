import os
import json
from collections import Counter, defaultdict
from pathlib import Path

AUDIT_ROOT = Path(__file__).resolve().parent.parent / "../src/barretenberg_audit_status"
OUTPUT_FILE = Path(__file__).resolve().parent / "audit_dashboard.html"

summary = defaultdict(Counter)

# Scan each subdirectory
for module_dir in AUDIT_ROOT.iterdir():
    audit_file = module_dir / "audit_status.json"
    if not audit_file.exists():
        continue

    with open(audit_file) as f:
        data = json.load(f)
        for status_info in data.values():
            status = status_info.get("status", "unknown").lower()
            summary[module_dir.name][status] += 1

# Prepare overall totals
totals = Counter()
for module_status in summary.values():
    totals.update(module_status)

# Generate HTML
html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Audit Progress Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body {{ font-family: Arial, sans-serif; padding: 2em; }}
    table {{ border-collapse: collapse; margin-top: 2em; width: 100%; }}
    th, td {{ border: 1px solid #ccc; padding: 0.5em; text-align: center; }}
    th {{ background-color: #f2f2f2; }}
  </style>
</head>
<body>
  <h1>Barretenberg Audit Progress</h1>

  <canvas id="statusChart" width="400" height="200"></canvas>

  <script>
    const ctx = document.getElementById('statusChart').getContext('2d');
    const chart = new Chart(ctx, {{
      type: 'pie',
      data: {{
        labels: {list(totals.keys())},
        datasets: [{{
          label: 'Overall Audit Status',
          data: {list(totals.values())},
          backgroundColor: ['#f39c12', '#3498db', '#2ecc71', '#e74c3c', '#9b59b6']
        }}]
      }},
      options: {{
        responsive: true
      }}
    }});
  </script>

  <h2>Per-Module Breakdown</h2>
  <table>
    <tr>
      <th>Module</th>
      <th>Not Started</th>
      <th>In Progress</th>
      <th>Audited</th>
      <th>Other</th>
    </tr>
"""

for module, counts in summary.items():
    html += f"""
    <tr>
      <td>{module}</td>
      <td>{counts.get('not started', 0)}</td>
      <td>{counts.get('in progress', 0)}</td>
      <td>{counts.get('audited', 0)}</td>
      <td>{sum(v for k,v in counts.items() if k not in ['not started','in progress','audited'])}</td>
    </tr>
    """

html += """
  </table>
</body>
</html>
"""

# Write the output file
with open(OUTPUT_FILE, "w") as f:
    f.write(html)

print(f"Dashboard written to: {OUTPUT_FILE}")
