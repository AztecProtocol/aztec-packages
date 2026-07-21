#!/usr/bin/env python3
"""
Script to recursively scan the Aztec CLI and generate structured documentation.

Usage:
    python scan_cli.py --output docs.json
    python scan_cli.py --output docs.yaml --format yaml
    python scan_cli.py --output docs.json --workers 8  # Parallel with 8 workers
"""

import subprocess
import json
import re
import argparse
import os
import time
import random
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any

try:
    import yaml
    YAML_AVAILABLE = True
except ImportError:
    YAML_AVAILABLE = False


class CLIScanner:
    """Recursively scans a CLI command tree and extracts help information."""

    # Supported CLI formats
    FORMAT_COMMANDER = "commander"  # Commander.js (Node.js) - uses "Commands:" section
    FORMAT_CLI11 = "cli11"          # CLI11 (C++) - uses "Subcommands:" section
    FORMAT_CUSTOM = "custom"        # Custom format with uppercase section headers
    FORMAT_AUTO = "auto"            # Auto-detect format

    # Maximum recursion depth for scanning subcommands (prevents runaway recursion)
    MAX_DEPTH = 5

    def __init__(self, base_command: str = "aztec", cli_format: str = "auto",
                 max_workers: int = 1, timeout: int = 60):
        self.base_command = base_command
        self.cli_format = cli_format
        self.max_workers = max_workers
        self.timeout = timeout
        self.visited = set()  # Track visited commands to avoid loops
        self.visited_lock = threading.Lock()  # Thread-safe access to visited set
        self.help_cache = {}  # Cache help output to detect duplicates
        self.print_lock = threading.Lock()  # Thread-safe printing
        self.scan_count = 0  # Track number of commands scanned
        self.scan_count_lock = threading.Lock()

    def _print(self, message: str):
        """Thread-safe printing - in parallel mode, suppress verbose output."""
        with self.print_lock:
            if self.max_workers > 1:
                # In parallel mode, only count scans silently and show warnings
                if message.strip().startswith("Scanning:"):
                    with self.scan_count_lock:
                        self.scan_count += 1
                    return
                elif message.strip().startswith("⏳"):
                    # Skip retry messages in parallel mode
                    return
            # Print all other messages (warnings, errors, sequential mode)
            print(message, flush=True)

    def run_command(self, cmd: List[str], max_retries: int = 3) -> Optional[str]:
        """Execute a command and return its output.

        Includes retry logic for Docker container name conflicts that can occur
        when running multiple commands in parallel.
        """
        for attempt in range(max_retries):
            try:
                # Set a large terminal width to prevent output truncation
                env = os.environ.copy()
                env['COLUMNS'] = '200'

                # Use unique container name only in parallel mode to avoid conflicts
                # The aztec CLI's .aztec-run script respects CONTAINER_NAME env var
                if self.max_workers > 1:
                    unique_id = f"{random.randint(0, 999999):06d}"
                    env['CONTAINER_NAME'] = f"aztec-scan-{unique_id}"

                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=self.timeout,
                    env=env
                )
                # Combine stdout and stderr as help can appear in either
                output = result.stdout + result.stderr

                # Check for Docker container name conflict (retry-able error)
                if 'container name' in output and 'is already in use' in output:
                    if attempt < max_retries - 1:
                        # Random backoff to avoid thundering herd
                        wait_time = (0.5 + random.random()) * (attempt + 1)
                        self._print(f"  ⏳ Container conflict, retrying in {wait_time:.1f}s... (attempt {attempt + 1}/{max_retries})")
                        time.sleep(wait_time)
                        continue
                    else:
                        self._print(f"  ⚠️  Container conflict persisted after {max_retries} attempts")
                        return output  # Return the error output for proper handling

                # Strip ANSI escape codes (color/formatting codes)
                # Pattern matches: ESC[ followed by any number of digits/semicolons, ending with a letter
                ansi_pattern = re.compile(r'\x1b\[[0-9;]*[a-zA-Z]')
                output = ansi_pattern.sub('', output)

                return output
            except subprocess.TimeoutExpired:
                self._print(f"Warning: Command {' '.join(cmd)} timed out")
                return None
            except Exception as e:
                self._print(f"Warning: Error running {' '.join(cmd)}: {e}")
                return None

        return None

    def parse_commander_help(self, help_text: str) -> Dict[str, Any]:
        """Parse Commander.js style help output.

        This parser is only used for the root command (to discover Commands and
        Additional commands sections). Leaf subcommands are auto-detected and
        typically parsed by parse_cli11_help which handles both CLI11 and
        Commander.js leaf output correctly.
        """
        result = {
            "usage": "",
            "description": "",
            "options": [],
            "commands": [],
            "additional_commands": [],
            "examples": []
        }

        lines = help_text.split('\n')
        current_section = None
        pre_usage_lines = []  # Collect lines before Usage: for modern CLI format

        for i, line in enumerate(lines):
            # Extract usage (keep the first one; wrapper commands may show
            # a second Usage: line from the delegated tool)
            if line.strip().startswith('Usage:'):
                if not result["usage"]:
                    result["usage"] = line.replace('Usage:', '').strip()
                    # In modern CLI format, description comes BEFORE Usage:
                    if pre_usage_lines and not result["description"]:
                        result["description"] = ' '.join(pre_usage_lines)
                continue

            # Section headers (check these before description parsing)
            elif 'Options:' in line and current_section != 'additional':
                current_section = 'options'
            elif line.strip() == 'Commands:':
                current_section = 'commands'
            elif 'Arguments:' in line:
                # Arguments section - skip parsing (not commands)
                current_section = 'arguments'
            elif 'Examples:' in line or 'Example:' in line:
                # Examples section - capture but don't parse as commands
                current_section = 'examples'
            elif 'Output:' in line or 'Note:' in line:
                # Other informational sections - skip parsing
                current_section = 'info'
            elif 'Additional commands:' in line:
                current_section = 'additional'

            # Collect lines before Usage: (for modern CLI format where description comes first)
            elif not result["usage"] and line.strip() and current_section is None:
                pre_usage_lines.append(line.strip())

            # Capture examples
            elif current_section == 'examples' and line.strip():
                result["examples"].append(line.strip())

            # Extract description (Commander.js format: after Usage, before Options/Commands)
            elif line.strip() and not line.startswith(' ') and current_section is None:
                if result["usage"] and not result["description"]:
                    result["description"] = line.strip()

            # Parse options
            elif current_section == 'options' and line.strip().startswith('-'):
                # Match patterns like: -V, --version, --name <value>
                option_match = re.match(r'\s+(-[^,\s]+)?(?:,\s+)?(--[^\s]+(?:\s+<[^>]+>)?)\s+(.*)', line)
                if option_match:
                    short_flag = option_match.group(1) or ""
                    long_flag = option_match.group(2)
                    description = option_match.group(3).strip()

                    result["options"].append({
                        "short": short_flag,
                        "long": long_flag,
                        "description": description
                    })

            # Parse commands
            elif current_section == 'commands' and line.strip():
                # Match patterns like: command-name [options] <args>  Description
                # Commander.js pads to a fixed column width, so split on multiple spaces
                # First strip leading space, then split on 2+ consecutive spaces
                stripped = line.strip()
                if stripped and not stripped.startswith('-'):
                    # Split by multiple spaces (typically 2 or more)
                    parts = re.split(r'\s{2,}', line.strip(), maxsplit=1)
                    if len(parts) == 2:
                        cmd_full = parts[0].strip()
                        description = parts[1].strip()

                        # Extract just the command name (first word)
                        cmd_name = cmd_full.split()[0]

                        result["commands"].append({
                            "name": cmd_name,
                            "signature": cmd_full,
                            "description": description
                        })

            # Parse additional commands
            # These can use either colon-separated format ("init [folder]: description")
            # or space-padded format like regular Commands ("init [folder]  description")
            elif current_section == 'additional' and line.strip():
                stripped = line.strip()
                if stripped and not stripped.startswith('-'):
                    cmd_name = None
                    cmd_full = None
                    description = None

                    # Try colon-separated format first
                    colon_match = re.match(r'^([\w-]+)(\s+[^:]+)?:\s*(.+)$', stripped)
                    if colon_match:
                        cmd_name = colon_match.group(1)
                        cmd_args = colon_match.group(2) or ""
                        description = colon_match.group(3).strip()
                        cmd_full = f"{cmd_name}{cmd_args}".strip()

                    # Fall back to space-padded format (same as Commands section)
                    if not cmd_name:
                        parts = re.split(r'\s{2,}', stripped, maxsplit=1)
                        if len(parts) == 2:
                            cmd_full = parts[0].strip()
                            description = parts[1].strip()
                            cmd_name = cmd_full.split()[0]

                    if cmd_name and description:
                        result["additional_commands"].append({
                            "name": cmd_name,
                            "signature": cmd_full,
                            "description": description
                        })

        # Merge additional_commands into commands list, avoiding duplicates
        existing_cmd_names = {cmd["name"] for cmd in result["commands"]}
        for cmd in result["additional_commands"]:
            if cmd["name"] not in existing_cmd_names:
                result["commands"].append(cmd)
        del result["additional_commands"]

        # Sort commands alphabetically for deterministic output
        result["commands"] = sorted(result["commands"], key=lambda x: x["name"])

        return result

    def parse_custom_help(self, help_text: str) -> Dict[str, Any]:
        """Parse custom formatted help output (like 'aztec start').
        Note: ANSI codes have already been stripped at this point."""
        result = {
            "usage": "",
            "description": "",
            "sections": []
        }

        lines = help_text.split('\n')
        current_section = None
        current_option = None

        for line in lines:
            # Section headers (e.g., "  MISC", "  SANDBOX") - after ANSI stripping
            # Looking for lines that are all caps, indented by 2 spaces, no leading dashes
            section_match = re.match(r'^\s{2}([A-Z][A-Z\s]+?)\s*$', line)
            if section_match and not line.strip().startswith('-'):
                section_name = section_match.group(1).strip()
                current_section = {
                    "name": section_name,
                    "options": []
                }
                result["sections"].append(current_section)
                continue

            # Option lines (e.g., "    --network <value>")
            if current_section:
                # Check if this is an option line (starts with dashes after indentation)
                option_match = re.match(r'^\s+(--.+?)\s{2,}', line)
                if option_match:
                    option_flag = option_match.group(1).strip()

                    # Extract default and env var from the line
                    default_match = re.search(r'\(default:\s*([^)]+)\)', line)
                    env_match = re.search(r'\(\$([^)]+)\)', line)

                    current_option = {
                        "flag": option_flag,
                        "default": default_match.group(1).strip() if default_match else None,
                        "env": env_match.group(1).strip() if env_match else None,
                        "description": ""
                    }
                    current_section["options"].append(current_option)

                # Description line (indented text after option)
                elif current_option and line.strip() and not line.strip().startswith('--'):
                    desc_match = re.match(r'^\s{10,}(.+)', line)
                    if desc_match:
                        current_option["description"] = desc_match.group(1).strip()

        return result

    def parse_cli11_help(self, help_text: str) -> Dict[str, Any]:
        """Parse CLI11 (C++ library) style help output (like 'bb').
        CLI11 format:
        - Description on first lines (before Usage:)
        - Usage: command [OPTIONS] [SUBCOMMAND]
        - Options: with format -short,--long [ENV_VAR] followed by indented description
        - Subcommands: with name followed by description (may wrap to next lines)

        Returns:
            Parsed help structure, or error dict if parsing fails.
        """
        result = {
            "usage": "",
            "description": "",
            "options": [],
            "commands": []
        }

        # Validate input
        if not help_text or not isinstance(help_text, str):
            return {
                "error": "invalid_help_text",
                "error_message": "Help text is empty or not a string",
                "usage": "",
                "description": "",
                "options": [],
                "commands": []
            }

        try:
            lines = help_text.split('\n')
            current_section = None
            description_lines = []
            current_option = None
            current_command = None
            # Track indentation levels dynamically for more robust continuation detection
            option_indent = None  # Indentation level where options start

            for line in lines:
                # Extract usage (keep the first one; wrapper commands may show
                # a second Usage: line from the delegated tool)
                if line.strip().startswith('Usage:'):
                    if not result["usage"]:
                        result["usage"] = line.replace('Usage:', '').strip()
                    current_section = 'post_usage'
                    continue

                # Collect description (before or after Usage:)
                if current_section is None and line.strip():
                    description_lines.append(line.strip())
                    continue
                if current_section == 'post_usage' and line.strip():
                    # Stop at section headers (Options:, Arguments:, etc.)
                    if line.strip().endswith(':'):
                        current_section = 'other'
                    else:
                        description_lines.append(line.strip())
                        continue

                # Section headers
                if line.strip() == 'Options:':
                    current_section = 'options'
                    current_option = None
                    option_indent = None  # Reset for new section (may have different indentation)
                    continue
                elif line.strip() == 'Subcommands:':
                    current_section = 'subcommands'
                    current_command = None
                    continue

                # Parse options section
                if current_section == 'options':
                    # Calculate current line's indentation
                    line_indent = len(line) - len(line.lstrip()) if line.strip() else 0

                    # First, check for description continuation (more indented than option)
                    # This must come BEFORE checking for new options, because continuation
                    # lines may contain "--flag" text that would otherwise be mistakenly
                    # parsed as a new option (e.g., "requires --slow_low_memory).")
                    if current_option and line.strip() and option_indent is not None:
                        # Continuation lines are indented more than the option itself
                        if line_indent >= option_indent + 2:
                            desc_text = line.strip()
                            if current_option["description"]:
                                current_option["description"] += " " + desc_text
                            else:
                                current_option["description"] = desc_text
                            continue

                    # Option line: starts with dash(es), format: -h,--help or --long <VALUE> [ENV_VAR]
                    # Value placeholders can use <VALUE> or [value] syntax.
                    option_match = re.match(r'^\s+(-[^\s,]+(?:,\s*--[^\s\[]+)?(?:\s*,\s*--[^\s\[]+)?(?:\s+(?:<[^>]+>|\[[^\]]+\]))?)\s*(\[[^\]]+\])?\s*$', line)
                    if option_match:
                        # Track option indentation level on first option seen
                        if option_indent is None:
                            option_indent = line_indent
                        # This is an option with its description on next line(s)
                        flags = option_match.group(1).strip()
                        env_var = option_match.group(2).strip('[]') if option_match.group(2) else None
                        current_option = {
                            "flags": flags,
                            "env": env_var,
                            "description": ""
                        }
                        result["options"].append(current_option)
                        continue

                    # Check for option with inline description: -h,--help  Description here
                    # Also handles: --flag <VALUE>  Description here
                    #               --flag [value]  Description here
                    inline_option_match = re.match(r'^\s+(-[^\s]+(?:,\s*--[^\s]+)?(?:\s*,\s*--[^\s]+)?(?:\s+(?:<[^>]+>|\[[^\]]+\]))?)\s{2,}(.+)$', line)
                    if inline_option_match:
                        # Track option indentation level on first option seen
                        if option_indent is None:
                            option_indent = line_indent
                        flags = inline_option_match.group(1).strip()
                        desc = inline_option_match.group(2).strip()
                        current_option = {
                            "flags": flags,
                            "env": None,
                            "description": desc
                        }
                        result["options"].append(current_option)
                        continue

                # Parse subcommands section
                if current_section == 'subcommands':
                    # Subcommand line: name followed by description (2+ spaces between)
                    # Regex breakdown:
                    #   ^(\S+)      - Command name at start of line (non-whitespace chars)
                    #   \s{2,}      - Two or more spaces (separator)
                    #   (.+)$       - Description text to end of line
                    cmd_match = re.match(r'^(\S+)\s{2,}(.+)$', line)
                    if cmd_match:
                        cmd_name = cmd_match.group(1).strip()
                        cmd_desc = cmd_match.group(2).strip()
                        current_command = {
                            "name": cmd_name,
                            "signature": cmd_name,
                            "description": cmd_desc
                        }
                        result["commands"].append(current_command)
                        continue

                    # Continuation of subcommand description (indented text)
                    if current_command and line.strip() and re.match(r'^\s{2,}', line):
                        desc_text = line.strip()
                        current_command["description"] += " " + desc_text
                        continue

            # Set description from collected lines
            if description_lines:
                result["description"] = " ".join(description_lines)

            return result

        except Exception as e:
            # Return error dict if parsing fails unexpectedly
            return {
                "error": "parse_error",
                "error_message": f"Failed to parse CLI11 help output: {str(e)}",
                "usage": result.get("usage", ""),
                "description": result.get("description", ""),
                "options": result.get("options", []),
                "commands": result.get("commands", [])
            }

    def _auto_detect_format(self, help_output: str) -> str:
        """Auto-detect the CLI help format from the output text."""
        has_commands_section = re.search(r'^Commands:', help_output, re.MULTILINE)
        has_subcommands_section = re.search(r'^Subcommands:', help_output, re.MULTILINE)
        has_options_section = re.search(r'^Options:', help_output, re.MULTILINE)
        has_usage_line = re.search(r'^Usage:', help_output, re.MULTILINE)

        if has_usage_line and has_commands_section:
            return self.FORMAT_COMMANDER
        elif has_usage_line and has_subcommands_section:
            return self.FORMAT_CLI11
        elif has_usage_line and has_options_section:
            return self.FORMAT_CLI11
        elif re.search(r'^\s{2}[A-Z][A-Z\s]+$', help_output, re.MULTILINE):
            return self.FORMAT_CUSTOM
        else:
            return "raw"

    def scan_command(self, cmd_path: List[str], depth: int = 0, parent_help: Optional[str] = None) -> Dict[str, Any]:
        """Recursively scan a command and its subcommands."""
        cmd_str = ' '.join(cmd_path)

        # Thread-safe check and add to visited set
        with self.visited_lock:
            if cmd_str in self.visited:
                return {"error": "already_visited"}
            self.visited.add(cmd_str)

        # Limit depth to prevent runaway recursion
        if depth > self.MAX_DEPTH:
            return {"error": "max_depth_exceeded"}

        self._print(f"{'  ' * depth}Scanning: {cmd_str}")

        # Get help output
        help_output = self.run_command(cmd_path + ['--help'])
        if not help_output or not help_output.strip():
            return {"error": "no_help_available", "error_type": "empty_output"}

        # Check if help output is identical to parent (indicates invalid subcommand)
        if parent_help and help_output.strip() == parent_help.strip():
            self._print(f"{'  ' * depth}  ⚠️  Invalid subcommand (returns parent help), skipping")
            return {"error": "invalid_subcommand"}

        # Check for errors in help output
        error_markers = [
            "ERROR: cli Error in command execution",
            "TypeError: Do not know how to serialize",
            "TypeError:",
            "Error:",
            "at JSON.stringify",
        ]

        if any(marker in help_output for marker in error_markers):
            self._print(f"{'  ' * depth}  ⚠️  Command failed with error, skipping")
            return {
                "error": "command_execution_error",
                "error_type": "bigint_serialization" if "BigInt" in help_output else "unknown",
                "error_preview": help_output[:200]
            }

        # Determine format: use configured format for root command only.
        # Subcommands always auto-detect because they may use a different
        # framework (e.g., aztec root is Commander.js but aztec test/compile
        # delegate to nargo which uses CLI11, and aztec start uses custom format).
        # If auto-detect returns "raw", fall back to the configured format.
        if depth == 0 and self.cli_format != self.FORMAT_AUTO:
            detected_format = self.cli_format
        else:
            detected_format = self._auto_detect_format(help_output)
            if detected_format == "raw" and self.cli_format != self.FORMAT_AUTO:
                detected_format = self.cli_format
        parsed = self._parse_help(detected_format, help_output)

        # Normalize usage line to reflect the actual command path.
        # Wrapper commands (e.g., "aztec test" delegating to "nargo test") may
        # report the underlying tool's name in the Usage: line.
        if parsed.get("usage") and not parsed["usage"].startswith(cmd_path[0]):
            expected_cmd = ' '.join(cmd_path)
            usage_parts = parsed["usage"].split()
            # Find where arguments start (brackets, angle brackets, or dashes)
            args_start = len(usage_parts)
            for i, part in enumerate(usage_parts):
                if part.startswith('[') or part.startswith('<') or part.startswith('-'):
                    args_start = i
                    break
            args = ' '.join(usage_parts[args_start:])
            parsed["usage"] = f"{expected_cmd} {args}" if args else expected_cmd

        # Recursively scan subcommands for formats that support them
        if detected_format in (self.FORMAT_COMMANDER, self.FORMAT_CLI11):
            subcommands = {}
            commands_to_scan = [
                cmd for cmd in parsed.get("commands", [])
                if cmd["name"] != "help"  # Skip help command
            ]

            if commands_to_scan:
                if self.max_workers > 1:
                    # Parallel scanning of subcommands
                    subcommands = self._scan_subcommands_parallel(
                        cmd_path, commands_to_scan, depth, help_output
                    )
                else:
                    # Sequential scanning (original behavior)
                    for cmd in commands_to_scan:
                        cmd_name = cmd["name"]
                        sub_result = self.scan_command(cmd_path + [cmd_name], depth + 1, help_output)
                        subcommands[cmd_name] = sub_result
                    # Sort subcommands alphabetically for deterministic output
                    subcommands = dict(sorted(subcommands.items()))

            if subcommands:
                parsed["subcommands"] = subcommands

        return parsed

    def _parse_help(self, format_type: str, help_output: str) -> Dict[str, Any]:
        """Parse help output based on detected format type."""
        if format_type == self.FORMAT_COMMANDER:
            parsed = self.parse_commander_help(help_output)
            parsed["format"] = "commander"
        elif format_type == self.FORMAT_CLI11:
            parsed = self.parse_cli11_help(help_output)
            parsed["format"] = "cli11"
        elif format_type == self.FORMAT_CUSTOM:
            parsed = self.parse_custom_help(help_output)
            parsed["format"] = "custom"
        else:
            parsed = {"format": "raw", "raw_help": help_output}
        return parsed

    def _scan_subcommands_parallel(
        self,
        parent_path: List[str],
        commands: List[Dict[str, Any]],
        depth: int,
        parent_help: str
    ) -> Dict[str, Any]:
        """Scan multiple subcommands in parallel using a thread pool."""
        subcommands = {}

        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            # Submit all subcommand scans to the thread pool
            future_to_cmd = {
                executor.submit(
                    self.scan_command,
                    parent_path + [cmd["name"]],
                    depth + 1,
                    parent_help
                ): cmd["name"]
                for cmd in commands
            }

            # Collect results as they complete
            for future in as_completed(future_to_cmd):
                cmd_name = future_to_cmd[future]
                try:
                    result = future.result()
                    subcommands[cmd_name] = result
                except Exception as e:
                    self._print(f"  ⚠️  Error scanning {cmd_name}: {e}")
                    subcommands[cmd_name] = {
                        "error": "scan_exception",
                        "error_message": str(e)
                    }

        # Sort subcommands alphabetically for deterministic output
        return dict(sorted(subcommands.items()))

    def scan(self) -> Dict[str, Any]:
        """Start the recursive scan from the base command."""
        result = {
            "command": self.base_command,
            "scanned_at": datetime.now(timezone.utc).strftime('%a %d %b %Y %H:%M:%S UTC'),
            "data": self.scan_command([self.base_command])
        }
        # Print summary after parallel scanning
        if self.max_workers > 1:
            print(f"  Scanned {self.scan_count} commands.")
        return result


def main():
    parser = argparse.ArgumentParser(description='Generate CLI documentation from help output')
    parser.add_argument('--output', '-o', required=True, help='Output file path')
    parser.add_argument('--format', '-f', choices=['json', 'yaml'], default='json',
                        help='Output format (default: json)')
    parser.add_argument('--command', '-c', default='aztec',
                        help='Base command to scan (default: aztec)')
    parser.add_argument('--cli-format', dest='cli_format',
                        choices=['auto', 'commander', 'cli11', 'custom'],
                        default='auto',
                        help='CLI help format: commander (Node.js), cli11 (C++), custom, or auto-detect (default: auto)')
    parser.add_argument('--workers', '-w', type=int, default=1,
                        help='Number of parallel workers for scanning subcommands (default: 1, sequential)')
    parser.add_argument('--timeout', '-t', type=int, default=15,
                        help='Timeout in seconds for each command (default: 15)')

    args = parser.parse_args()

    # Check YAML support
    if args.format == 'yaml' and not YAML_AVAILABLE:
        print("Error: YAML format requires PyYAML. Install it with: pip install pyyaml")
        print("Falling back to JSON format...")
        args.format = 'json'
        if not args.output.endswith('.json'):
            args.output = args.output.replace('.yaml', '.json').replace('.yml', '.json')

    # Print configuration
    if args.workers > 1:
        print(f"Scanning with {args.workers} parallel workers (timeout: {args.timeout}s per command)")
    else:
        print(f"Scanning sequentially (timeout: {args.timeout}s per command)")

    # Scan the CLI
    scanner = CLIScanner(base_command=args.command, cli_format=args.cli_format,
                         max_workers=args.workers, timeout=args.timeout)
    result = scanner.scan()

    # Write output
    with open(args.output, 'w') as f:
        if args.format == 'yaml' and YAML_AVAILABLE:
            yaml.dump(result, f, default_flow_style=False, sort_keys=False)
        else:
            json.dump(result, f, indent=2)

    print(f"\nDocumentation written to: {args.output}")


if __name__ == '__main__':
    main()
