---
name: pr-review
description: Review a pull request and post one visual GitHub-markdown review comment (verdict, risk table, mermaid flow, collapsible findings, suggestion blocks inline). Use as `/pr-review <owner/repo>/pull/<n>` or `/pr-review <n>`; CI runs it when the owner comments `/review` or marks their PR ready for review.
allowed-tools: Read, Write, Grep, Glob, Bash(gh pr view:*), Bash(gh pr diff:*), Bash(gh pr comment:*), Bash(gh pr checks:*), Bash(git log:*), Bash(git diff:*), mcp__github_inline_comment__create_inline_comment
---

# PR review

Review the pull request named in the arguments and publish the result as
**one** summary comment plus inline comments on specific lines. The reader
skims on GitHub: the verdict and the riskiest finding must be visible without
scrolling or expanding anything.

## 1. Gather

```sh
gh pr view <pr> --json title,body,author,isDraft,state,baseRefName,headRefName,files,additions,deletions,commits
gh pr diff <pr>
gh pr checks <pr>        # may be pending; note it, don't wait
gh pr view <pr> --json comments --jq '.comments[] | select(.body | test("^(<!-- claude-review|## 🔍 Claude review)"))'
```

Stop without posting if the PR is closed. A draft is reviewed: CI only runs
this when asked.

If the last of those comments exists, this is a **repeat review**. Its first
line is `<!-- claude-review sha=<full sha> -->`, the head it reviewed (older
comments lack it; take the short sha from their `Reviewed at` footer). Read
what changed since:

```sh
git log --oneline <sha>..HEAD
git diff <sha> HEAD
```

If `<sha>` isn't in the history (the branch was rebased or force-pushed), say
so in one line and review the whole PR as if it were the first time.

Read the changed files in full where the diff alone hides context. Follow
`AGENTS.md`: commit subjects are imperative sentences, every non-merge commit
carries a `Changelog:` trailer, `fallow` gates dead code and complexity, and
new code reads like the code around it.

## 2. Judge

Look for, in this order: correctness bugs, security, behaviour the tests
don't cover, breaking changes to the plugin's public API or options,
performance, then readability. Only report a finding you can point to a line
for and explain the concrete failure. No praise filler, no style nits that
`vp check` already enforces.

Severity:

| Level   | Emoji | Meaning                                                          |
| ------- | ----- | ---------------------------------------------------------------- |
| blocker | 🔴    | Wrong behaviour, data loss, security hole. Must fix before merge |
| major   | 🟠    | Likely bug or missing test for risky path                        |
| minor   | 🟡    | Worth fixing, safe to merge without                              |
| nit     | ⚪    | Optional polish                                                  |

On a repeat review, settle each earlier finding first, against the current
code: ✅ **fixed**, ⏳ **still open**, or ➖ **no longer applies** (the code it
pointed at is gone). Then review the commits since `<sha>` for new findings,
including ones the fixes introduced. Don't re-raise a finding the author
answered in a PR comment unless the answer is wrong, and say why.

Verdict: **🔴 Changes requested** if any blocker, **🟡 Approve with
comments** if only major/minor, **🟢 Looks good** otherwise.

## 3. Inline comments

For each new blocker and major finding, call
`mcp__github_inline_comment__create_inline_comment` on the exact line. When the
fix is a few lines, include a GitHub suggestion block so the author can apply
it with one click:

````md
🟠 **`flush()` runs before the queue is drained**

`pending` is cleared on line 42, so a second `update()` in the same tick is lost.

```suggestion
const batch = pending.splice(0)
```
````

Minor and nit findings go only in the summary. A finding carried over from
the previous review already has its inline comment; don't post it again.

## 4. Summary comment

Post with `gh pr comment <pr> --edit-last --create-if-none --body-file review.md`
so a repeat review replaces the previous one instead of stacking a new one. Write
the body to `review.md` in the working directory first (never commit it). Use this shape; drop any section that would
be empty:

````md
<!-- claude-review sha=HEAD_SHA -->

## 🔍 Claude review · 🟡 Approve with comments

> [!WARNING]
> One-sentence headline of the riskiest finding, or "No blocking issues." in a `[!TIP]` alert.

|           |                                                                |
| --------- | -------------------------------------------------------------- |
| **Scope** | `+120 −34` across 6 files · 3 commits                          |
| **Risk**  | 🟢 low · 🟡 medium · 🔴 high — pick one, say why in five words |
| **Tests** | ✅ covered · ⚠️ partial · ❌ missing                           |
| **CI**    | ✅ passing · ⏳ pending · ❌ failing                           |

### What changed

Two or three sentences in plain language, from the plugin user's side.

```mermaid
flowchart LR
  A[changed module] --> B[affected caller]
```

Include the diagram only when the PR changes how modules talk to each other or
adds a flow; keep it under ten nodes.

### Since the last review

Repeat reviews only. One line on what the commits since `PREV_SHA_SHORT`
did, then the earlier findings:

|     | Earlier finding | Now                   |
| --- | --------------- | --------------------- |
| 🟡  | Short claim     | ✅ fixed in `abc1234` |
| ⚪  | Short claim     | ⏳ still open         |

Keep the details of a fixed finding out of the comment; a still-open one
moves back into **Findings** below.

### Findings

|     | Finding     | Where                                                                     |
| --- | ----------- | ------------------------------------------------------------------------- |
| 🔴  | Short claim | [`src/x.ts:42`](https://github.com/OWNER/REPO/blob/HEAD_SHA/src/x.ts#L42) |
| 🟡  | Short claim | `src/y.ts:7`                                                              |

<details>
<summary>🟡 <b>Short claim</b> — <code>src/y.ts:7</code></summary>

What breaks, for which input, and the fix.

</details>

### Checklist

- [x] Commit subjects are imperative sentences
- [ ] Every commit has a `Changelog:` trailer
- [x] New behaviour has tests
- [x] No public API change, or it is documented

<sub>Reviewed at <code>HEAD_SHA_SHORT</code> · comment <code>/review</code> to review again</sub>
````

Formatting rules (GitHub-flavoured markdown):

- Alerts: `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`. One
  at the top, at most one more for a breaking change (`[!CAUTION]`).
- Put a blank line after `<summary>` and before `</details>`, or the markdown
  inside won't render.
- Link lines with the full head SHA, not a branch name, so links survive
  force-pushes.
- Use `diff` code fences to show before/after when a suggestion block doesn't
  fit (multi-file or not a line edit).
- Keep the visible part (above the first `<details>`) under ~25 lines.
- The `<!-- claude-review sha=… -->` line stays first: the next review finds
  this comment and its head by it.
