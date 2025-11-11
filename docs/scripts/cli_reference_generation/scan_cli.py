#!/usr/bin/env python3
"""
Script to recursively scan the Aztec CLI and generate structured documentation.

Usage:
    python scan_cli.py --output docs.json
    python scan_cli.py --output docs.yaml --format yaml
"""

import subprocess
import json
import re
import argparse
import os
from typing import Dict, List, Optional, Any

try:
    import yaml
    YAML_AVAILABLE = True
except ImportError:
    YAML_AVAILABLE = False


class CLIScanner:
    """Recursively scans a CLI command tree and extracts help information."""

    def __init__(self, base_command: str = "aztec"):
        self.base_command = base_command
        self.visited = set()  # Track visited commands to avoid loops
        self.help_cache = {}  # Cache help output to detect duplicates

    def run_command(self, cmd: List[str]) -> Optional[str]:
        """Execute a command and return its output."""
        try:
            # Set a large terminal width to prevent output truncation
            env = os.environ.copy()
            env['COLUMNS'] = '200'

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=60,  # Increased timeout for commands that may pull Docker images
                env=env
            )
            # Combine stdout and stderr as help can appear in either
            output = result.stdout + result.stderr

            # Strip ANSI escape codes (color/formatting codes)
            # Pattern matches: ESC[ followed by any number of digits/semicolons, ending with a letter
            ansi_pattern = re.compile(r'\x1b\[[0-9;]*[a-zA-Z]')
            output = ansi_pattern.sub('', output)

            return output
        except subprocess.TimeoutExpired:
            print(f"Warning: Command {' '.join(cmd)} timed out")
            return None
        except Exception as e:
            print(f"Warning: Error running {' '.join(cmd)}: {e}")
            return None

    def parse_commander_help(self, help_text: str) -> Dict[str, Any]:
        """Parse Commander.js style help output."""
        result = {
            "usage": "",
            "description": "",
            "options": [],
            "commands": []
        }

        lines = help_text.split('\n')
        current_section = None

        for i, line in enumerate(lines):
            # Extract usage
            if line.strip().startswith('Usage:'):
                result["usage"] = line.replace('Usage:', '').strip()

            # Section headers (check these before description parsing)
            elif 'Options:' in line:
                current_section = 'options'
            elif 'Commands:' in line or 'Arguments:' in line:
                current_section = 'commands'

            # Extract description (usually after Usage, before Options/Commands)
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
            elif current_section == 'commands' and line.strip() and not line.strip().startswith('Additional'):
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

    def scan_command(self, cmd_path: List[str], depth: int = 0, parent_help: Optional[str] = None) -> Dict[str, Any]:
        """Recursively scan a command and its subcommands."""
        cmd_str = ' '.join(cmd_path)

        # Avoid infinite loops
        if cmd_str in self.visited:
            return {"error": "already_visited"}

        self.visited.add(cmd_str)

        # Limit depth to prevent runaway recursion
        if depth > 5:
            return {"error": "max_depth_exceeded"}

        print(f"{'  ' * depth}Scanning: {cmd_str}")

        # Get help output
        help_output = self.run_command(cmd_path + ['--help'])
        if not help_output:
            return {"error": "no_help_output"}

        # Check if help output is identical to parent (indicates invalid subcommand)
        if parent_help and help_output.strip() == parent_help.strip():
            print(f"{'  ' * depth}  ⚠️  Invalid subcommand (returns parent help), skipping")
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
            print(f"{'  ' * depth}  ⚠️  Command failed with error, skipping")
            return {
                "error": "command_execution_error",
                "error_type": "bigint_serialization" if "BigInt" in help_output else "unknown",
                "error_preview": help_output[:200]
            }

        # Determine help format and parse
        if 'Usage:' in help_output and 'Commands:' in help_output:
            # Commander.js style
            parsed = self.parse_commander_help(help_output)
            parsed["format"] = "commander"

            # Recursively scan subcommands
            subcommands = {}
            for cmd in parsed.get("commands", []):
                cmd_name = cmd["name"]
                if cmd_name != "help":  # Skip help command
                    sub_result = self.scan_command(cmd_path + [cmd_name], depth + 1, help_output)
                    # Include all subcommands, even ones with errors
                    # Error commands will be rendered with stub sections
                    subcommands[cmd_name] = sub_result

            if subcommands:
                parsed["subcommands"] = subcommands

        elif re.search(r'^\s{2}[A-Z][A-Z\s]+$', help_output, re.MULTILINE):
            # Custom format (like 'aztec start') - detected after ANSI stripping
            # Look for section headers like "  MISC", "  SANDBOX", etc.
            parsed = self.parse_custom_help(help_output)
            parsed["format"] = "custom"

        else:
            # Unknown format, just store raw
            parsed = {
                "format": "raw",
                "raw_help": help_output
            }

        return parsed

    def scan(self) -> Dict[str, Any]:
        """Start the recursive scan from the base command."""
        return {
            "command": self.base_command,
            "scanned_at": subprocess.check_output(['date']).decode().strip(),
            "data": self.scan_command([self.base_command])
        }


def main():
    parser = argparse.ArgumentParser(description='Generate CLI documentation from help output')
    parser.add_argument('--output', '-o', required=True, help='Output file path')
    parser.add_argument('--format', '-f', choices=['json', 'yaml'], default='json',
                        help='Output format (default: json)')
    parser.add_argument('--command', '-c', default='aztec',
                        help='Base command to scan (default: aztec)')

    args = parser.parse_args()

    # Check YAML support
    if args.format == 'yaml' and not YAML_AVAILABLE:
        print("Error: YAML format requires PyYAML. Install it with: pip install pyyaml")
        print("Falling back to JSON format...")
        args.format = 'json'
        if not args.output.endswith('.json'):
            args.output = args.output.replace('.yaml', '.json').replace('.yml', '.json')

    # Scan the CLI
    scanner = CLIScanner(base_command=args.command)
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
