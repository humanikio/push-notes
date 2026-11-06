import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Plan, RepoPlan } from '../types'

const PANE = 'push-notes'
const plan = atom({ plugin: 'push-notes', key: 'plan' } as const, null, { shape: 'plan-2' })
const status = atom({ plugin: 'push-notes', key: 'status' } as const, '')
const confirming = atom({ plugin: 'push-notes', key: 'confirming' } as const, false)
const busy = atom({ plugin: 'push-notes', key: 'busy' } as const, false)

type Engine = EngineInterface

// runs the plugin's script from the session's folder, so it finds push-notes.yaml there or above
async function script($: Engine, args: string[], timeoutMs = 60_000) {
  const argv = ['/usr/bin/env', 'ruby', `${$.plugin.root}/bin/push.rb`, ...args]
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

function lastLines(text: string, n: number): string {
  return text.trim().split('\n').slice(-n).join('\n')
}

async function openPane($: Engine) {
  await update($, confirming, () => false)
  await refresh($)
  await $.ui.open({ id: PANE, title: 'Push notes', focus: true, closeOnEscape: true })
}

export const register: Register = on => {
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
