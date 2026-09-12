/**
 * Minimal stand-in for the WebExtension globals. Only the surface the code under test
 * actually touches is implemented — anything else should fail loudly rather than pretend.
 */

type Store = Record<string, unknown>

export type BrowserStub = {
  store: Store
}

export function installBrowserStub(initial: Store = {}): BrowserStub {
  const store: Store = { ...initial }

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

  Object.defineProperty(globalThis, 'browser', {
    configurable: true,
    writable: true,
    value: {
      storage: { local },
      i18n: { getUILanguage: () => 'en-GB' },
      runtime: { getManifest: () => ({ version: '0.0.0' }) },
    },
  })

  return { store }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
