#!/usr/bin/env bash
set -euo pipefail

CAPTURE_URL="${CAPTURE_URL:?Set CAPTURE_URL to the exact preview URL}"
CAPTURE_DIR="${CAPTURE_DIR:?Set CAPTURE_DIR to the evidence directory}"
/usr/bin/time -p mkdir -p "$CAPTURE_DIR"

/usr/bin/time -p node <<'NODE'
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { performance } = require('node:perf_hooks')

const runtime = path.join(process.env.HOME, '.local/share/omgithub-playwright')
const loadRuntimeModule = createRequire(path.join(runtime, 'package.json'))
const { chromium } = loadRuntimeModule('playwright')
const configPath = path.join(runtime, process.platform === 'darwin' ? 'metal.json' : 'linux.json')
const output = process.env.CAPTURE_DIR
const target = process.env.CAPTURE_URL

function timed(label, start) { console.log(`${label}: ${(performance.now() - start).toFixed(0)}ms`) }
function failure(message, code = 1) { const error = new Error(message); error.exitCode = code; return error }
function temporary(error) {
  const message = String(error?.message || error)
  return failure(message, 75)
}

;(async () => {
  let browser
  const total = performance.now()
  try {
    let config
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')) } catch (error) { throw failure(`Cannot read browser configuration: ${error.message}`) }
    if (process.platform === 'linux') {
      try { process.env.DISPLAY ||= ':' + fs.readFileSync(path.join(runtime, 'display'), 'utf8').trim() } catch (error) { throw failure(`Cannot read browser display configuration: ${error.message}`) }
    }
    try { new URL(target) } catch { throw failure(`Invalid CAPTURE_URL: ${target}`) }

    let started = performance.now()
    try { browser = await chromium.launch({ ...config.browser.launchOptions, timeout: 30000 }) } catch (error) { throw temporary(error) }
    timed('Browser launch', started)

    for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
      started = performance.now()
      let page
      try {
        page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
        page.setDefaultTimeout(30000)
        const pageErrors = []
        page.on('pageerror', error => pageErrors.push(error.message))
        const response = await page.goto(target, { waitUntil: 'load', timeout: 45000 }).catch(error => { throw temporary(error) })
        if (!response?.ok()) {
          const status = response?.status()
          throw failure(`Preview returned HTTP ${status ?? 'no response'} at ${target}`, !status || [408, 429, 500, 502, 503, 504].includes(status) ? 75 : 1)
        }
        await page.locator('body').waitFor({ state: 'visible' })
        await page.waitForFunction(() => document.fonts.status === 'loaded', { timeout: 15000 }).catch(error => { throw failure(`Page did not finish rendering fonts: ${error.message}`) })
        const rendered = await page.evaluate(() => {
          const body = document.body
          const hasText = (body.innerText || '').trim().length > 0
          const hasVisual = [...document.querySelectorAll('canvas,svg,img,video,iframe')].some(node => {
            const box = node.getBoundingClientRect()
            return box.width > 0 && box.height > 0
          })
          const hasVisibleElement = [...body.children].some(node => {
            const style = getComputedStyle(node), box = node.getBoundingClientRect()
            return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0
          })
          return { hasText, hasVisual, hasVisibleElement, title: document.title }
        })
        if (!rendered.hasText && !rendered.hasVisual && !rendered.hasVisibleElement) throw failure(`${name} page is blank; no rendered content was found.`)
        await page.waitForTimeout(1000)
        const screenshotStarted = performance.now()
        await page.screenshot({ path: path.join(output, `final-${name}.png`), fullPage: false, timeout: 30000 }).catch(error => {
          if (error.name === 'TimeoutError' || !browser.isConnected()) throw temporary(error)
          throw failure(`Could not capture ${name} screenshot: ${error.message}`)
        })
        timed(`${name} screenshot`, screenshotStarted)
        if (pageErrors.length) throw failure(`Browser rendering error on ${name}: ${pageErrors.join('; ')}`)
        console.log(`${name} rendered: ${rendered.title || '(untitled)'}`)
      } catch (error) {
        if (error.exitCode) throw error
        throw failure(`${name} capture failed: ${error.message}`)
      } finally {
        await page?.close().catch(() => {})
      }
      timed(`${name} navigation and render`, started)
    }
  } catch (error) {
    console.error(error)
    process.exitCode = error.exitCode || 1
  } finally {
    const closeStarted = performance.now()
    if (browser) await browser.close().catch(error => { console.error(error); process.exitCode ||= 75 })
    if (browser) timed('Browser close', closeStarted)
    timed('Capture total', total)
  }
})()
NODE
