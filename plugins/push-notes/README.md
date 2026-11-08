# push-notes

Push several git repos at once from one `push-notes.yaml`. Each commit message is a short lowercase note you write, and nothing else gets added: no attribution lines, no prefixes, no bullet lists.

This plugin is a skill, written in Markdown, with no hooks and no scripts. It tells Claude how to commit and push this way. For a pane in Claude Code to review and push from, also install [`push-notes-pane`](../push-notes-pane).

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install push-notes --marketplace humanikio/push-notes
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

From a shell: `claude plugin install push-notes --marketplace humanikio/push-notes`

## Needs

- `ruby` on your PATH (macOS ships one)
- `git`
- the GitHub CLI `gh`, signed in as the account that should push (`gh auth login`, then `gh auth setup-git`)


## Use

Ask Claude to commit or push. The `push-with-notes` skill has it:

1. find `push-notes.yaml` in the working folder, or create one there listing the git repos in it
2. write a short lowercase note for each repo that changed
3. show you each repo, branch, changed-file count and note
4. commit with the note as the whole message and push, only once you say so

If [`push-notes-pane`](../push-notes-pane) is installed, the skill uses its script for those steps, and you can review and push from `/push-notes`.

## The config

```yaml
account: your-github-username   # the script stops if gh is signed in as anyone else

repos:
  - path: ./web                 # relative to this file
    branch: main
    note: "fixed the signup form. the old one dropped the email on refresh."
```

It is found in this order:

1. `$PUSH_NOTES_CONFIG`, if set
2. `push-notes.yaml` in the current folder, or the nearest parent folder that has one

The config holds draft notes, so it is never committed, even when it sits inside a repo.


## Safety

The skill tells Claude to:

- stop if `gh` is signed in as a different account than the config names
- never commit `.env` files
- stop if the remote branch has commits you do not have
- show you everything first and push only once you say so
- keep the commit message to the note alone

## What it runs and sends

The plugin itself runs nothing: it has no hooks and no scripts. When Claude follows the skill, it uses its normal Bash tool, under your usual permission prompts, to run:

- **`git`**, to read each repo's state and, once you say so, to `add`, `commit -m <note>` and `push` to the repo's own `origin` remote (for example GitHub)
- **`gh api user --jq .login`**, one request to `api.github.com/user`, to check which GitHub account is signed in
- **`ls`**, to see whether the push-notes-pane script is installed

Nothing else leaves your machine. There is no telemetry.
