#!/usr/bin/env python3
"""Plot memory (peak RSS) over the course of a bb prove run.

Reads bb verbose log output from stdin and generates a self-contained HTML file
with an interactive Chart.js stepped-line chart of RSS over time.

Usage:
    bb prove --scheme chonk ... -v 2>&1 | python3 scripts/plot_memory.py > memory.html
    python3 scripts/plot_memory.py < logfile.txt > memory.html
    python3 scripts/plot_memory.py logfile.txt > memory.html
"""
import json
import sys
import re

def parse_log(lines):
    """Extract (message, rss_mib) pairs from log lines, keeping only RSS transitions."""
    entries = []
    prev_val = None
    for line in lines:
        line = line.strip()
        m = re.search(r'^(.*?)\s*\(mem:\s*([\d.]+)\s*MiB\)', line)
        if not m:
            continue
        msg = m.group(1).strip()
        val = float(m.group(2))
        if val != prev_val:
            entries.append({"msg": msg, "mib": val})
            prev_val = val
    return entries

def generate_html(entries):
    """Generate a self-contained HTML page with a Chart.js stepped-line chart."""
    labels = []
    for i, e in enumerate(entries):
        msg = e["msg"]
        # Truncate for x-axis label
        if len(msg) > 55:
            msg = msg[:52] + "..."
        labels.append(msg)

    values = [e["mib"] for e in entries]
    full_messages = [e["msg"] for e in entries]

    # Find the peak point
    peak_idx = values.index(max(values)) if values else 0

    # Compute deltas for annotation
    deltas = [0.0] + [values[i] - values[i-1] for i in range(1, len(values))]

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Memory Timeline</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@2.9.2/dist/Chart.min.js"></script>
<style>
  body {{
    margin: 0; padding: 20px;
    background: #1a1a2e; color: #e0e0e0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
  }}
  h1 {{ font-size: 18px; margin-bottom: 4px; }}
  .subtitle {{ color: #888; font-size: 13px; margin-bottom: 16px; }}
  .chart-wrap {{ position: relative; width: 100%; height: calc(100vh - 100px); }}
  canvas {{ background: #16213e; border-radius: 8px; }}
</style>
</head>
<body>
<h1>Memory Timeline (Peak RSS)</h1>
<div class="subtitle">
  {len(entries)} transitions | Peak: {max(values):.1f} MiB at step {peak_idx}
  ({full_messages[peak_idx][:80] if entries else 'N/A'})
</div>
<div class="chart-wrap"><canvas id="chart"></canvas></div>
<script>
const labels = {json.dumps(labels)};
const values = {json.dumps(values)};
const fullMessages = {json.dumps(full_messages)};
const deltas = {json.dumps([round(d, 2) for d in deltas])};
const peakIdx = {peak_idx};

// Highlight peak point
const pointColors = values.map((_, i) => i === peakIdx ? '#ff4444' : '#4a90e2');
const pointRadii = values.map((_, i) => i === peakIdx ? 6 : 2);

new Chart(document.getElementById('chart'), {{
  type: 'line',
  data: {{
    labels: labels,
    datasets: [{{
      label: 'Peak RSS (MiB)',
      data: values,
      borderColor: '#4a90e2',
      backgroundColor: 'rgba(74, 144, 226, 0.15)',
      borderWidth: 2,
      fill: true,
      steppedLine: 'before',
      pointBackgroundColor: pointColors,
      pointRadius: pointRadii,
      pointHoverRadius: 6,
    }}]
  }},
  options: {{
    responsive: true,
    maintainAspectRatio: false,
    title: {{ display: false }},
    legend: {{ display: false }},
    scales: {{
      xAxes: [{{
        ticks: {{
          fontColor: '#888',
          fontSize: 10,
          maxRotation: 90,
          minRotation: 45,
          autoSkip: true,
          maxTicksLimit: 40,
        }},
        gridLines: {{ color: 'rgba(255,255,255,0.05)' }},
      }}],
      yAxes: [{{
        scaleLabel: {{
          display: true,
          labelString: 'MiB',
          fontColor: '#aaa',
        }},
        ticks: {{
          fontColor: '#aaa',
          beginAtZero: true,
        }},
        gridLines: {{ color: 'rgba(255,255,255,0.08)' }},
      }}],
    }},
    tooltips: {{
      mode: 'index',
      intersect: false,
      callbacks: {{
        title: function(items) {{
          var idx = items[0].index;
          return fullMessages[idx];
        }},
        label: function(item) {{
          var d = deltas[item.index];
          var deltaStr = d > 0 ? ' (+' + d.toFixed(1) + ')' : '';
          return ' ' + item.value + ' MiB' + deltaStr;
        }},
      }},
    }},
  }},
}});
</script>
</body>
</html>"""

def main():
    if len(sys.argv) > 1 and sys.argv[1] != '-':
        with open(sys.argv[1]) as f:
            lines = f.readlines()
    else:
        lines = sys.stdin.readlines()

    entries = parse_log(lines)
    if not entries:
        print("No memory data found in input. Run bb with -v flag.", file=sys.stderr)
        sys.exit(1)

    print(generate_html(entries))

if __name__ == "__main__":
    main()
