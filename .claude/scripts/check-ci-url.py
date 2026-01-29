#!/usr/bin/env python3
import json
import re
import sys

data = json.load(sys.stdin)
url = data.get('tool_input', {}).get('url', '')

if 'ci.aztec-labs.com' in url:
    # Allow if basic auth is present (user:pass@)
    if re.search(r'://[^/:]+:[^/@]+@ci\.aztec-labs\.com', url):
        sys.exit(0)
    print(f'BLOCKED: Cannot WebFetch ci.aztec-labs.com (requires auth). Use /ci-logs skill instead: /ci-logs {url}', file=sys.stderr)
    sys.exit(2)

sys.exit(0)
