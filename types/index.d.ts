export type RepoPlan = {
  name: string
  path: string
  branch: string
  note: string
  current?: string
  changed?: number
  files?: string[]
  envFile?: boolean
  ahead?: number
  error?: string
}

export type Plan = {
  config: string | null
  cwd: string
  account: string
  signedInAs: string | null
  repos: RepoPlan[]
}

declare module 'claude-code' {
  interface PluginState {
    'push-notes': {
      plan: Shaped<Plan | null>
      status: string
      confirming: boolean
      busy: boolean
    }
  }
}
