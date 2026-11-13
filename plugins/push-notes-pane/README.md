# push-notes-pane

A pane in Claude Code for [push-notes](../push-notes). `/push-notes` shows exactly what will ship: each repo, the branch, the changed files and the note. You can edit the notes in place and push with a confirm step. It also ships an optional hook that reminds or blocks agents that commit outside push notes.

Install it alongside `push-notes`, which carries the skill. When this plugin is installed, the skill does its pushes through this plugin's script.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install push-notes-pane --marketplace humanikio/push-notes
```

Answer `y` to add the marketplace if asked, then pick a scope.

## Needs

- `ruby` on your PATH (macOS ships one)
- `git`
- the GitHub CLI `gh`, signed in as the account that should push (`gh auth login`, then `gh auth setup-git`)


## Use

1. Start Claude Code in the folder that holds your repos and run `/push-notes`. If there is no `push-notes.yaml` there, press **create one here**. It lists every git repo in that folder (and the folder itself if it is one), with your current gh account.
2. Type a note for each repo you want to push and press Enter to save it. A repo with no note is skipped.
3. Press **push**, then **yes, push**. Nothing ships before that.

Keys in the pane: `p` push, `r` refresh, `c` clear notes, `x` or Esc close.

The config format is the same as push-notes'; see [its README](../push-notes/README.md).

## The script

`scripts/push.rb` does the whole flow with the checks in code: it stops on the wrong `gh` account, refuses `.env` files, never commits `push-notes.yaml`, stops if the remote has moved, and lowercases notes and strips trailer lines such as `Co-Authored-By`. You can run it yourself:

```
ruby scripts/push.rb --init        # create push-notes.yaml here, listing the git repos in this folder (up to 3 levels down)
ruby scripts/push.rb --sync        # add repos cloned since, keeping every note
ruby scripts/push.rb --dry         # show what would happen
ruby scripts/push.rb               # commit and push every repo with a note
ruby scripts/push.rb --only api    # just one repo
ruby scripts/push.rb --clear-notes # empty every note
```

## Keeping agents on push notes

The `enforce` setting decides what happens when an agent runs `git commit` or `git push` through Claude Code's Bash tool:

| `enforce` | What happens |
|---|---|
| `remind` (default) | the command runs, then the agent is told to use push notes next time and keep the message to a short lowercase note |
| `block` | the command is refused, and the agent is told to write the note into `push-notes.yaml`, dry-run and push through push notes instead |
| `off` | nothing |

`gh pr create`, `gh pr merge` and `gh pr edit` only ever get a reminder: PR titles and bodies are just the note. Commands you type yourself, and push notes' own script, are never touched.

Set it in `/config` (the push-notes-pane row), or when installing:

```
claude plugin install push-notes-pane --marketplace humanikio/push-notes --config enforce=block
```


## What it runs and sends

### Programs the mod runs, and why

The pane runs one program: this plugin's script, `scripts/push.rb`, through `ruby` found on your PATH. The full command is

```
/usr/bin/env ruby <plugin folder>/scripts/push.rb <mode>
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
- **`tool.call`** (every tool): lets the call run unchanged. After an `Edit` or `Write` whose file ends in `push-notes.yaml`, if the pane has been opened, it re-reads the state with `--plan-json` so the pane shows the edit. A failed read is ignored.
- **`tool.call`** (Bash only): looks at the command text for `git commit`, `git push` or `gh pr create/merge/edit`. With `enforce: block` it refuses a `git commit` or `git push` with a message pointing the agent at push notes. Otherwise it lets the command run unchanged and, unless `enforce` is `off`, adds a short reminder that only the agent reads. It runs nothing and sends nothing itself. Any other command passes through untouched.

