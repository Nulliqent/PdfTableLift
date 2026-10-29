#!/usr/bin/env python3
"""Check commit messages against Conventional Commits 1.0.0.

Errors are violations of the spec
(https://www.conventionalcommits.org/en/v1.0.0/#specification).
Warnings are this repo's house style and don't fail the check.

Usage:
  check_commit_msg.py [FILE]          check one message (FILE or stdin)
  check_commit_msg.py --range A..B    check every commit in a git range

Exits 0 when there are no errors, 1 otherwise.
"""
import re
import subprocess
import sys

HOUSE_TYPES = ["feat", "fix", "perf", "refactor", "style", "test",
               "docs", "build", "ci", "chore", "revert"]
# Spec 1, 4, 5, 13: type, optional (scope), optional !, then ": " and the description.
HEADER = re.compile(r"^(?P<type>[A-Za-z][\w-]*)(\((?P<scope>[^()]*)\))?(?P<bang>!)?: (?P<desc>.*)$")
# Spec 8, 9, 16: git-trailer style footer token followed by ": " or " #".
FOOTER = re.compile(r"^(?P<token>BREAKING CHANGE|BREAKING-CHANGE|[A-Za-z][\w-]*)(: | #)")
BREAKING_ANY_CASE = re.compile(r"^breaking[ -]change\s*:", re.I)
PAST_TENSE = re.compile(r"^(added|fixed|updated|removed|changed|created|made|implemented)\b", re.I)
REF_VALUE = re.compile(r"^(US-\d+|[0-9a-f]{7,40}|#\d+)$")
MAX_HEADER = 72


def check(message):
    """Return (errors, warnings) for one commit message."""
    lines = message.splitlines()
    while lines and not lines[-1].strip():
        lines.pop()
    if not lines or not lines[0].strip():
        return ["message is empty"], []

    errors, warnings = [], []
    header = lines[0]
    m = HEADER.match(header)
    if not m:
        return [f"header must be 'type[(scope)][!]: description' (spec 1); got {header!r}"], []

    type_, scope, desc = m["type"], m["scope"], m["desc"]
    if scope is not None and not scope.strip():
        errors.append("scope parentheses are empty; give a noun or drop them (spec 4)")
    if not desc.strip() or desc[0].isspace():
        errors.append("description must immediately follow ': ' (spec 5)")

    if type_.lower() not in HOUSE_TYPES:
        warnings.append(f"type {type_!r} isn't a house type: {', '.join(HOUSE_TYPES)}")
    elif type_ != type_.lower():
        warnings.append("write the type in lowercase")
    if scope and not re.fullmatch(r"[a-z0-9][a-z0-9-]*", scope):
        warnings.append(f"scope {scope!r} should be a short lowercase noun")
    if desc.strip():
        first_word = desc.split()[0]
        if desc[0].isupper() and not first_word.isupper():  # allow acronyms like PDF
            warnings.append("start the description with a lowercase letter")
        if desc.endswith("."):
            warnings.append("drop the trailing period from the description")
        if PAST_TENSE.match(desc):
            warnings.append("use the imperative mood ('add', not 'added')")
    if len(header) > MAX_HEADER:
        warnings.append(f"header is {len(header)} chars; keep it to {MAX_HEADER}")

    rest = lines[1:]
    if rest and rest[0].strip():
        errors.append("body/footers must begin one blank line after the description (spec 6)")

    # Footers are the trailing paragraphs that each open with a valid footer (spec 8, 10).
    paragraphs, current = [], []
    for line in rest:
        if line.strip():
            current.append(line)
        elif current:
            paragraphs.append(current)
            current = []
    if current:
        paragraphs.append(current)
    split = len(paragraphs)
    while split > 0 and FOOTER.match(paragraphs[split - 1][0]):
        split -= 1
    body_lines = [l for p in paragraphs[:split] for l in p]
    footers = [l for p in paragraphs[split:] for l in p]

    for line in body_lines:
        if FOOTER.match(line) and FOOTER.match(line)["token"] in (
                "BREAKING CHANGE", "BREAKING-CHANGE", "Refs"):
            errors.append(f"footer {line!r} must begin one blank line after the body (spec 8)")
    for line in body_lines + footers:
        if BREAKING_ANY_CASE.match(line) and not re.match(r"^BREAKING[ -]CHANGE: \S", line):
            errors.append(f"breaking change footer must be 'BREAKING CHANGE: <description>' "
                          f"in uppercase (spec 12, 15); got {line!r}")

    tokens = [FOOTER.match(l) for l in footers]
    has_breaking = any(t and t["token"] in ("BREAKING CHANGE", "BREAKING-CHANGE") for t in tokens)
    if has_breaking and not m["bang"]:
        warnings.append("add '!' to the header so the breaking change shows in one-line logs")

    for line in footers:
        t = FOOTER.match(line)
        if t and t["token"] == "Refs":
            for ref in line[len(t.group(0)):].split(","):
                if not REF_VALUE.match(ref.strip()):
                    warnings.append(f"Refs value {ref.strip()!r} should be a story ID like "
                                    f"US-14, a commit SHA, or #issue")
    return errors, warnings


def commits_in(rng):
    shas = subprocess.run(["git", "rev-list", "--reverse", rng], capture_output=True,
                          text=True, check=True).stdout.split()
    for sha in shas:
        msg = subprocess.run(["git", "log", "-1", "--format=%B", sha], capture_output=True,
                             text=True, check=True).stdout
        yield sha[:7], msg


def main(argv):
    if len(argv) == 2 and argv[0] == "--range":
        targets = list(commits_in(argv[1]))
    elif len(argv) <= 1:
        text = open(argv[0]).read() if argv else sys.stdin.read()
        # git strips '#' comment lines from a message being written
        text = "\n".join(l for l in text.splitlines() if not l.startswith("#"))
        targets = [("message", text)]
    else:
        print(__doc__)
        return 2

    failed = False
    for label, msg in targets:
        errors, warnings = check(msg)
        header = msg.splitlines()[0] if msg.strip() else ""
        failed = failed or bool(errors)
        print(f"{'✗' if errors else '✓'} {label}: {header}")
        for e in errors:
            print(f"    error: {e}")
        for w in warnings:
            print(f"    warning: {w}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
