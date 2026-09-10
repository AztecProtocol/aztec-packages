"""Apply .github/next-code-owners to a pull request, with CODEOWNERS semantics.

Usage: next_code_owners.py OWNERS_FILE CHANGED_PATHS_FILE PR_AUTHOR BASE_REF

Prints a JSON body for `POST /repos/{owner}/{repo}/pulls/{n}/requested_reviewers`,
or nothing when nobody should be requested. The reason is logged to stderr.

Matching follows GitHub's CODEOWNERS: for each changed path the *last* matching
pattern wins, and the reviewers are the union of those winners. Patterns are
gitignore-style — leading `/` anchors at the root, a trailing `/` means the whole
directory, `*` stays within a path segment, `**` crosses segments.
"""

import json
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
    rules = []
    with open(owners_file, encoding="utf-8") as handle:
        for line in handle:
            line = line.split("#", 1)[0].strip()
            if line:
                pattern, *owners = line.split()
                rules.append((pattern_to_regex(pattern), owners))
    return rules


def owners_for(path, rules):
    """Owners of the last pattern matching `path`; empty when none does."""
    winner = []
    for regex, owners in rules:
        if regex.match(path):
            winner = owners
    return winner


def main():
    owners_file, changed_file, author, base_ref = sys.argv[1:5]

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

    users, teams = [], []
    for path in changed:
        for owner in owners_for(path, rules):
            name = owner.lstrip("@")
            if "/" in name:  # @org/team
                target, name = teams, name.split("/", 1)[1]
            else:
                target = users
                if name == author:  # GitHub refuses to request the author
                    continue
            if name not in target:
                target.append(name)

    if not users and not teams:
        print("no changed path has an owner", file=sys.stderr)
        return 0
    body = {}
    if users:
        body["reviewers"] = users
    if teams:
        body["team_reviewers"] = teams
    print(json.dumps(body))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
