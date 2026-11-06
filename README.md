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

## What it runs and sends

### Programs the mod runs, and why

The pane runs one program: the plugin's own script, through `ruby` found on your PATH. The full command is

```
/usr/bin/env ruby <plugin folder>/bin/push.rb <mode>
```

where `<mode>` is one of these fixed sets of arguments, depending on what you pressed:

| You did | It runs `push.rb` with | What that does |
|---|---|---|
| opened the pane, pressed refresh, or edited `push-notes.yaml` in the chat | `--plan-json` | reads the config, each repo's git state and the signed-in GitHub account; changes nothing |
| saved a note | `--set-note <repo name> <your note>` | writes that note into `push-notes.yaml` |
| pressed clear notes | `--clear-notes` | empties every note in `push-notes.yaml` |
| pressed create one here | `--init` | writes a new `push-notes.yaml` in the current folder |
| pressed push, then yes, push | *(no arguments)* | commits and pushes every repo that has a note |

It runs in the folder Claude Code was started in. `push.rb` in turn runs two programs:

- **`git`**, to read each repo's state (`status --porcelain`, `branch --show-current`, `rev-list --count`, `rev-parse`, `diff --cached --name-only`) and, only when you press push, to `fetch origin`, `checkout` the configured branch, `add -A`, `reset` the config file out of the commit, `commit -m <note>` and `push -u origin <branch>`.
- **`gh`**, only as `gh api user --jq .login`, to check which GitHub account is signed in: the pane shows it, and a push stops if it is not the one the config names.

### What it sends, and where

- **`git fetch` and `git push`** talk to each repo's own `origin` remote, the one you configured in that repo (for example GitHub). A push sends that repo's new commit. They only run when you press push, and `fetch` also runs right before a push.
- **`gh api user`** sends one request to GitHub's API (`api.github.com/user`), authenticated as your signed-in `gh` account, each time the pane reads the state and before a push. It reads back only your login name.
- Nothing else leaves your machine. There is no telemetry and no other server.

### What each hook does

- **`session.start`**: registers the `/push-notes` command.
- **`command.run`** (for `/push-notes`): reads the current state with `--plan-json` and opens the pane.
- **`ui.render`** (the pane): draws the repos, notes and buttons from that state. The buttons run the commands in the table above.
- **`tool.call`**: lets every tool call run unchanged. After an `Edit` or `Write` whose file ends in `push-notes.yaml`, if the pane has been opened, it re-reads the state with `--plan-json` so the pane shows the edit. It never blocks, rewrites or delays a tool call beyond that read, and a failed read is ignored.

## The skill

The plugin ships a `push-with-notes` skill. It tells Claude to commit and push only this way: write the notes into `push-notes.yaml`, dry-run, and push only once you say so.
