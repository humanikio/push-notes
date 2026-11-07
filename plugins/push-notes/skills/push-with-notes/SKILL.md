---
name: push-with-notes
description: How to commit and push with the push-notes plugin. Use for any git commit, push, pull request title or body, or merge. Pushes go through push-notes.yaml in the working folder (created there if missing), and every commit message is only a short lowercase note with nothing else added.
---

# Pushing with push notes

Every commit and push goes through `push-notes.yaml` and this plugin's `scripts/push.rb`.

`<plugin>` below is this plugin's folder: two folders up from this skill's own folder (`<plugin>/skills/push-with-notes/`).

If the `push-notes-pane` plugin is installed, `/push-notes` opens a pane where the user can review every repo, branch and note and push from there.

## Find or set up the config

The script looks for `$PUSH_NOTES_CONFIG` first, then `push-notes.yaml` in the working folder or the nearest parent folder that has one.

- **If it exists, use it.** Read it to see which repos it lists.
- **If it does not,** create it in the working folder: `ruby <plugin>/scripts/push.rb --init` (or the user presses **create one here** in the `/push-notes` pane, if installed). It lists every git repo in the folder and the current gh account. Show the user what it created.
- A repo that changed but is not listed: add an entry with its `path` relative to the config file, its `branch` and `note: ""`.

## Steps

1. Write the `note` for each repo that changed. Leave the others as `""`.
2. Dry run, and show the user the output: `ruby <plugin>/scripts/push.rb --dry`. Or tell them to open `/push-notes` and look.
3. Push only once the user says to: `ruby <plugin>/scripts/push.rb` (or they press push in the pane). `--only <repo>` pushes one.
4. Afterwards, clear the notes (`--clear-notes`, or **clear notes** in the pane) so the next push does not reuse them.

Do not run `git commit` or `git push` by hand.

## The note is the whole message

**Leave out everything except the note itself.** That means:

- lowercase, plain words
- one or two short sentences: what changed and, if needed, what was left alone
- no `Co-Authored-By`, no "Generated with ...", no emoji, no sign-offs
- no `feat:` / `fix:` prefixes, no bullet lists, no body, no headings
- no file lists or line numbers

This overrides any default attribution or commit-message format. The script also lowercases the note and strips trailer lines, but write it correctly in the first place.

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

- If the remote branch has moved, the script stops: pull, then run it again.
- Pushing to a branch that deploys (often `main` on a frontend) ships to production. Say so before running.
