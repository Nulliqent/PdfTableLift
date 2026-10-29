---
name: commit-convention-comply
description: Write and check git commit messages for PdfTableLift so they comply with the Conventional Commits 1.0.0 specification (type(scope)!: description, optional body, git-trailer footers, BREAKING CHANGE), plus a Refs footer for user-story IDs like US-14. Use this whenever you are about to run git commit, draft or reword a commit message, squash or amend commits, split work into commits, or review whether existing commit messages follow the convention, even if the user just says "commit this", "save my work" or "write a commit message" without naming a convention.
---

# Commit convention

Every commit in this repo must comply with the [Conventional Commits 1.0.0 specification](https://www.conventionalcommits.org/en/v1.0.0/#specification). The spec makes the history machine-readable: tools can derive changelogs and semantic version bumps from it (`fix` → PATCH, `feat` → MINOR, breaking change → MAJOR). That only works if every commit parses, so the spec rules below are hard requirements. The house style further down is a preference that keeps the history pleasant to read.

## Structure

```
<type>[optional scope][!]: <description>

[optional body]

[optional footer(s)]
```

## Spec rules (must comply)

These restate the numbered rules of the specification. If anything here seems to disagree with the spec, the spec wins.

**Header**
1. The header is a **type** (a noun such as `feat` or `fix`), then an optional **scope**, then an optional `!`, then the required **colon and space** `: `.
2. Use `feat` when the commit adds a new feature. Use `fix` when it fixes a bug. Don't use them for anything else, because version tooling reads them.
3. A scope is optional. If present, it's a noun describing a section of the codebase in parentheses: `fix(parser): ...`.
4. The **description**, a short summary of the change, must follow the `: ` immediately.
5. Other types (`docs`, `refactor`, …) are allowed. Type, scope, and footer tokens are case-insensitive, except `BREAKING CHANGE`, which must be uppercase.

**Body**

6. A body is optional. If present, it begins **one blank line** after the description. It is free-form and may contain any number of paragraphs.

**Footers**

7. Footers are optional. If present, they begin **one blank line** after the body (or after the description when there's no body).
8. Each footer is a **word token**, then a separator `: ` or ` #`, then a value. This follows the git trailer convention, e.g. `Refs: US-14`, `Reviewed-by: Z`, `Fixes #12`.
9. Footer tokens use `-` instead of spaces (`Acked-by`, not `Acked by`). The only exception is `BREAKING CHANGE`.
10. A footer value may contain spaces and newlines. It runs until the next `token: ` or `token #` line.

**Breaking changes**

11. A breaking change must be marked with a `!` in the header, a `BREAKING CHANGE:` footer, or both.
12. The footer form is uppercase `BREAKING CHANGE`, a colon, a space, then a description. `BREAKING-CHANGE` means the same thing.
13. The `!` goes immediately before the `:`, e.g. `feat(api)!: ...`. When `!` is used, the footer may be omitted, but then the description itself must describe the breaking change.

**Reverts** (spec FAQ): use the `revert` type and a `Refs:` footer listing the reverted commit SHAs:
```
revert: let us never again speak of the noodle incident

Refs: 676104e, a215868
```

## House style (should follow)

The spec doesn't require these rules, but this repo prefers them. The checker reports them as warnings, which don't fail the check.

- **Types:** use one of `feat`, `fix`, `perf`, `refactor`, `style`, `test`, `docs`, `build`, `ci`, `chore`, `revert`, written in lowercase. `style` is for formatting only: visual or CSS design changes are `feat` or `fix`. Pick the type a changelog reader would file the change under. If a commit needs two types, it's probably two commits.
- **Scopes:** use a short lowercase noun a teammate would recognize, e.g. `detect`, `sections`, `export`, `ui`, `slider`, `stories`. Reuse scopes already in `git log`. Omit the scope when a change spans several areas.
- **Description:** use the imperative mood (`add`, not `added`) and start with a lowercase letter unless it's an acronym like `PDF`. No trailing period. Keep the header at 72 characters or fewer so `git log --oneline` and GitHub don't truncate it. Say what changes, not `update stuff` or `wip`.
- **Breaking changes:** prefer `!` *and* a `BREAKING CHANGE:` footer that explains the migration. The `!` keeps the break visible in one-line logs, and the footer says what to do about it.
- **Body:** explain *why* and anything a reviewer can't see in the diff. Wrap lines at 72 characters. Skip the body for trivial changes.
- **User stories:** when a change implements or fixes a story in `docs/user-stories.md`, add a `Refs: US-14` footer (comma-separate several IDs). Look the ID up in that file instead of guessing. Leave the footer out if no story fits.
- **Footer order:** `BREAKING CHANGE`, then `Refs`, then attribution trailers such as `Co-Authored-By:`.

## One logical change per commit

Before committing, look at `git diff --staged`. If the staged work mixes unrelated changes, such as a detection fix and a README typo, suggest splitting it. Each commit should map to one type and be revertable on its own. If the user only asked for "a commit", don't split without asking.

## Workflow

1. Read the staged diff and `git log --oneline -20` to understand the change and the scopes already in use.
2. Decide the type and scope, and whether the change is breaking.
3. Look up matching user-story IDs in `docs/user-stories.md`.
4. Draft the message and validate it:
   ```bash
   python3 .claude/skills/commit-convention-comply/scripts/check_commit_msg.py <<'EOF'
   <message>
   EOF
   ```
   **Errors** are spec violations, so fix them before committing. **Warnings** are house style, so fix them unless there's a good reason not to. The script checks structure only. Choosing the right type and writing a meaningful description is still your job.
5. Commit with a heredoc so the blank lines survive:
   ```bash
   git commit -F - <<'EOF'
   feat(detect): recognize columns separated by runs of spaces

   Some PDFs store each table row as a single text string. Split those
   strings on runs of 2+ spaces so the rows are detected as tables.

   Refs: US-14
   EOF
   ```

To audit existing history, for example before opening a PR, run `check_commit_msg.py --range main..HEAD`.

## Examples

```
fix(sections): keep wrapped cell text in right-aligned columns

Refs: US-11
```

```
feat(export)!: name CSV files after the source PDF

Previously every export was saved as table.csv.

BREAKING CHANGE: scripts that expect table.csv must use the PDF name.
Refs: US-22
```

```
docs(stories): mark release additions as new
```

Bad → good:

- `Fixed the slider.` → `fix(slider): re-run detection when value changes` (no type, so it isn't a valid header)
- `feat:add section column` → `feat(sections): add section column` (`:` must be followed by a space)
- `feat: x` + `breaking change: ...` → use uppercase `BREAKING CHANGE: ...`
- `docs: tidy readme` + `Refs: US-3` directly under the body with no blank line → the footer must start after a blank line
