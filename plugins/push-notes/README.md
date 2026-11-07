# push-notes

Push several git repos at once from one `push-notes.yaml`. Each commit message is a short lowercase note you write, and nothing else gets added: no attribution lines, no prefixes, no bullet lists.

This plugin is a skill and a script, with no hooks. The skill tells Claude to commit and push only this way. For a pane in Claude Code to review and push from, also install [`push-notes-pane`](../push-notes-pane).

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

1. find `push-notes.yaml` in the working folder, or create one there with `--init`
2. write a short lowercase note for each repo that changed
3. dry-run and show you the result
4. push only once you say so

Or run the script yourself:

```
ruby scripts/push.rb --init        # create push-notes.yaml here, listing the git repos in this folder
ruby scripts/push.rb --dry         # show what would happen
ruby scripts/push.rb               # commit and push every repo with a note
ruby scripts/push.rb --only api    # just one repo
ruby scripts/push.rb --clear-notes # empty every note
```

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

- Stops if `gh` is signed in as a different account than the config names
- Refuses to commit `.env` files
- Stops if the remote branch has commits you do not have
- Lowercases notes and strips trailer lines such as `Co-Authored-By`


## What it runs and sends

The plugin has no hooks, so it runs nothing on its own. When Claude follows the skill, or you run the script, `scripts/push.rb` runs:

- **`git`**, to read each repo's state (`status --porcelain`, `branch --show-current`, `rev-list --count`, `rev-parse`, `diff --cached --name-only`) and, on a push, to `fetch origin`, `checkout` the configured branch, `add -A`, `reset` the config file out of the commit, `commit -m <note>` and `push -u origin <branch>`.
- **`gh`**, only as `gh api user --jq .login`, to check which GitHub account is signed in. A push stops if it is not the one the config names.

What goes over the network:

- **`git fetch` and `git push`** go to each repo's own `origin` remote (for example GitHub), only on a push.
- **`gh api user`** sends one request to `api.github.com/user` as your signed-in `gh` account and reads back only your login name.
- Nothing else leaves your machine. There is no telemetry.
