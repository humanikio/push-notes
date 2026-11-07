import { expect, test } from 'claude-code/testing'

// each `tool.call` hook here stands for the engine running the command
const ran = { result: { stdout: 'ok', stderr: '', interrupted: false } }

test('remind lets a git commit run and adds a reminder for the agent', { options: { enforce: 'remind' } }, async ($, on) => {
  on('tool.call', () => ran)
  const out = await $.tool.call({ tool: 'Bash', command: 'git commit -m "Fix thing"' })
  expect(out.deny).toBeUndefined()
  expect(out.context?.join(' ')).toContain('push-with-notes skill')
})

test('block refuses git commit and git push and points at push notes', { options: { enforce: 'block' } }, async ($, on) => {
  on('tool.call', () => ran)
  for (const command of ['git commit -m x', 'cd api && git push origin main', 'git -C web push']) {
    const out = await $.tool.call({ tool: 'Bash', command })
    expect(out.deny).toContain('push-with-notes skill')
  }
})

test('block only reminds on pull requests', { options: { enforce: 'block' } }, async ($, on) => {
  on('tool.call', () => ran)
  const out = await $.tool.call({ tool: 'Bash', command: 'gh pr create --title x --body y' })
  expect(out.deny).toBeUndefined()
  expect(out.context?.join(' ')).toContain('pull request titles')
})

test('off and unrelated commands pass through untouched', { options: { enforce: 'block' } }, async ($, on) => {
  on('tool.call', () => ran)
  for (const command of ['git status', 'ruby scripts/push.rb --dry', 'git log --grep=commit', 'echo push']) {
    const out = await $.tool.call({ tool: 'Bash', command })
    expect(out.deny).toBeUndefined()
    expect(out.context ?? []).toEqual([])
  }
})

test('off lets git push run with no reminder', { options: { enforce: 'off' } }, async ($, on) => {
  on('tool.call', () => ran)
  const out = await $.tool.call({ tool: 'Bash', command: 'git push' })
  expect(out.deny).toBeUndefined()
  expect(out.context ?? []).toEqual([])
})
