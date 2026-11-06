# push-notes

Push several git repos at once from one `push-notes.yaml`. Each commit message is a short lowercase note you write, and nothing else gets added: no attribution lines, no prefixes, no bullet lists.

Inside Claude Code, `/push-notes` opens a pane that shows exactly what will ship (each repo, the branch, the changed files and the note). You can edit the notes in place and push with a confirm step.

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

1. Start Claude Code in the folder that holds your repos and run `/push-notes`. If there is no `push-notes.yaml` there, press **create one here**. It lists every git repo in that folder (and the folder itself if it is one), with your current gh account.
2. Type a note for each repo you want to push and press Enter to save it. A repo with no note is skipped.
3. Press **push**, then **yes, push**. Nothing ships before that.

Keys in the pane: `p` push, `r` refresh, `c` clear notes, `x` or Esc close.

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

## Without the pane

```
ruby bin/push.rb --init        # create push-notes.yaml here
ruby bin/push.rb --dry         # show what would happen
ruby bin/push.rb               # commit and push every repo with a note
ruby bin/push.rb --only api    # just one repo
```

## Safety

- Stops if `gh` is signed in as a different account than the config names
- Refuses to commit `.env` files
- Stops if the remote branch has commits you do not have
- Lowercases notes and strips trailer lines such as `Co-Authored-By`

## The skill

The plugin ships a `push-with-notes` skill. It tells Claude to commit and push only this way: write the notes into `push-notes.yaml`, dry-run, and push only once you say so.
