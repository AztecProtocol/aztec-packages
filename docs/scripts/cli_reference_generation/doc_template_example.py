"""
Example template configuration for CLI documentation generation.

You can customize this file to control the appearance and structure
of the generated markdown documentation.

Usage:
    python transform_to_markdown.py --input docs.json --output cli.md --template doc_template_example.py
"""

CONFIG = {
    # Document title
    "title": "Aztec CLI Reference",

    # Include table of contents
    "include_toc": True,

    # Include metadata (scan date, command name)
    "include_metadata": True,

    # Heading prefix for sections
    "heading_prefix": "#",

    # Show usage examples
    "show_usage": True,

    # Show environment variable mappings
    "show_env_vars": True,

    # Maximum depth to recurse into subcommands
    "max_depth": 5,

    # Format for option lists: "list" or "table"
    "option_table_format": "list",
}


# Advanced: You can also define custom rendering functions
# that will be used if present in the config module

def custom_header(cmd_name: str, depth: int) -> str:
    """
    Custom header renderer (optional).

    If defined, this function will be called instead of the default
    header rendering logic.
    """
    heading = "#" * (depth + 1)
    return f"{heading} `{cmd_name}` Command\n"


def custom_footer() -> str:
    """
    Custom footer to append to the document (optional).
    """
    return """
---

## Additional Resources

- [Aztec Documentation](https://docs.aztec.network)
- [GitHub Repository](https://github.com/AztecProtocol/aztec-packages)

*This documentation was auto-generated from CLI help output.*
"""
