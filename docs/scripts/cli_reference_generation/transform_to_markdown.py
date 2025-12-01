#!/usr/bin/env python3
"""
Transform structured CLI documentation (JSON/YAML) into Markdown format.

Usage:
    python transform_to_markdown.py --input docs.json --output cli-reference.md
    python transform_to_markdown.py --input docs.yaml --output cli-reference.md --template custom_template.py
"""

import json
import argparse
from typing import Dict, Any, List
from pathlib import Path
import importlib.util

try:
    import yaml
    YAML_AVAILABLE = True
except ImportError:
    YAML_AVAILABLE = False


class MarkdownGenerator:
    """Generates markdown documentation from structured CLI data."""

    def __init__(self, data: Dict[str, Any], config: Dict[str, Any] = None):
        self.data = data
        # Merge provided config with defaults
        default_config = self.get_default_config()
        if config:
            default_config.update(config)
        self.config = default_config

    def get_default_config(self) -> Dict[str, Any]:
        """Default configuration for markdown generation."""
        return {
            "title": "CLI Reference",
            "include_toc": True,
            "include_metadata": True,
            "heading_prefix": "#",
            "show_usage": True,
            "show_env_vars": True,
            "max_depth": 5,
            "option_table_format": "list",  # or "table"
        }

    def generate(self) -> str:
        """Generate the complete markdown document."""
        sections = []

        # Title
        if self.config.get("title"):
            sections.append(f"# {self.config['title']}\n")

        # Metadata
        if self.config.get("include_metadata") and "scanned_at" in self.data:
            sections.append(f"*Generated: {self.data['scanned_at']}*\n")
            sections.append(f"*Command: `{self.data['command']}`*\n")

        # Table of Contents
        if self.config.get("include_toc"):
            toc = self.generate_toc(self.data.get("data", {}), self.data.get("command", ""))
            if toc:
                sections.append("## Table of Contents\n")
                sections.append(toc)

        # Main content
        sections.append(self.generate_command_docs(
            self.data.get("command", ""),
            self.data.get("data", {}),
            depth=1
        ))

        return "\n".join(sections)

    def generate_toc(self, cmd_data: Dict[str, Any], cmd_name: str, depth: int = 0) -> str:
        """Generate table of contents."""
        if depth > self.config.get("max_depth", 5):
            return ""

        lines = []
        indent = "  " * depth

        # Add current command (even if it has errors - it will have a stub section)
        slug = self.slugify(cmd_name)
        lines.append(f"{indent}- [{cmd_name}](#{slug})")

        # Add subcommands
        if cmd_data.get("format") == "commander" and "subcommands" in cmd_data:
            for sub_name, sub_data in cmd_data["subcommands"].items():
                # Include all commands in TOC, even ones with errors
                full_name = f"{cmd_name} {sub_name}"
                sub_toc = self.generate_toc(sub_data, full_name, depth + 1)
                if sub_toc:
                    lines.append(sub_toc)

        return "\n".join(lines)

    def slugify(self, text: str) -> str:
        """Convert text to a markdown-friendly anchor."""
        return text.lower().replace(' ', '-').replace('/', '-')

    def escape_html_entities(self, text: str) -> str:
        """Escape HTML-like syntax (angle brackets) to prevent MDX parsing errors."""
        # Replace < and > with their HTML entities to prevent MDX from treating them as tags
        return text.replace('<', '&lt;').replace('>', '&gt;')

    def generate_command_docs(self, cmd_name: str, cmd_data: Dict[str, Any], depth: int = 1) -> str:
        """Generate documentation for a single command."""
        if depth > self.config.get("max_depth", 5):
            return ""

        # Handle commands with errors - still create section with note
        if "error" in cmd_data:
            heading = "#" * (depth + 1)
            error_type = cmd_data.get("error_type", "unknown")

            if error_type == "bigint_serialization":
                return f"{heading} {cmd_name}\n\n*Help for this command is currently unavailable due to a technical issue with option serialization.*\n\n"
            else:
                return f"{heading} {cmd_name}\n\n*This command help is currently unavailable due to a technical issue.*\n\n"

        sections = []
        heading = "#" * (depth + 1)

        # Command header
        sections.append(f"{heading} {cmd_name}\n")

        # Format-specific rendering
        if cmd_data.get("format") == "commander":
            sections.append(self.render_commander_command(cmd_data, depth))

            # Recursively render subcommands
            if "subcommands" in cmd_data:
                sections.append(f"\n{heading}# Subcommands\n")
                for sub_name, sub_data in cmd_data["subcommands"].items():
                    full_name = f"{cmd_name} {sub_name}"
                    sections.append(self.generate_command_docs(full_name, sub_data, depth + 1))

        elif cmd_data.get("format") == "custom":
            sections.append(self.render_custom_command(cmd_data, depth))

        elif cmd_data.get("format") == "raw":
            sections.append("```")
            sections.append(cmd_data.get("raw_help", ""))
            sections.append("```\n")

        return "\n".join(sections)

    def render_commander_command(self, cmd_data: Dict[str, Any], depth: int) -> str:
        """Render a Commander.js style command."""
        sections = []

        # Description
        if cmd_data.get("description"):
            sections.append(self.escape_html_entities(cmd_data["description"]) + "\n")

        # Usage
        if self.config.get("show_usage") and cmd_data.get("usage"):
            sections.append("**Usage:**")
            sections.append(f"```bash")
            sections.append(cmd_data["usage"])
            sections.append("```\n")

        # Commands list
        if cmd_data.get("commands"):
            sections.append("**Available Commands:**\n")
            for cmd in cmd_data["commands"]:
                sections.append(f"- `{cmd['signature']}` - {self.escape_html_entities(cmd['description'])}")
            sections.append("")

        # Options
        if cmd_data.get("options"):
            sections.append("**Options:**\n")
            if self.config.get("option_table_format") == "table":
                sections.append(self.render_options_table(cmd_data["options"]))
            else:
                sections.append(self.render_options_list(cmd_data["options"]))
            sections.append("")

        return "\n".join(sections)

    def render_custom_command(self, cmd_data: Dict[str, Any], depth: int) -> str:
        """Render a custom formatted command (like 'aztec start')."""
        sections = []

        if cmd_data.get("description"):
            sections.append(self.escape_html_entities(cmd_data["description"]) + "\n")

        # Render each section
        for section in cmd_data.get("sections", []):
            sections.append(f"**{section['name']}**\n")

            if section.get("options"):
                for opt in section["options"]:
                    # Option flag and default
                    opt_line = f"- `{opt['flag']}`"

                    if opt.get("default"):
                        opt_line += f" (default: `{opt['default']}`)"

                    sections.append(opt_line)

                    # Description
                    if opt.get("description"):
                        sections.append(f"  {self.escape_html_entities(opt['description'])}")

                    # Environment variable
                    if self.config.get("show_env_vars") and opt.get("env"):
                        sections.append(f"  *Environment: `${opt['env']}`*")

                    sections.append("")

        return "\n".join(sections)

    def render_options_table(self, options: List[Dict[str, Any]]) -> str:
        """Render options as a markdown table."""
        lines = [
            "| Option | Description |",
            "|--------|-------------|"
        ]

        for opt in options:
            flags = f"{opt.get('short', '')} {opt.get('long', '')}".strip()
            desc = self.escape_html_entities(opt.get('description', '')).replace('|', '\\|')
            lines.append(f"| `{flags}` | {desc} |")

        return "\n".join(lines)

    def render_options_list(self, options: List[Dict[str, Any]]) -> str:
        """Render options as a bulleted list."""
        lines = []

        for opt in options:
            flags = f"{opt.get('short', '')} {opt.get('long', '')}".strip()
            desc = self.escape_html_entities(opt.get('description', ''))

            lines.append(f"- `{flags}` - {desc}")

        return "\n".join(lines)


def load_config_from_file(config_path: str) -> Dict[str, Any]:
    """Load configuration from a Python file."""
    spec = importlib.util.spec_from_file_location("config", config_path)
    config_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(config_module)

    if hasattr(config_module, 'CONFIG'):
        return config_module.CONFIG
    elif hasattr(config_module, 'config'):
        return config_module.config
    else:
        raise ValueError("Config file must define CONFIG or config dictionary")


def main():
    parser = argparse.ArgumentParser(description='Transform CLI docs to Markdown')
    parser.add_argument('--input', '-i', required=True, help='Input JSON/YAML file')
    parser.add_argument('--output', '-o', required=True, help='Output Markdown file')
    parser.add_argument('--template', '-t', help='Optional Python config file for customization')
    parser.add_argument('--title', help='Document title (overrides config)')

    args = parser.parse_args()

    # Load input data
    with open(args.input, 'r') as f:
        if args.input.endswith('.yaml') or args.input.endswith('.yml'):
            if not YAML_AVAILABLE:
                print("Error: YAML input requires PyYAML. Install it with: pip install pyyaml")
                return
            data = yaml.safe_load(f)
        else:
            data = json.load(f)

    # Load config - start with defaults
    config = None
    if args.template:
        config = load_config_from_file(args.template)

    # Override title if provided
    if args.title:
        if config is None:
            config = {}
        config['title'] = args.title

    # Generate markdown - let MarkdownGenerator merge with defaults
    generator = MarkdownGenerator(data, config)
    markdown = generator.generate()

    # Write output
    with open(args.output, 'w') as f:
        f.write(markdown)

    print(f"Markdown documentation written to: {args.output}")


if __name__ == '__main__':
    main()
