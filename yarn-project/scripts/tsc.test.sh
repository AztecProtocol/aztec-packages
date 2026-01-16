#!/usr/bin/env bash
# Test script for tsc.sh - creates a mock monorepo and validates all build modes
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
test_root="/tmp/tsc-test-$$"
passed=0
failed=0

cleanup() {
  rm -rf "$test_root"
}
trap cleanup EXIT

log() { echo -e "\033[1m$1\033[0m"; }
pass() { echo -e "  \033[32m✓ $1\033[0m"; ((++passed)); }
fail() { echo -e "  \033[31m✗ $1\033[0m"; ((++failed)); }

check_file() {
  if [[ -f "$1" ]]; then pass "$2"; else fail "$2 (missing: $1)"; fi
}

check_no_file() {
  if [[ ! -f "$1" ]]; then pass "$2"; else fail "$2 (unexpected: $1)"; fi
}

setup_test_monorepo() {
  log "Setting up test monorepo in $test_root"
  mkdir -p "$test_root"

  # Create node_modules symlinks to real binaries
  mkdir -p "$test_root/node_modules/.bin"
  ln -s "$(dirname "$script_dir")/node_modules/.bin/tsgo" "$test_root/node_modules/.bin/tsgo"
  ln -s "$(dirname "$script_dir")/node_modules/.bin/swc" "$test_root/node_modules/.bin/swc"

  # Copy the tsc.sh script
  mkdir -p "$test_root/scripts"
  cp "$script_dir/tsc.sh" "$test_root/scripts/tsc.sh"
  chmod +x "$test_root/scripts/tsc.sh"

  # Root tsconfig.json with project references
  cat > "$test_root/tsconfig.json" << 'EOF'
{
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dest",
    "rootDir": "src"
  },
  "files": [],
  "references": [
    { "path": "pkg-a" },
    { "path": "pkg-b" }
  ]
}
EOF

  # .swcrc for JS transpilation
  cat > "$test_root/.swcrc" << 'EOF'
{
  "jsc": {
    "parser": { "syntax": "typescript", "decorators": true },
    "target": "es2022",
    "keepClassNames": true
  },
  "module": { "type": "es6" },
  "sourceMaps": false
}
EOF

  # Package A - base package with no dependencies
  mkdir -p "$test_root/pkg-a/src"
  cat > "$test_root/pkg-a/tsconfig.json" << 'EOF'
{
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dest",
    "rootDir": "src"
  },
  "include": ["src"]
}
EOF
  cat > "$test_root/pkg-a/package.json" << 'EOF'
{ "name": "pkg-a", "version": "1.0.0", "type": "module" }
EOF
  cat > "$test_root/pkg-a/src/index.ts" << 'EOF'
export interface Config {
  name: string;
  value: number;
}

export function createConfig(name: string, value: number): Config {
  return { name, value };
}

export const DEFAULT_VALUE = 42;
EOF

  # Package B - depends on Package A
  mkdir -p "$test_root/pkg-b/src"
  cat > "$test_root/pkg-b/tsconfig.json" << 'EOF'
{
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dest",
    "rootDir": "src",
    "paths": {
      "pkg-a": ["../pkg-a/src/index.ts"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "../pkg-a" }]
}
EOF
  cat > "$test_root/pkg-b/package.json" << 'EOF'
{ "name": "pkg-b", "version": "1.0.0", "type": "module" }
EOF
  cat > "$test_root/pkg-b/src/index.ts" << 'EOF'
import { Config, createConfig, DEFAULT_VALUE } from 'pkg-a';

export function makeDefaultConfig(name: string): Config {
  return createConfig(name, DEFAULT_VALUE);
}

export class ConfigManager {
  private configs: Map<string, Config> = new Map();

  add(config: Config): void {
    this.configs.set(config.name, config);
  }

  get(name: string): Config | undefined {
    return this.configs.get(name);
  }
}
EOF

  log "Test monorepo created with pkg-a (base) and pkg-b (depends on pkg-a)"
}

clean_build_artifacts() {
  rm -rf "$test_root"/pkg-*/dest "$test_root"/pkg-*/*.tsbuildinfo "$test_root"/*.tsbuildinfo
}

test_package_mode() {
  log "\nTest 1: Package mode (from pkg-a)"
  clean_build_artifacts

  (cd "$test_root/pkg-a" && ../scripts/tsc.sh) 2>&1

  check_file "$test_root/pkg-a/dest/index.js" "JS file generated"
  check_file "$test_root/pkg-a/dest/index.d.ts" "Declaration file generated"

  # Verify JS content
  if grep -q "export function createConfig" "$test_root/pkg-a/dest/index.js" 2>/dev/null; then
    pass "JS has correct export"
  else
    fail "JS missing export"
  fi

  # Verify .d.ts content
  if grep -q "export interface Config" "$test_root/pkg-a/dest/index.d.ts" 2>/dev/null; then
    pass "Declaration has interface"
  else
    fail "Declaration missing interface"
  fi
}

test_package_mode_with_deps() {
  log "\nTest 2: Package mode with dependencies (from pkg-b)"
  # Don't clean - test that pkg-b builds and uses pkg-a's existing outputs,
  # OR builds pkg-a if needed via project references
  rm -rf "$test_root/pkg-b/dest" "$test_root/pkg-b/.tsbuildinfo"

  (cd "$test_root/pkg-b" && ../scripts/tsc.sh) 2>&1

  # pkg-b should build, and pkg-a should also build due to project references
  check_file "$test_root/pkg-b/dest/index.js" "pkg-b JS file generated"
  check_file "$test_root/pkg-b/dest/index.d.ts" "pkg-b declaration file generated"
  check_file "$test_root/pkg-a/dest/index.d.ts" "pkg-a declaration built (dependency)"

  # Verify pkg-b JS imports work
  if grep -q "ConfigManager" "$test_root/pkg-b/dest/index.js" 2>/dev/null; then
    pass "pkg-b JS has class"
  else
    fail "pkg-b JS missing class"
  fi
}

test_root_emit_declaration_only() {
  log "\nTest 3: Root mode --emitDeclarationOnly"
  clean_build_artifacts

  (cd "$test_root" && ./scripts/tsc.sh --emitDeclarationOnly) 2>&1

  check_file "$test_root/pkg-a/dest/index.d.ts" "pkg-a declaration generated"
  check_file "$test_root/pkg-b/dest/index.d.ts" "pkg-b declaration generated"
  check_no_file "$test_root/pkg-a/dest/index.js" "pkg-a JS not generated (declaration only)"
  check_no_file "$test_root/pkg-b/dest/index.js" "pkg-b JS not generated (declaration only)"
}

test_root_full_build() {
  log "\nTest 4: Root mode full build (tsgo + swc)"
  clean_build_artifacts

  (cd "$test_root" && ./scripts/tsc.sh) 2>&1

  check_file "$test_root/pkg-a/dest/index.js" "pkg-a JS generated"
  check_file "$test_root/pkg-a/dest/index.d.ts" "pkg-a declaration generated"
  check_file "$test_root/pkg-b/dest/index.js" "pkg-b JS generated"
  check_file "$test_root/pkg-b/dest/index.d.ts" "pkg-b declaration generated"

  # Verify both packages have valid output
  if grep -q "createConfig" "$test_root/pkg-a/dest/index.js" 2>/dev/null; then
    pass "pkg-a JS content valid"
  else
    fail "pkg-a JS content invalid"
  fi

  if grep -q "ConfigManager" "$test_root/pkg-b/dest/index.js" 2>/dev/null; then
    pass "pkg-b JS content valid"
  else
    fail "pkg-b JS content invalid"
  fi
}

test_no_emit() {
  log "\nTest 5: --noEmit (type check only, from package)"
  clean_build_artifacts

  # Note: --noEmit from root doesn't work with project references (tsgo limitation)
  # So we test from a single package instead
  (cd "$test_root/pkg-a" && ../scripts/tsc.sh --noEmit) 2>&1

  check_no_file "$test_root/pkg-a/dest/index.d.ts" "No declaration emitted"
  check_no_file "$test_root/pkg-a/dest/index.js" "No JS emitted"
  pass "Type check completed without emit"
}

test_type_error_detection() {
  log "\nTest 6: Type error detection"
  clean_build_artifacts

  # Introduce a type error
  cat > "$test_root/pkg-a/src/index.ts" << 'EOF'
export interface Config {
  name: string;
  value: number;
}

export function createConfig(name: string, value: number): Config {
  return { name, value: "not a number" };  // Type error!
}

export const DEFAULT_VALUE = 42;
EOF

  # Test from pkg-a (--noEmit doesn't work with project references from root)
  if (cd "$test_root/pkg-a" && ../scripts/tsc.sh --noEmit) 2>&1; then
    fail "Should have detected type error"
  else
    pass "Type error detected correctly"
  fi

  # Restore valid code
  cat > "$test_root/pkg-a/src/index.ts" << 'EOF'
export interface Config {
  name: string;
  value: number;
}

export function createConfig(name: string, value: number): Config {
  return { name, value };
}

export const DEFAULT_VALUE = 42;
EOF
}

main() {
  log "=== tsc.sh Test Suite ===\n"

  setup_test_monorepo

  test_package_mode
  test_package_mode_with_deps
  test_root_emit_declaration_only
  test_root_full_build
  test_no_emit
  test_type_error_detection

  log "\n=== Results ==="
  echo -e "\033[32mPassed: $passed\033[0m"
  echo -e "\033[31mFailed: $failed\033[0m"

  if [[ $failed -gt 0 ]]; then
    exit 1
  fi
}

main "$@"
