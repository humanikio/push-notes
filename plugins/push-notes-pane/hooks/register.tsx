import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Plan, RepoPlan } from '../types'

const PANE = 'push-notes'
const plan = atom({ plugin: 'push-notes-pane', key: 'plan' } as const, null, { shape: 'plan-2' })
const status = atom({ plugin: 'push-notes-pane', key: 'status' } as const, '')
const confirming = atom({ plugin: 'push-notes-pane', key: 'confirming' } as const, false)
const busy = atom({ plugin: 'push-notes-pane', key: 'busy' } as const, false)

type Engine = EngineInterface

// runs the plugin's script from the session's folder, so it finds push-notes.yaml there or above
async function script($: Engine, args: string[], timeoutMs = 60_000) {
  const argv = ['/usr/bin/env', 'ruby', `${$.plugin.root}/scripts/push.rb`, ...args]
  return $.process.run(argv, { timeoutMs })
}

async function refresh($: Engine) {
  const { exitCode, stdout, stderr } = await script($, ['--plan-json'])
  if (exitCode !== 0) {
    await update($, status, () => `could not read the config: ${(stderr || stdout).trim().slice(0, 300)}`)
    return
  }
  await update($, plan, () => JSON.parse(stdout) as Plan)
}

// a git commit or push typed into Bash, e.g. `git commit -m ..`, `git -C repo push`, `cd x && git push`
const GIT_COMMIT_OR_PUSH = /(^|[\s;&|(])git(\s+-C\s+\S+)?\s+(commit|push)\b/
const GH_PR = /(^|[\s;&|(])gh\s+pr\s+(create|merge|edit)\b/

function howToPush(root: string): string {
  return (
    'commits and pushes go through the push-with-notes skill. ' +
    `write a short lowercase note (a sentence or two, nothing else) for each changed repo into push-notes.yaml in the working folder (create it with \`ruby ${root}/scripts/push.rb --init\` if there is none), ` +
    `dry-run with \`ruby ${root}/scripts/push.rb --dry\` and show the user, and push with \`ruby ${root}/scripts/push.rb\` only once the user says so. ` +
    'the user can also review and push from /push-notes.'
  )
}

function lastLines(text: string, n: number): string {
  return text.trim().split('\n').slice(-n).join('\n')
}

async function openPane($: Engine) {
  await update($, confirming, () => false)
  await refresh($)
  await $.ui.open({ id: PANE, title: 'Push notes', focus: true, closeOnEscape: true })
}

export const register: Register = (on, options) => {
  const enforce = String(options.enforce ?? 'remind')

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'push-notes',
      description: 'Review and edit what will be pushed: repos, branches and notes',
    })
    return next(e)
  })

  on('command.run', { command: 'push-notes' }, async $ => {
    await openPane($)
    return { text: 'Push notes pane opened.' }
  })

  // when the config is edited from the chat, show the change
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if ((e.tool === 'Edit' || e.tool === 'Write') && String(e.file_path ?? '').endsWith('push-notes.yaml')) {
      // a failed refresh must never turn into a failed tool call: the pane keeps what it had
      const shown = await read($, plan).catch(() => null)
      if (shown !== null) await refresh($).catch(() => undefined)
    }
    return ran
  })

  // keep agents on push notes: remind after a plain git commit or push, or block it outright
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const command = String(e.command ?? '')
    const isGit = GIT_COMMIT_OR_PUSH.test(command)
    const isPr = GH_PR.test(command)
    if (enforce === 'off' || (!isGit && !isPr)) return next(e)

    if (enforce === 'block' && isGit) {
      return { deny: `push-notes blocked this git commit or push. ${howToPush($.plugin.root)}` }
    }

    const ran = await next(e)
    if (typeof ran.deny === 'string') return ran
    const reminder = isGit
      ? `push-notes: this commit or push did not go through push notes. ${howToPush($.plugin.root)}`
      : 'push-notes: pull request titles and bodies are only the note: a few lowercase words for the title, the note as the body, no attribution line. merge with --rebase.'
    return { ...ran, context: [...(ran.context ?? []), reminder] }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const p = await read($, plan)
    const msg = await read($, status)
    const isConfirming = await read($, confirming)
    const isBusy = await read($, busy)

    const close = () => $.ui.close({ id: PANE })

    const header = (
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold>push notes</Text>
        <Button key="close" role="dismiss" variant="primary" hotkey="x" onPress={close}>✕ close</Button>
      </Box>
    )

    if (!p) {
      return (
        <Box flexDirection="column">
          {header}
          <Text dimColor>Loading…</Text>
        </Box>
      )
    }

    if (!p.config) {
      const init = async () => {
        const { exitCode, stdout, stderr } = await script($, ['--init'])
        await update($, status, () => (exitCode === 0 ? stdout : stderr || stdout).trim())
        await refresh($)
      }
      return (
        <Box flexDirection="column">
          {header}
          <Text>no push-notes.yaml in {p.cwd} or any folder above it.</Text>
          <Text dimColor>create one here and it lists the git repos in this folder.</Text>
          <Box marginTop={1} flexDirection="row" gap={1}>
            <Button key="init" variant="primary" hotkey="i" onPress={init}>create one here</Button>
            <Button key="refresh" hotkey="r" onPress={() => refresh($)}>refresh</Button>
          </Box>
          {msg ? <Text dimColor>{msg}</Text> : null}
        </Box>
      )
    }

    const ready = p.repos.filter(r => r.note && !r.error)
    const wrongAccount = p.signedInAs !== p.account
    const blocked = wrongAccount || ready.some(r => r.envFile)

    const setNote = (r: RepoPlan) => async (value: string) => {
      await script($, ['--set-note', r.name, value])
      await update($, confirming, () => false)
      await refresh($)
    }

    const push = async () => {
      await update($, busy, () => true)
      await update($, status, () => `pushing ${ready.length} repo${ready.length === 1 ? '' : 's'}…`)
      const { exitCode, stdout, stderr } = await script($, [], 600_000)
      await update($, busy, () => false)
      await update($, confirming, () => false)
      await update($, status, () => lastLines(`${stdout}\n${stderr}`, 12))
      $.ui.toast(exitCode === 0 ? 'push notes: pushed' : 'push notes: push stopped, see the pane')
      await refresh($)
    }

    const clear = async () => {
      await script($, ['--clear-notes'])
      await update($, status, () => 'notes cleared')
      await refresh($)
    }

    return (
      <Box flexDirection="column">
        {header}
        <Text>
          pushing as <Text bold color={wrongAccount ? 'red' : 'green'}>{p.signedInAs ?? 'unknown'}</Text>
          {wrongAccount ? <Text color="red"> (config wants {p.account || 'an account'})</Text> : null}
        </Text>
        <Text dimColor>{p.config}</Text>

        {p.repos.map(r => (
          <Box key={r.name} flexDirection="column" marginTop={1}>
            <Text>
              <Text bold dimColor={!r.note}>{r.name}</Text>
              <Text> → {r.branch}</Text>
              {r.current && r.current !== r.branch ? <Text color="yellow"> (on {r.current})</Text> : null}
              <Text dimColor>
                {'  '}
                {r.error ?? `${r.changed ?? 0} changed${r.ahead ? `, ${r.ahead} unpushed` : ''}`}
              </Text>
              {r.note ? null : <Text dimColor>  skipped, no note</Text>}
            </Text>
            {r.envFile ? <Text color="red">  an .env file is in the changes, push will stop</Text> : null}
            {r.files && r.files.length > 0 ? (
              <Text dimColor>  {r.files.join(', ')}{(r.changed ?? 0) > r.files.length ? ', …' : ''}</Text>
            ) : null}
            <Input
              key={`note-${r.name}`}
              label="  note "
              placeholder="lowercase, a sentence or two"
              value={r.note}
              submitLabel="save"
              onSubmit={setNote(r)}
            />
          </Box>
        ))}

        <Box marginTop={1} flexDirection="row" gap={1}>
          {isConfirming ? (
            <>
              <Text>push {ready.length} repo{ready.length === 1 ? '' : 's'} now?</Text>
              <Button key="yes" variant="primary" hotkey="y" onPress={push}>yes, push</Button>
              <Button key="no" hotkey="n" onPress={() => update($, confirming, () => false)}>cancel</Button>
            </>
          ) : (
            <>
              <Button
                key="push"
                variant="primary"
                hotkey="p"
                onPress={() =>
                  ready.length === 0 || blocked || isBusy
                    ? update($, status, () =>
                        isBusy ? 'already pushing' : blocked ? 'fix the red lines first' : 'no repo has a note')
                    : update($, confirming, () => true)}
              >
                push {ready.length}
              </Button>
              <Button key="refresh" hotkey="r" onPress={() => refresh($)}>refresh</Button>
              <Button key="clear" hotkey="c" onPress={clear}>clear notes</Button>
            </>
          )}
        </Box>

        {msg ? <Text dimColor={!isBusy}>{msg}</Text> : null}
      </Box>
    )
  })
}
