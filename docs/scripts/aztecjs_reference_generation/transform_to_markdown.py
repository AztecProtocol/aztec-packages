#!/usr/bin/env python3
"""
Transform structured API documentation (JSON/YAML) into Markdown format.

Usage:
    python transform_to_markdown.py --input api_docs.yaml --output api-reference.md
    python transform_to_markdown.py --input api_docs.json --output api-reference.md --title "Custom Title"
"""

import json
import argparse
import re
from textwrap import indent
from typing import Dict, Any, List
from pathlib import Path

try:
    import yaml
    YAML_AVAILABLE = True
except ImportError:
    YAML_AVAILABLE = False


class HeadingSlugger:
    """
    Assigns the anchors Docusaurus generates for a document's headings.

    Docusaurus slugs headings with github-slugger: lowercase, drop punctuation, turn spaces into
    hyphens, then keep the result unique by appending `-1`, `-2` and so on. The suffix search walks
    the anchors already taken rather than counting repeats of the same text, so a heading that
    literally reads `wallet-1` takes that anchor away from the second `Wallet`. An anchor therefore
    depends on every heading before it, including ones nothing links to.
    """

    # Punctuation github-slugger drops. Its own table also covers non-ASCII punctuation, which no
    # heading generated from TypeScript sources has needed so far.
    PUNCTUATION = set("\\'!\"#$%&()*+,./:;<=>?@[]^`{|}~")

    def __init__(self):
        self.occurrences = {}

    def slug(self, heading_text: str) -> str:
        """
        Claim and return the anchor for the next heading, without its leading `#`.

        Examples, for a document whose earlier headings took none of these:
            `## Account` -> `account`
            `#### CAPABILITY_VERSION` -> `capability_version`
            `## Contract / Protocol_Contracts` -> `contract--protocol_contracts`
        """
        base = self.base_slug(heading_text)
        slug = base
        while slug in self.occurrences:
            self.occurrences[base] += 1
            slug = f"{base}-{self.occurrences[base]}"
        self.occurrences[slug] = 0
        return slug

    @classmethod
    def base_slug(cls, heading_text: str) -> str:
        """Slug a heading without regard for the anchors already taken."""
        slug = heading_text.lower().strip()
        slug = ''.join(c for c in slug if c not in cls.PUNCTUATION)
        return slug.replace(' ', '-')


class MarkdownGenerator:
    """Generates markdown documentation from structured API data."""

    def __init__(self, data: Dict[str, Any], config: Dict[str, Any] = None):
        self.data = data
        self.slugger = HeadingSlugger()
        self.headings: List[str] = []
        self.toc_entries: List[Dict[str, str]] = []
        # Merge provided config with defaults to ensure all config keys exist
        default_config = self.get_default_config()
        if config:
            default_config.update(config)
        self.config = default_config

    def get_default_config(self) -> Dict[str, Any]:
        """Default configuration for markdown generation."""
        return {
            "title": "API Reference",
            "include_toc": True,
            "include_metadata": True,
        }

    def generate(self) -> str:
        """Generate the complete markdown document."""
        sections = []

        # Title
        if self.config.get("title"):
            sections.append(f"{self.heading(1, self.config['title'])}\n")

        # Metadata
        if self.config.get("include_metadata"):
            metadata = self.data.get("metadata", {})
            if "package" in metadata:
                sections.append(f"*Package: {metadata['package']}*\n")
            if "generated_at" in metadata:
                sections.append(f"*Generated: {metadata['generated_at']}*\n")

        # Introduction
        sections.append(self.generate_introduction())

        # The table of contents links to anchors the body claims, so the body has to be generated
        # first. Its own heading still precedes the body in the document, and so claims its anchor
        # before any of them.
        folders = self.data.get("folders", [])
        toc_heading = ""
        if self.config.get("include_toc") and folders:
            toc_heading = f"{self.heading(2, 'Table of Contents')}\n"

        body = [self.generate_folder_section(folder) for folder in folders]

        if toc_heading:
            sections.append(toc_heading)
            sections.append(self.generate_main_toc())
            sections.append("\n---\n")

        sections.extend(body)

        markdown = "\n".join(sections)
        self.verify_headings(markdown)
        return markdown

    def generate_introduction(self) -> str:
        """Generate introduction text."""
        return """This document provides a comprehensive reference for all public APIs in the Aztec.js library.

Each section is organized by module, with classes, interfaces, types, and functions documented with their full signatures, parameters, and return types.
"""

    def generate_main_toc(self) -> str:
        """Generate the main table of contents from the anchors the body claimed."""
        lines = []

        for entry in self.toc_entries:
            indent = "" if entry["kind"] == "folder" else "  "
            lines.append(f"{indent}- [{entry['text']}](#{entry['anchor']})")

        return "\n".join(lines)

    def heading(self, level: int, text: str, toc_kind: str = "") -> str:
        """
        Render a heading and claim its anchor.

        Every heading in the document has to be rendered through here, in the order it appears,
        because each anchor depends on the ones already taken. Pass `toc_kind` to also list the
        heading in the table of contents.

        Args:
            level: Heading level, as a count of `#`s
            text: The heading text, as it is rendered
            toc_kind: "folder" or "export" to list this heading in the table of contents

        Returns:
            The rendered heading line
        """
        anchor = self.slugger.slug(text)
        self.headings.append(text)
        if toc_kind:
            self.toc_entries.append({"kind": toc_kind, "text": text, "anchor": anchor})
        return f"{'#' * level} {text}"

    def verify_headings(self, markdown: str) -> None:
        """
        Check that the document's headings are exactly the ones that claimed an anchor.

        A heading written as a plain string never reaches the slugger, so it takes an anchor the
        generator does not know about and silently shifts the suffix of every later duplicate. That
        misdirects table of contents links rather than breaking them, which nothing downstream
        detects: the links still resolve, just to the wrong section.
        """
        rendered = []
        in_code_block = False
        for line in markdown.split("\n"):
            if line.lstrip().startswith("```"):
                in_code_block = not in_code_block
                continue
            if in_code_block:
                continue
            match = re.match(r'^(#{1,6}) (.*)$', line)
            if match:
                rendered.append(match.group(2))

        if rendered != self.headings:
            for claimed, found in zip(self.headings, rendered):
                if claimed != found:
                    raise ValueError(
                        f"Heading {found!r} did not claim an anchor; expected {claimed!r}. "
                        "Render every heading through MarkdownGenerator.heading()."
                    )
            missing = self.headings[len(rendered):] or rendered[len(self.headings):]
            raise ValueError(
                f"The document and the claimed anchors disagree on {len(missing)} trailing "
                f"heading(s), starting at {missing[0]!r}."
            )

    def format_description(self, jsdoc: Dict[str, Any]) -> List[str]:
        """
        Render an entry's description, behind a deprecation notice when it carries one.

        A doc comment that is only a `@deprecated` tag leaves the description empty, so without
        this the entry reads as though nothing were wrong with it.
        """
        sections = []

        deprecated = next((tag for tag in jsdoc.get("tags", []) if tag.get("name") == "deprecated"), None)
        if deprecated is not None:
            note = deprecated.get("text", "").strip()
            sections.append(f"**Deprecated:** {note}\n" if note else "**Deprecated**\n")

        if jsdoc.get("description"):
            sections.append(f"{jsdoc['description']}\n")

        return sections

    def generate_folder_section(self, folder: Dict[str, Any]) -> str:
        """Generate documentation for a folder."""
        folder_name = folder.get("name", "")
        folder_path = folder.get("path", folder_name)  # Full path for nested folders

        sections = []
        # Use full path for nested directories, capitalize just the display
        folder_display = folder_path.replace('/', ' / ').title()
        sections.append(f"\n{self.heading(2, folder_display, toc_kind='folder')}\n")

        # Folder description if available
        if "description" in folder:
            sections.append(f"{folder['description']}\n")

        # Generate documentation for each file
        for file in folder.get("files", []):
            sections.append(self.generate_file_section(file))

        return "\n".join(sections)

    def generate_file_section(self, file: Dict[str, Any]) -> str:
        """Generate documentation for a file."""
        file_path = file.get("path", "")
        exports = file.get("exports", [])

        # Skip if no exports
        if not exports:
            return ""

        sections = []

        # Add file-level separator and header (only if there are exports)
        sections.append("\n---\n")
        sections.append(f"{self.heading(3, f'`{file_path}`')}\n")

        # Generate documentation for each export
        for export in exports:
            sections.append(self.generate_export_section(export))

        return "\n".join(sections)

    def generate_export_section(self, export: Dict[str, Any]) -> str:
        """Generate documentation for an export (class, interface, type, function)."""
        kind = export.get("kind", "")
        name = export.get("name", "")

        if kind == "class":
            return self.generate_class_docs(export)
        elif kind == "interface":
            return self.generate_interface_docs(export)
        elif kind == "type":
            return self.generate_type_docs(export)
        elif kind == "function":
            return self.generate_function_docs(export)
        elif kind == "const":
            return self.generate_const_docs(export)
        else:
            return ""

    def generate_class_docs(self, cls: Dict[str, Any]) -> str:
        """Generate documentation for a class."""
        name = cls.get("name", "")

        sections = []
        sections.append(f"\n{self.heading(4, name, toc_kind='export')}\n")
        sections.append(f"**Type:** Class\n")

        # Description
        jsdoc = cls.get("jsdoc", {})
        sections.extend(self.format_description(jsdoc))

        # Heritage
        extends = cls.get("extends", [])
        implements = cls.get("implements", [])

        if extends:
            sections.append(f"**Extends:** {', '.join(f'`{e}`' for e in extends)}\n")
        if implements:
            sections.append(f"**Implements:** {', '.join(f'`{i}`' for i in implements)}\n")

        # Members
        members = cls.get("members", [])
        if members:
            # Group members by kind
            constructors = [m for m in members if m and m.get("kind") == "constructor"]
            properties = [m for m in members if m and m.get("kind") == "property"]
            methods = [m for m in members if m and m.get("kind") == "method"]
            getters = [m for m in members if m and m.get("kind") == "getter"]
            setters = [m for m in members if m and m.get("kind") == "setter"]

            # Constructor
            if constructors:
                sections.append(f"\n{self.heading(4, 'Constructor')}\n")
                for constructor in constructors:
                    sections.append(self.generate_constructor_docs(constructor))

            # Properties
            if properties:
                sections.append(f"\n{self.heading(4, 'Properties')}\n")
                for prop in properties:
                    sections.append(self.generate_property_docs(prop))

            # Methods
            if methods:
                sections.append(f"\n{self.heading(4, 'Methods')}\n")
                for method in methods:
                    sections.append(self.generate_method_docs(method))

            # Getters
            if getters:
                sections.append(f"\n{self.heading(4, 'Getters')}\n")
                for getter in getters:
                    sections.append(self.generate_accessor_docs(getter))

            # Setters
            if setters:
                sections.append(f"\n{self.heading(4, 'Setters')}\n")
                for setter in setters:
                    sections.append(self.generate_accessor_docs(setter))

        return "\n".join(sections)

    def generate_interface_docs(self, iface: Dict[str, Any]) -> str:
        """Generate documentation for an interface."""
        name = iface.get("name", "")

        sections = []
        sections.append(f"\n{self.heading(4, name, toc_kind='export')}\n")
        sections.append(f"**Type:** Interface\n")

        # Description
        jsdoc = iface.get("jsdoc", {})
        sections.extend(self.format_description(jsdoc))

        # Extends
        extends = iface.get("extends", [])
        if extends:
            sections.append(f"**Extends:** {', '.join(f'`{e}`' for e in extends)}\n")

        # Members
        members = iface.get("members", [])
        if members:
            # Group members by kind
            properties = [m for m in members if m and m.get("kind") == "property"]
            methods = [m for m in members if m and m.get("kind") == "method"]
            call_sigs = [m for m in members if m and m.get("kind") == "call-signature"]

            # Properties
            if properties:
                sections.append(f"\n{self.heading(4, 'Properties')}\n")
                for prop in properties:
                    sections.append(self.generate_property_docs(prop))

            # Methods
            if methods:
                sections.append(f"\n{self.heading(4, 'Methods')}\n")
                for method in methods:
                    sections.append(self.generate_method_docs(method))

            # Call signatures
            if call_sigs:
                sections.append(f"\n{self.heading(4, 'Call Signatures')}\n")
                for sig in call_sigs:
                    sections.append(self.generate_call_signature_docs(sig))

        return "\n".join(sections)

    def generate_type_docs(self, type_alias: Dict[str, Any]) -> str:
        """Generate documentation for a type alias."""
        name = type_alias.get("name", "")
        signature = type_alias.get("signature", "")
        jsdoc = type_alias.get("jsdoc", {})
        members = type_alias.get("members", [])

        sections = []
        sections.append(f"\n{self.heading(4, name, toc_kind='export')}\n")
        sections.append(f"**Type:** Type Alias\n")

        sections.extend(self.format_description(jsdoc))

        sections.append("**Signature:**\n")
        sections.append(f"```typescript\n{signature}\n```")

        # Type members (for object-like types)
        if members:
            # Group members by kind
            properties = [m for m in members if m and m.get("kind") == "property"]
            methods = [m for m in members if m and m.get("kind") == "method"]
            call_sigs = [m for m in members if m and m.get("kind") == "call-signature"]
            index_sigs = [m for m in members if m and m.get("kind") == "index-signature"]
            mapped_types = [m for m in members if m and m.get("kind") == "mapped-type"]

            has_section_header = False

            # Properties
            if properties:
                sections.append("\n**Type Members:**\n")
                has_section_header = True
                for prop in properties:
                    sections.append(self.generate_property_docs(prop).lstrip('\n'))

            # Methods
            if methods:
                if not has_section_header:
                    sections.append("\n**Type Members:**\n")
                    has_section_header = True
                for method in methods:
                    sections.append(self.generate_method_docs(method).lstrip('\n'))

            # Index signatures
            if index_sigs:
                if not has_section_header:
                    sections.append("\n**Type Members:**\n")
                    has_section_header = True
                for sig in index_sigs:
                    sections.append(self.generate_index_signature_docs(sig).lstrip('\n'))

            # Mapped types
            if mapped_types:
                if not has_section_header:
                    sections.append("\n**Type Members:**\n")
                    has_section_header = True
                for mapped in mapped_types:
                    sections.append(self.generate_mapped_type_docs(mapped).lstrip('\n'))

            # Call signatures
            if call_sigs:
                if not has_section_header:
                    sections.append("\n**Type Members:**\n")
                for sig in call_sigs:
                    sections.append(self.generate_call_signature_docs(sig).lstrip('\n'))

        return "\n".join(sections)

    def generate_function_docs(self, func: Dict[str, Any]) -> str:
        """Generate documentation for a function."""
        name = func.get("name", "")
        signature = func.get("signature", "")
        jsdoc = func.get("jsdoc", {})
        parameters = func.get("parameters", [])
        return_type = func.get("returnType", "")
        return_description = func.get("returnDescription", "")

        sections = []
        sections.append(f"\n{self.heading(4, name, toc_kind='export')}\n")
        sections.append(f"**Type:** Function\n")

        sections.extend(self.format_description(jsdoc))

        sections.append("**Signature:**\n")
        sections.append(f"```typescript\n{signature}\n```")

        # Parameters
        if parameters:
            sections.append(self.generate_parameters_table(parameters))

        # Returns
        if return_type and return_type != "void":
            sections.append(self.format_return_type(return_type, return_description))

        return "\n".join(sections)

    def generate_const_docs(self, const: Dict[str, Any]) -> str:
        """Generate documentation for a const."""
        name = const.get("name", "")
        signature = const.get("signature", "")
        jsdoc = const.get("jsdoc", {})
        const_type = const.get("type", "")

        sections = []
        sections.append(f"\n{self.heading(4, name, toc_kind='export')}\n")
        sections.append(f"**Type:** Constant\n")

        sections.extend(self.format_description(jsdoc))

        if const_type:
            sections.append(self.format_labeled_type("Value Type", const_type))

        return "\n".join(sections)

    def generate_constructor_docs(self, constructor: Dict[str, Any]) -> str:
        """Generate documentation for a constructor."""
        signature = constructor.get("signature", "")
        jsdoc = constructor.get("jsdoc", {})
        parameters = constructor.get("parameters", [])

        sections = []

        sections.extend(self.format_description(jsdoc))

        sections.append("**Signature:**\n")
        sections.append(f"```typescript\n{signature}\n```")

        if parameters:
            sections.append(self.generate_parameters_table(parameters))

        return "\n".join(sections)

    def generate_property_docs(self, prop: Dict[str, Any]) -> str:
        """Generate documentation for a property."""
        name = prop.get("name", "")
        prop_type = prop.get("type", "")
        signature = prop.get("signature", "")
        jsdoc = prop.get("jsdoc", {})
        is_readonly = prop.get("readonly", False)
        is_static = prop.get("static", False)
        is_optional = prop.get("optional", False)

        sections = []
        sections.append(f"\n{self.heading(5, name)}\n")

        sections.extend(self.format_description(jsdoc))

        sections.append(self.format_labeled_type("Type", prop_type))

        return "\n".join(sections)

    def generate_method_docs(self, method: Dict[str, Any]) -> str:
        """Generate documentation for a method."""
        name = method.get("name", "")
        signature = method.get("signature", "")
        jsdoc = method.get("jsdoc", {})
        parameters = method.get("parameters", [])
        return_type = method.get("returnType", "")
        return_description = method.get("returnDescription", "")
        is_static = method.get("static", False)
        is_async = method.get("async", False)

        sections = []
        sections.append(f"\n{self.heading(5, name)}\n")

        sections.extend(self.format_description(jsdoc))

        sections.append("**Signature:**\n")
        sections.append(f"```typescript\n{signature}\n```")

        # Parameters
        if parameters:
            sections.append(self.generate_parameters_table(parameters))

        # Returns
        if return_type:
            sections.append(self.format_return_type(return_type, return_description))

        return "\n".join(sections)

    def generate_accessor_docs(self, accessor: Dict[str, Any]) -> str:
        """Generate documentation for a getter/setter."""
        name = accessor.get("name", "")
        kind = accessor.get("kind", "")
        signature = accessor.get("signature", "")
        jsdoc = accessor.get("jsdoc", {})
        parameters = accessor.get("parameters", [])
        return_type = accessor.get("returnType", "")

        sections = []
        sections.append(f"\n{self.heading(5, f'{name} ({kind})')}\n")

        sections.extend(self.format_description(jsdoc))

        sections.append("**Signature:**\n")
        sections.append(f"```typescript\n{signature}\n```")

        if parameters:
            sections.append(self.generate_parameters_table(parameters))

        if return_type and kind == "getter":
            sections.append(self.format_return_type(return_type))

        return "\n".join(sections)

    def generate_call_signature_docs(self, sig: Dict[str, Any]) -> str:
        """Generate documentation for a call signature."""
        signature = sig.get("signature", "")
        jsdoc = sig.get("jsdoc", {})
        parameters = sig.get("parameters", [])
        return_type = sig.get("returnType", "")
        return_description = sig.get("returnDescription", "")

        sections = []

        sections.extend(self.format_description(jsdoc))

        sections.append("**Signature:**\n")
        sections.append(f"```typescript\n{signature}\n```")

        if parameters:
            sections.append(self.generate_parameters_table(parameters))

        if return_type:
            sections.append(self.format_return_type(return_type, return_description))

        return "\n".join(sections)

    def generate_index_signature_docs(self, sig: Dict[str, Any]) -> str:
        """Generate documentation for an index signature."""
        name = sig.get("name", "")
        signature = sig.get("signature", "")
        jsdoc = sig.get("jsdoc", {})
        value_type = sig.get("type", "any")

        sections = []
        sections.append(f"\n{self.heading(5, name)}\n")

        sections.extend(self.format_description(jsdoc))

        sections.append(self.format_labeled_type("Signature", signature))
        sections.append(self.format_labeled_type("Value Type", value_type))

        return "\n".join(sections)

    def generate_mapped_type_docs(self, mapped: Dict[str, Any]) -> str:
        """Generate documentation for a mapped type."""
        name = mapped.get("name", "")
        signature = mapped.get("signature", "")
        jsdoc = mapped.get("jsdoc", {})
        value_type = mapped.get("type", "any")
        key_type = mapped.get("keyType", "any")

        sections = []
        sections.append(f"\n{self.heading(5, name)}\n")

        sections.extend(self.format_description(jsdoc))

        sections.append(self.format_labeled_type("Signature", signature))
        sections.append(self.format_labeled_type("Key Type", key_type))
        sections.append(self.format_labeled_type("Value Type", value_type))

        return "\n".join(sections)

    def generate_parameters_table(self, parameters: List[Dict[str, Any]]) -> str:
        """Generate a markdown table for parameters."""
        if not parameters:
            return ""

        sections = []
        sections.append("\n**Parameters:**\n")

        for param in parameters:
            # Destructured parameters are declared over several lines; collapse them so the name
            # stays inside a single-line inline code span.
            name = " ".join(param.get("name", "").split())
            param_type = param.get("type", "")
            is_optional = param.get("optional", False)
            description = param.get("description", "")

            param_name = f"`{name}`"
            if is_optional:
                param_name += " (optional)"

            if '\n' in param_type:
                sections.append(f"- {param_name}:")
                if description:
                    sections.append(f"  - {description}")
                sections.append("")
                sections.append(indent(f"```typescript\n{param_type}\n```", "  "))
                sections.append("")
            else:
                sections.append(f"- {param_name}: `{param_type}`")
                if description:
                    sections.append(f"  - {description}")

        return "\n".join(sections)

    def format_labeled_type(self, label: str, type_str: str) -> str:
        """
        Format a `**Label:** <type>` line, using a code block when the type spans several lines.

        A multi-line type can contain blank lines, which terminate an inline code span and leave
        the type's braces and angle brackets to be parsed as MDX expressions and JSX tags.

        Args:
            label: The bold label preceding the type (e.g. "Type", "Value Type")
            type_str: The type string

        Returns:
            Formatted markdown string for the labeled type
        """
        if '\n' in type_str:
            return f"**{label}:**\n\n```typescript\n{type_str}\n```\n"
        return f"**{label}:** `{type_str}`\n"

    def format_return_type(self, return_type: str, return_description: str = "") -> str:
        """
        Format a return type for markdown documentation.
        Uses code blocks for multi-line types to avoid MDX parsing issues with braces.

        Args:
            return_type: The return type string
            return_description: Optional description of the return value

        Returns:
            Formatted markdown string for the return type section
        """
        if not return_type:
            return ""

        sections = []
        sections.append("\n**Returns:**\n")

        # Use code block for multi-line types to avoid MDX parsing issues
        if '\n' in return_type:
            sections.append(f"```typescript\n{return_type}\n```")
            if return_description:
                sections.append(f"\n{return_description}")
        else:
            return_line = f"`{return_type}`"
            if return_description:
                return_line += f" - {return_description}"
            sections.append(return_line)

        return "\n".join(sections)


def load_input_file(file_path: str) -> Dict[str, Any]:
    """Load JSON or YAML input file."""
    with open(file_path, 'r') as f:
        content = f.read()

    # Try to determine format from extension
    if file_path.endswith('.yaml') or file_path.endswith('.yml'):
        if not YAML_AVAILABLE:
            print("Error: PyYAML is required for YAML support. Install with: pip install pyyaml")
            exit(1)
        return yaml.safe_load(content)
    elif file_path.endswith('.json'):
        return json.loads(content)
    else:
        # Try JSON first, then YAML
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            if YAML_AVAILABLE:
                return yaml.safe_load(content)
            else:
                print("Error: Could not parse input file. Install PyYAML for YAML support.")
                exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="Transform structured API documentation to Markdown"
    )
    parser.add_argument(
        "--input", "-i",
        required=True,
        help="Input JSON/YAML file"
    )
    parser.add_argument(
        "--output", "-o",
        required=True,
        help="Output Markdown file"
    )
    parser.add_argument(
        "--title",
        help="Document title (overrides default)"
    )

    args = parser.parse_args()

    # Load input
    print(f"Loading input from {args.input}...")
    data = load_input_file(args.input)

    # Create config
    config = {}
    if args.title:
        config["title"] = args.title

    # Generate markdown
    print("Generating markdown documentation...")
    generator = MarkdownGenerator(data, config)
    markdown = generator.generate()

    # Write output
    with open(args.output, 'w') as f:
        f.write(markdown)

    print(f"Documentation written to: {args.output}")

    # Print statistics
    total_exports = sum(len(file['exports']) for folder in data.get('folders', []) for file in folder.get('files', []))
    print(f"Documented {len(data.get('folders', []))} modules with {total_exports} total exports")


if __name__ == "__main__":
    main()
