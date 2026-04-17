#!/usr/bin/env bash
# Helper for generating TypeScript/JSON from .env files.
# Sourced by per-package generate.sh scripts.

# Format KEY=VALUE lines from stdin as TypeScript object properties.
format_ts_properties() {
  node -e "
    const lines = require('fs').readFileSync(0, 'utf8').trim().split('\n');
    for (const line of lines) {
      if (!line) continue;
      const idx = line.indexOf('=');
      if (idx < 0) continue;
      const key = line.substring(0, idx);
      const val = line.substring(idx + 1);
      let tsVal;
      if (val === 'true' || val === 'false') tsVal = val;
      else if (val !== '' && !isNaN(Number(val)) && !/^0x/i.test(val)) tsVal = String(Number(val));
      else tsVal = \"'\" + val + \"'\";
      console.log('  ' + key + ': ' + tsVal + ',');
    }
  "
}

# Format KEY=VALUE lines from stdin as a JSON object.
format_json_object() {
  node -e "
    const lines = require('fs').readFileSync(0, 'utf8').trim().split('\n');
    const obj = {};
    for (const line of lines) {
      if (!line) continue;
      const idx = line.indexOf('=');
      if (idx < 0) continue;
      const key = line.substring(0, idx);
      const val = line.substring(idx + 1);
      if (val === 'true') obj[key] = true;
      else if (val === 'false') obj[key] = false;
      else if (val !== '' && !isNaN(Number(val)) && !/^0x/i.test(val)) obj[key] = Number(val);
      else obj[key] = val;
    }
    console.log(JSON.stringify(obj, null, 2));
  "
}

# Source env files and output specified keys as KEY=VALUE lines.
# Usage: extract_keys "KEY1 KEY2 ..." env_file1 [env_file2 ...]
extract_keys() {
  local keys_str="$1"
  shift
  (
    set +u 2>/dev/null || true
    set +e 2>/dev/null || true
    for f in "$@"; do source "$f" 2>/dev/null; done
    for key in $keys_str; do
      if [[ -n "${!key+x}" ]]; then
        echo "$key=${!key}"
      fi
    done
  )
}
