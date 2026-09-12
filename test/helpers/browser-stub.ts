/**
 * Minimal stand-in for the WebExtension globals. Only the surface the code under test
 * actually touches is implemented — anything else should fail loudly rather than pretend.
 */

type Store = Record<string, unknown>

type RegisteredScript = {
  id: string
  matches: string[]
  js: string[]
  runAt?: string
  allFrames?: boolean
  persistAcrossSessions?: boolean
}

export type BrowserStub = {
  store: Store
  /** Origins the user has granted, as match patterns. */
  origins: Set<string>
  /** Content script registrations, keyed by id. */
  scripts: Map<string, RegisteredScript>
  calls: { register: number; update: number; unregister: number }
}

export function installBrowserStub(initial: Store = {}, origins: string[] = []): BrowserStub {
  const store: Store = { ...initial }
  const state: BrowserStub = {
    store,
    origins: new Set(origins),
    scripts: new Map(),
    calls: { register: 0, update: 0, unregister: 0 },
  }

  const local = {
    get(key: string | string[]): Promise<Store> {
      const keys = Array.isArray(key) ? key : [key]
      const out: Store = {}
      for (const name of keys) {
        if (name in store) out[name] = store[name]
      }
      return Promise.resolve(out)
    },
    set(items: Store): Promise<void> {
      Object.assign(store, items)
      return Promise.resolve()
    },
    remove(key: string | string[]): Promise<void> {
      for (const name of Array.isArray(key) ? key : [key]) delete store[name]
      return Promise.resolve()
    },
  }

  const permissions = {
    getAll: () => Promise.resolve({ permissions: [], origins: [...state.origins] }),
    contains: ({ origins: wanted = [] }: { origins?: string[] }) =>
      Promise.resolve(wanted.every((pattern) => state.origins.has(pattern))),
    request: ({ origins: wanted = [] }: { origins?: string[] }) => {
      for (const pattern of wanted) state.origins.add(pattern)
      return Promise.resolve(true)
    },
    remove: ({ origins: wanted = [] }: { origins?: string[] }) => {
      for (const pattern of wanted) state.origins.delete(pattern)
      return Promise.resolve(true)
    },
  }

  const scripting = {
    getRegisteredContentScripts: ({ ids = [] }: { ids?: string[] } = {}) =>
      Promise.resolve(ids.map((id) => state.scripts.get(id)).filter(Boolean)),
    registerContentScripts: (scripts: RegisteredScript[]) => {
      state.calls.register += 1
      for (const script of scripts) state.scripts.set(script.id, script)
      return Promise.resolve()
    },
    updateContentScripts: (scripts: RegisteredScript[]) => {
      state.calls.update += 1
      for (const script of scripts) state.scripts.set(script.id, script)
      return Promise.resolve()
    },
    unregisterContentScripts: ({ ids = [] }: { ids?: string[] }) => {
      state.calls.unregister += 1
      for (const id of ids) state.scripts.delete(id)
      return Promise.resolve()
    },
  }

  Object.defineProperty(globalThis, 'browser', {
    configurable: true,
    writable: true,
    value: {
      storage: { local },
      permissions,
      scripting,
      i18n: { getUILanguage: () => 'en-GB' },
      runtime: { getManifest: () => ({ version: '0.0.0' }) },
    },
  })

  return state
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
