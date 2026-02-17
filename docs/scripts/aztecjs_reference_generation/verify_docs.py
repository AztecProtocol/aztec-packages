#!/usr/bin/env python3
"""
Verify generated API documentation for production readiness.
Checks for:
- [object Object] artifacts
- Inconsistent spacing (3+ consecutive blank lines)
- Unclosed code blocks
- Incorrect heading hierarchy
- Missing required sections
"""

import re
import sys
from pathlib import Path
from typing import List, Tuple


class DocVerifier:
    def __init__(self, file_path: str):
        self.file_path = file_path
        self.lines = []
        self.issues = []

    def load_file(self):
        """Load the documentation file."""
        with open(self.file_path, 'r', encoding='utf-8') as f:
            self.lines = f.readlines()

    def check_object_artifacts(self):
        """Check for [object Object] patterns."""
        for i, line in enumerate(self.lines, start=1):
            if '[object Object]' in line or '[object object]' in line.lower():
                self.issues.append((i, 'ERROR', f'Found [object Object] artifact: {line.strip()}'))

    def check_spacing(self):
        """Check for excessive blank lines (3+ consecutive)."""
        consecutive_blank = 0
        blank_start = 0

        for i, line in enumerate(self.lines, start=1):
            if line.strip() == '':
                if consecutive_blank == 0:
                    blank_start = i
                consecutive_blank += 1
            else:
                if consecutive_blank >= 3:
                    self.issues.append((blank_start, 'WARNING', f'Excessive blank lines: {consecutive_blank} consecutive blank lines starting at line {blank_start}'))
                consecutive_blank = 0

    def check_code_blocks(self):
        """Check that all code blocks are properly closed."""
        in_code_block = False
        code_block_start = 0

        for i, line in enumerate(self.lines, start=1):
            if line.strip().startswith('```'):
                if in_code_block:
                    in_code_block = False
                else:
                    in_code_block = True
                    code_block_start = i

        if in_code_block:
            self.issues.append((code_block_start, 'ERROR', f'Unclosed code block starting at line {code_block_start}'))

    def check_heading_hierarchy(self):
        """Check heading levels follow proper hierarchy (H1→H2→H3→H4→H5)."""
        heading_pattern = re.compile(r'^(#{1,6})\s+(.+)$')
        previous_level = 0

        for i, line in enumerate(self.lines, start=1):
            match = heading_pattern.match(line)
            if match:
                current_level = len(match.group(1))
                heading_text = match.group(2).strip()

                # Skip the main title (H1)
                if current_level == 1:
                    previous_level = 1
                    continue

                # Check if we're skipping levels (e.g., H2 → H4)
                if current_level > previous_level + 1 and previous_level > 0:
                    self.issues.append((i, 'WARNING', f'Skipped heading level: H{previous_level} → H{current_level} at "{heading_text}"'))

                previous_level = current_level

    def check_section_structure(self):
        """Check that Type/Interface/Class sections have required subsections."""
        section_pattern = re.compile(r'^####\s+(.+)$')
        type_label_pattern = re.compile(r'^\*\*Type:\*\*\s+(.+)$')
        signature_pattern = re.compile(r'^\*\*Signature:\*\*')

        current_section = None
        current_line = 0
        has_type_label = False
        has_signature = False

        for i, line in enumerate(self.lines, start=1):
            # New H4 section (export)
            if section_pattern.match(line):
                # Check previous section
                if current_section:
                    if not has_type_label:
                        self.issues.append((current_line, 'WARNING', f'Section "{current_section}" missing **Type:** label'))
                    if not has_signature:
                        self.issues.append((current_line, 'INFO', f'Section "{current_section}" missing **Signature:**'))

                current_section = section_pattern.match(line).group(1).strip()
                current_line = i
                has_type_label = False
                has_signature = False

            # Check for type label
            if type_label_pattern.match(line):
                has_type_label = True

            # Check for signature
            if signature_pattern.match(line):
                has_signature = True

    def check_empty_sections(self):
        """Check for empty parameter/returns sections."""
        param_pattern = re.compile(r'^\*\*Parameters:\*\*\s*$')
        returns_pattern = re.compile(r'^\*\*Returns:\*\*\s*$')

        for i, line in enumerate(self.lines, start=1):
            if param_pattern.match(line):
                # Check if next non-empty line is another section or heading
                next_idx = i
                while next_idx < len(self.lines):
                    next_line = self.lines[next_idx].strip()
                    if next_line:
                        if next_line.startswith('**') or next_line.startswith('#'):
                            self.issues.append((i, 'WARNING', f'Empty **Parameters:** section'))
                        break
                    next_idx += 1

            if returns_pattern.match(line):
                # Check if next non-empty line is another section or heading
                next_idx = i
                while next_idx < len(self.lines):
                    next_line = self.lines[next_idx].strip()
                    if next_line:
                        if next_line.startswith('**') or next_line.startswith('#'):
                            self.issues.append((i, 'WARNING', f'Empty **Returns:** section'))
                        break
                    next_idx += 1

    def check_double_dashes(self):
        """Check for double dashes in descriptions (- -)."""
        double_dash_pattern = re.compile(r'-\s+-\s+')

        for i, line in enumerate(self.lines, start=1):
            if double_dash_pattern.search(line):
                self.issues.append((i, 'WARNING', f'Double dash found: {line.strip()}'))

    def verify_all(self):
        """Run all verification checks."""
        print(f"Verifying {self.file_path}...")
        print()

        self.load_file()

        self.check_object_artifacts()
        self.check_spacing()
        self.check_code_blocks()
        self.check_heading_hierarchy()
        self.check_section_structure()
        self.check_empty_sections()
        self.check_double_dashes()

        return self.report()

    def report(self) -> bool:
        """Print verification report and return True if no errors."""
        if not self.issues:
            print("✅ All checks passed! Documentation is production-ready.")
            return True

        # Sort by line number
        self.issues.sort(key=lambda x: x[0])

        # Group by severity
        errors = [i for i in self.issues if i[1] == 'ERROR']
        warnings = [i for i in self.issues if i[1] == 'WARNING']
        info = [i for i in self.issues if i[1] == 'INFO']

        print(f"Found {len(self.issues)} issues:")
        print(f"  - {len(errors)} ERRORS")
        print(f"  - {len(warnings)} WARNINGS")
        print(f"  - {len(info)} INFO")
        print()

        if errors:
            print("=" * 80)
            print("ERRORS (must fix):")
            print("=" * 80)
            for line, severity, message in errors:
                print(f"Line {line}: {message}")
            print()

        if warnings:
            print("=" * 80)
            print("WARNINGS (should review):")
            print("=" * 80)
            for line, severity, message in warnings:
                print(f"Line {line}: {message}")
            print()

        if info:
            print("=" * 80)
            print("INFO (optional improvements):")
            print("=" * 80)
            for line, severity, message in info:
                print(f"Line {line}: {message}")
            print()

        return len(errors) == 0


def main():
    if len(sys.argv) < 2:
        print("Usage: python verify_docs.py <path_to_markdown_file>")
        sys.exit(1)

    file_path = sys.argv[1]

    if not Path(file_path).exists():
        print(f"Error: File not found: {file_path}")
        sys.exit(1)

    verifier = DocVerifier(file_path)
    success = verifier.verify_all()

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
