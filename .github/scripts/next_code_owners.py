"""Apply .github/next-code-owners to a pull request, with CODEOWNERS semantics.

Usage: next_code_owners.py OWNERS_FILE CHANGED_PATHS_FILE BASE_REF

Prints a Markdown comment that @-mentions the owners of the changed paths, one line
per owning rule so the author can see which paths brought in whom. Prints nothing
when nobody should be told, and logs the reason to stderr.

Matching follows GitHub's CODEOWNERS: for each changed path the *last* matching
pattern wins, and every rule that wins for some path gets a line. Patterns are
gitignore-style — leading `/` anchors at the root, a trailing `/` means the whole
directory, `*` stays within a path segment, `**` crosses segments.
"""

import re
import sys

# Where a merge train's own pull request lands. A train targets `next` unless its
# name is suffixed -v<N>, in which case it targets that release line. This mirrors
# the base_branch rule in .github/workflows/merge-train-create-pr.yml; keep them
# in step.
TRAIN_TO_RELEASE_LINE = re.compile(r"^merge-train/.*-v[0-9]+$")


def reaches_next(base_ref):
    if base_ref == "next":
        return True
    return base_ref.startswith("merge-train/") and not TRAIN_TO_RELEASE_LINE.match(base_ref)


def pattern_to_regex(pattern):
    anchored = pattern.startswith("/")
    directory_only = pattern.endswith("/")
    body = pattern.strip("/")

    parts = []
    for token in re.split(r"(\*\*/|\*\*|\*|\?)", body):
        if token == "**/":
            parts.append("(?:.*/)?")
        elif token == "**":
            parts.append(".*")
        elif token == "*":
            parts.append("[^/]*")
        elif token == "?":
            parts.append("[^/]")
        else:
            parts.append(re.escape(token))

    # As in gitignore: a pattern with no slash (`*.js`) matches at any depth; one
    # with a slash is relative to the root.
    prefix = "^" if anchored or "/" in body else "(?:^|.*/)"
    # A directory pattern matches everything beneath it. A file pattern also
    # matches a directory of that name, which is how CODEOWNERS treats `/docs`.
    suffix = "/.*" if directory_only else "(?:/.*)?$"
    return re.compile(prefix + "".join(parts) + suffix)


def load_rules(owners_file):
    """Each rule is (regex, pattern text, owners), in file order."""
    rules = []
    with open(owners_file, encoding="utf-8") as handle:
        for line in handle:
            line = line.split("#", 1)[0].strip()
            if line:
                pattern, *owners = line.split()
                rules.append((pattern_to_regex(pattern), pattern, owners))
    return rules


def winning_rule(path, rules):
    """Index of the last rule whose pattern matches `path`, or None."""
    winner = None
    for i, (regex, _, _) in enumerate(rules):
        if regex.match(path):
            winner = i
    return winner


def main():
    owners_file, changed_file, base_ref = sys.argv[1:4]

    if not reaches_next(base_ref):
        print(f"base {base_ref} does not reach next", file=sys.stderr)
        return 0
    try:
        rules = load_rules(owners_file)
    except FileNotFoundError:
        print(f"{owners_file} is absent on {base_ref}; nothing to apply", file=sys.stderr)
        return 0
    with open(changed_file, encoding="utf-8") as handle:
        changed = [line.strip() for line in handle if line.strip()]

    # One line per winning rule, in file order, so the author sees which of their
    # paths brought in which owners. A rule that names nobody owns nothing.
    winners = {winning_rule(path, rules) for path in changed} - {None}
    winners = [i for i in sorted(winners) if rules[i][2]]
    if not winners:
        print("no changed path has an owner", file=sys.stderr)
        return 0

    lines = [
        "This pull request touches code with owners listed in "
        "`.github/next-code-owners`. Tagging them for review:",
        "",
    ]
    for i in winners:
        _, pattern, owners = rules[i]
        lines.append(f"- {' '.join(owners)} — `{pattern}`")
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
