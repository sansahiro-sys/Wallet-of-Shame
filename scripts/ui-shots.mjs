/**
 * Drives the built app in headless Chromium: walks the setup wizard, checks the
 * home screen in both themes and in Arabic, opens the allowance dialog, and
 * downloads a real PDF report through the UI.
 *
 *   npx vite preview --port 4173 &
 *   node scripts/ui-shots.mjs
 */
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = 'http://localhost:4173/'
const OUT = '/tmp/opencode/shots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 2,
  acceptDownloads: true,
})
const page = await ctx.newPage()

const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(String(e)))

const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` })
const nav = (label) => page.locator('nav button', { hasText: label }).first().click()
const openSettings = () => page.locator('header button[aria-label="Settings"]').click()

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)

// --- Setup wizard ---------------------------------------------------------
console.log('setup wizard visible:', await page.locator('h1').first().isVisible())
await shot('01-wizard-lang')

await page.locator('button:has-text("→")').click() // → currency
await page.waitForTimeout(300)
await shot('02-wizard-currency')

await page.locator('button:has-text("→")').click() // → profile
await page.waitForTimeout(300)
await page.locator('button:has-text("Employee")').click()
await page.waitForTimeout(200)
await shot('03-wizard-profile')

for (let i = 0; i < 3; i++) {
  // → allowance → bills → goal
  await page.locator('button:has-text("→")').click()
  await page.waitForTimeout(300)
}
await shot('04-wizard-goal')
await page.locator('button.btn-primary').last().click()

// --- Home, dark -----------------------------------------------------------
await page.waitForTimeout(1500)
console.log('after setup, url:', page.url())
await shot('05-home-dark')

// --- Log a few expenses through QuickAdd ----------------------------------
async function addExpense(digits, category, impulse = false) {
  await page.locator('button[aria-label="Add expense"]').click()
  await page.waitForTimeout(400)
  for (const k of digits) {
    await page.getByRole('button', { name: k, exact: true }).click()
    await page.waitForTimeout(60)
  }
  await page.locator('button', { hasText: category }).first().click()
  if (impulse) await page.locator('button', { hasText: 'Unplanned' }).first().click()
  await page.locator('button:has-text("Save")').click()
  await page.waitForTimeout(500)
}
await addExpense(['4', '5'], 'Food')
await addExpense(['3', '0'], 'Transport')
await addExpense(['2', '5'], 'Gaming', true)
await page.waitForTimeout(600)
await shot('05b-home-dark-data')

// --- Settings -------------------------------------------------------------
await openSettings()
await page.waitForTimeout(500)
await shot('06-settings-dark')

await page.locator('button:has-text("Light")').click()
await page.waitForTimeout(400)
await shot('07-settings-light')

// --- PDF report through the real download path ----------------------------
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 30000 }),
  page.locator('button:has-text("Last 7 days")').click(),
])
const pdf = '/tmp/opencode/report-ui.pdf'
await download.saveAs(pdf)
console.log('downloaded:', download.suggestedFilename(), '→', pdf)

// --- Allowance dialog -----------------------------------------------------
await page.locator('button:has-text("I received my allowance")').click()
await page.waitForTimeout(500)
await shot('08-allowance-q1')
await page.locator('button:has-text("Yes, it came")').click()
await page.waitForTimeout(300)
await shot('09-allowance-q2')
await page.locator('button:has-text("Same as before")').click()
await page.waitForTimeout(300)
await shot('10-allowance-confirm')

// --- Home in Arabic, light ------------------------------------------------
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
await page.locator('button:has-text("العربية")').first().click()
await page.waitForTimeout(500)
await nav('الرئيسية')
await page.waitForTimeout(600)
await shot('11-home-ar-light')

console.log('console errors:', errors.length ? errors : 'none')
await browser.close()
