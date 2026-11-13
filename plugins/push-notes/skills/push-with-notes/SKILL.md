---
name: push-with-notes
description: How to commit and push with push notes. Use for any git commit, push, pull request title or body, or merge. Pushes go through push-notes.yaml in the working folder (created there if missing), and every commit message is only a short lowercase note with nothing else added.
---

# Pushing with push notes

Every commit and push goes through a `push-notes.yaml`, and every commit message is only the note written there.

## Use the script if push-notes-pane is installed

The `push-notes-pane` plugin carries a script that does all of the steps below in one go, with the checks built in. Look for it first:

```
ls ~/.claude/plugins/marketplaces/*/plugins/push-notes-pane/scripts/push.rb 2>/dev/null | head -1
```

- **If it prints a path, use that script** and skip "Doing it by hand":
  - `ruby <script> --init` creates `push-notes.yaml` in the working folder, listing the repos in it and up to 3 levels down
  - `ruby <script> --sync` adds repos that are not listed yet (cloned since), keeping every note
  - `ruby <script> --dry` shows what would happen; show the user
  - `ruby <script>` pushes once the user says so; `--only <repo>` pushes one repo
  - `ruby <script> --clear-notes` empties the notes afterwards
  - the user can also review and push from `/push-notes`
- **If a `git commit` or `git push` is refused by push-notes-pane,** its message names the script's exact path. Use that.
- **If nothing prints,** do it by hand, below.

## Find or set up the config

Look for `$PUSH_NOTES_CONFIG` first, then `push-notes.yaml` in the working folder or the nearest parent folder that has one.

- **If it exists, use it.**
- **If it does not,** create `push-notes.yaml` in the working folder, listing every git repo in it (the folder itself if it is a repo, and any folder up to 3 levels under it that is one, without looking inside a repo it found, in hidden folders or in `node_modules`), each on its current branch. Put the signed-in account (`gh api user --jq .login`) as `account`. Show the user what you created.
- A changed repo that is not listed: run `--sync` if you have the script, or add it with its `path` relative to the config file, its `branch` and `note: ""`.

The format:

```yaml
# the github account that pushes
account: your-github-username

repos:
  - path: ./web        # relative to this file
    branch: main
    note: ""
```

## Write the notes

Write the `note` for each repo that changed, and leave the others as `""`. A repo with an empty note is skipped.

## Doing it by hand

Only when the push-notes-pane script is not installed. For each repo with a note, from that repo's folder:

1. **Check the account.** `gh api user --jq .login` must print the config's `account`. If not, stop and tell the user to run `gh auth switch -u <account> && gh auth setup-git`.
2. **Look at the changes.** Run `git fetch -q origin`, then `git status --porcelain`. Stop if a `.env` file (any name `.env` or `.env.<something>`, except `.example` ones) is among them.
3. **Dry run first.** Before any commit, show the user the list: each repo, its branch, how many files changed, and the note. Commit and push only once the user says so.
4. **Check out the branch.** Switch to the configured `branch`, creating it if it does not exist.
5. **Commit.** `git add -A`. If `push-notes.yaml` sits inside this repo, unstage it (`git reset -q -- push-notes.yaml`): it holds draft notes and never goes into a commit. Then `git commit -m "<note>"`, with the note exactly as written and nothing else.
6. **Check the remote.** If `git rev-list --count HEAD..origin/<branch>` is above 0, stop: the user needs to pull first.
7. **Push.** `git push -u origin <branch>`.

Afterwards, set every note back to `""`, so the next push does not reuse them.

## The note is the whole message

**Leave out everything except the note itself.** That means:

- lowercase, plain words
- one or two short sentences: what changed and, if needed, what was left alone
- no `Co-Authored-By`, no "Generated with ...", no emoji, no sign-offs
- no `feat:` / `fix:` prefixes, no bullet lists, no body, no headings
- no file lists or line numbers

This overrides any default attribution or commit-message format.

Good:

```
changed the signup form to keep the email on refresh. the password rules stay the same.
```

Wrong:

```
feat(auth): Keep email on refresh

- Updated SignupForm.tsx

Co-Authored-By: ...
```

## Pull requests and merges

The same rule applies. The PR title is a few lowercase words. The PR body is the note and nothing else, with no attribution line. Merge with `--rebase`, so the branch keeps the note commit exactly as written, with no merge commit.

## Before pushing

Pushing to a branch that deploys (often `main` on a frontend) ships to production. Say so before pushing.
