# push-notes

Push several git repos at once from one `push-notes.yaml`. Each commit message is a short lowercase note you write, and nothing else gets added.

This repo is a Claude Code marketplace with two plugins:

| Plugin | What it is |
|---|---|
| [`push-notes`](plugins/push-notes) | the skill and the script. Claude commits and pushes only through `push-notes.yaml`, with note-only messages. No hooks. |
| [`push-notes-pane`](plugins/push-notes-pane) | a `/push-notes` pane to review and push, and an optional hook that reminds or blocks agents that commit outside push notes |

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install push-notes --marketplace humanikio/push-notes
/plugin install push-notes-pane --marketplace humanikio/push-notes
```

Answer `y` to add the marketplace, then pick a scope. The second line is optional.

From a shell: `claude plugin install push-notes --marketplace humanikio/push-notes`

## License

MIT
