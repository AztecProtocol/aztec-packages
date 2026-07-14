#!/usr/bin/env python3
"""Lightweight CLI for CI run viewer - minimal dependencies for fast startup."""
import argparse
from rk_core import get_section_data, set_base_url

def main():
    parser = argparse.ArgumentParser(description='CI Run Viewer (CLI)')
    parser.add_argument('--section', '-s', type=str, required=True,
                        help='Section to display (next, prs, releases)')
    parser.add_argument('--offset', type=int, default=0, help='Offset for pagination')
    parser.add_argument('--limit', '-l', type=int, default=200, help='Number of results to fetch')
    parser.add_argument('--filter', '-f', dest='filter_str', type=str, default='',
                        help='Filter pattern (comma-separated)')
    parser.add_argument('--filter-prop', '-p', type=str, default='',
                        help='Property to filter on (status,name,author,msg)')

    args = parser.parse_args()

    set_base_url("http://ci.aztec-labs.com")
    output = get_section_data(args.section, args.offset, args.limit, args.filter_str, args.filter_prop)
    print(output, end='')

if __name__ == '__main__':
    main()
