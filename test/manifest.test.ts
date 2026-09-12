import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const manifest = JSON.parse(readFileSync('src/manifest.json', 'utf8'))
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))

describe('manifest', () => {
  it('is manifest v3', () => {
    expect(manifest.manifest_version).toBe(3)
  })

  it('keeps its version in sync with package.json', () => {
    expect(manifest.version).toBe(pkg.version)
  })

  it('has a stable extension id, without which updates and storage break', () => {
    expect(manifest.browser_specific_settings.gecko.id).toMatch(/^[^@]+@[^@]+$/)
  })

  /**
   * Load-bearing guard, not a formality: the extension must be unable to run on a site
   * the user has not enabled. A static content_scripts entry would silently undo that.
   */
  it('declares no static content scripts', () => {
    expect(manifest.content_scripts).toBeUndefined()
  })

  it('asks for all-sites access only as an optional permission', () => {
    expect(manifest.optional_host_permissions).toContain('<all_urls>')
    expect(manifest.host_permissions).not.toContain('<all_urls>')
  })

  /**
   * activeTab is what lets the popup read the current tab's URL for as long as it is open.
   * Without it we would need the far broader "tabs" permission just to name the site.
   */
  it('reads the current tab through activeTab rather than the tabs permission', () => {
    expect(manifest.permissions).toContain('activeTab')
    expect(manifest.permissions).not.toContain('tabs')
  })

  /**
   * Selected text leaves the device for Google, so this declaration must stay honest.
   * Mozilla will make the key mandatory; dropping it silently would also be a lie to users.
   */
  it('declares that page content is sent off the device', () => {
    expect(manifest.browser_specific_settings.gecko.data_collection_permissions.required).toContain(
      'websiteContent',
    )
  })

  it('uses an event page, not a service worker', () => {
    expect(manifest.background.scripts).toEqual(['background.js'])
    expect(manifest.background.service_worker).toBeUndefined()
  })
})
