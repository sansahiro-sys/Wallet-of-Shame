/**
 * Bug hunt: drives every page and flow in headless Chromium and asserts on the
 * actual IndexedDB state after each step.
 *
 *   npx vite preview --port 4173 &
 *   node scripts/bughunt.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = 'http://localhost:4173/'
const SHOTS = '/tmp/opencode/bughunt'
mkdirSync(SHOTS, { recursive: true })

let pass = 0
let fail = 0
const problems = []
function check(name, cond, detail = '') {
  if (cond) {
    pass++
    console.log(`  ok   ${name}`)
  } else {
    fail++
    problems.push(`${name} ${detail}`)
    console.log(`  FAIL ${name}  ${detail}`)
  }
}
const section = (name) => console.log(`\n== ${name} ==`)

const now = new Date()
const pad = (n) => String(n).padStart(2, '0')
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
const shiftDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 } })
const page = await ctx.newPage()
page.on('dialog', (d) => d.accept())

const consoleErrors = []
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text())
})
page.on('pageerror', (e) => consoleErrors.push(String(e)))

// --- helpers --------------------------------------------------------------
const dump = (store) =>
  page.evaluate(async (name) => {
    const idb = await new Promise((res, rej) => {
      const r = indexedDB.open('wallet-of-shame')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const rows = await new Promise((res, rej) => {
      const q = idb.transaction(name, 'readonly').objectStore(name).getAll()
      q.onsuccess = () => res(q.result)
      q.onerror = () => rej(q.error)
    })
    idb.close()
    return rows
  }, store)

const getSettings = async () => (await dump('settings'))[0] ?? {}
const nav = (label) => page.locator('nav button', { hasText: label }).first().click()
const openSettings = async () => {
  const gear = page.locator('header button[aria-label="Settings"]')
  if (await gear.isVisible().catch(() => false)) {
    await gear.click()
    await page.waitForTimeout(300)
  }
}
const sheet = () => page.locator('.anim-sheet')
const closeSheet = async () => {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
}
const waitToastGone = async () => {
  await page.waitForSelector('.anim-toast', { state: 'detached', timeout: 7000 }).catch(() => {})
}
async function addExpense(digits, category, opts = {}) {
  await page.locator('button[aria-label="Add expense"]').click()
  await sheet().waitFor()
  for (const k of digits) await page.getByRole('button', { name: k, exact: true }).click()
  await page.locator('.anim-sheet button', { hasText: category }).first().click()
  if (opts.impulse) await page.locator('.anim-sheet button', { hasText: 'Impulse' }).click()
  if (opts.note) await page.getByPlaceholder('What was it? (optional)').fill(opts.note)
  await sheet().locator('button', { hasText: 'Save' }).click()
  await sheet().waitFor({ state: 'detached' })
  await waitToastGone()
}

// ==========================================================================
section('1. Setup wizard')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
check('wizard shows on first run', await page.locator('h1').first().isVisible())

await page.locator('button:has-text("→")').click() // language → currency
await page.waitForTimeout(250)
await page.selectOption('select', 'EUR')
await page.locator('button:has-text("→")').click() // currency → profile
await page.waitForTimeout(200)
await page.locator('button:has-text("Freelancer")').click()
await page.locator('button:has-text("→")').click() // profile → allowance
await page.waitForTimeout(200)
await page.locator('input[type=number]').fill('500')
await page.locator('button:has-text("→")').click() // allowance → bills
await page.waitForTimeout(200)
await page.locator('button:has-text("→")').click() // bills → goal
await page.waitForTimeout(200)
await page.locator('input').first().fill('Gaming PC')
await page.locator('input[type=number]').fill('2000')
await page.locator('button:has-text("Enter the ledger")').click()
await page.waitForTimeout(1200)

let s = await getSettings()
check('wizard wrote currency', s.currency === 'EUR', `got ${s.currency}`)
check('wizard wrote profile', s.profile === 'freelancer', `got ${s.profile}`)
check('wizard wrote allowance', s.allowance === 500, `got ${s.allowance}`)
check('wizard marked setup done', s.setupDone === true)
check('wizard set cycle start to today', s.cycleStart === today, `got ${s.cycleStart}`)
let goals = await dump('goals')
check('wizard created the goal', goals.length === 1 && goals[0].name === 'Gaming PC' && goals[0].target === 2000, JSON.stringify(goals))
let bills = await dump('fixedCosts')
check('wizard kept the two default bills', bills.length === 2, `got ${bills.length}`)
let cats = await dump('categories')
check('seeded six categories', cats.length === 6, `got ${cats.length}`)

// ==========================================================================
section('2. Persistence across reload')
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(900)
check('no wizard after setup', !(await page.locator('text=Welcome, soul').isVisible().catch(() => false)))
check('home rendered', await page.locator('text=THIS WEEK\'S ROAST').or(page.locator("text=This week's roast")).first().isVisible())
check('theme defaults to dark', (await page.getAttribute('html', 'data-theme')) === 'dark')

// ==========================================================================
section('3. QuickAdd validation + save')
await page.locator('button[aria-label="Add expense"]').click()
await sheet().waitFor()
await sheet().locator('button', { hasText: 'Save' }).click()
check('empty amount is rejected', await page.locator('text=Enter an amount first').isVisible())
check('nothing was written', (await dump('txns')).length === 0)
await closeSheet()

await addExpense(['4', '5'], 'Food & Drinks', { note: 'coffee' })
let txns = await dump('txns')
check('expense saved', txns.length === 1 && txns[0].amount === 45, JSON.stringify(txns))
check('note saved', txns[0]?.note === 'coffee')
check('not impulse', txns[0]?.impulse === false)
check('dated today', txns[0]?.date === today, `got ${txns[0]?.date}`)

await addExpense(['2', '5'], 'Gaming', { impulse: true, note: 'Steam' })
txns = await dump('txns')
check('impulse expense saved', txns.length === 2 && txns[1].amount === 25 && txns[1].impulse === true, JSON.stringify(txns))

// ==========================================================================
section('4. Ledger: scope + edit')
await nav('Ledger')
await page.waitForTimeout(400)
check('cycle scope counts 2', (await page.locator('text=/2 transactions/').count()) > 0)

await page.locator('.panel.divide-y button').first().click() // newest row
await sheet().waitFor()
check('edit sheet shows the amount', (await sheet().locator('.font-display.text-5xl').textContent())?.trim() === '25')
await page.getByRole('button', { name: '⌫', exact: true }).click()
await page.getByRole('button', { name: '⌫', exact: true }).click()
await page.getByRole('button', { name: '9', exact: true }).click()
await page.getByRole('button', { name: '9', exact: true }).click()
await sheet().locator('button', { hasText: 'Save' }).click()
await sheet().waitFor({ state: 'detached' })
txns = await dump('txns')
check('edit updated the row', txns.find((x) => x.id === 2)?.amount === 99, JSON.stringify(txns.find((x) => x.id === 2)))

// an expense from before the cycle: cycle scope must hide it, all must show it
await page.evaluate(async (date) => {
  const idb = await new Promise((res) => {
    const r = indexedDB.open('wallet-of-shame')
    r.onsuccess = () => res(r.result)
  })
  idb.transaction('txns', 'readwrite').objectStore('txns').add({ amount: 10, categoryId: 1, impulse: false, date })
  await new Promise((r) => setTimeout(r, 300))
  idb.close()
}, shiftDays(today, -40))
await page.waitForTimeout(400)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(900)
await nav('Ledger')
await page.waitForTimeout(400)
check('cycle scope hides the old expense', (await page.locator('text=/2 transactions/').count()) > 0)
await page.locator('button', { hasText: 'All' }).first().click()
await page.waitForTimeout(300)
check('"All" shows the old expense', (await page.locator('text=/3 transactions/').count()) > 0)

// ==========================================================================
section('5. Budgets: bills + categories')
await nav('Budgets')
await page.waitForTimeout(400)
await page.getByPlaceholder('Name').fill('Netflix')
await page.getByPlaceholder('Amount').fill('40')
await page.locator('button[aria-label="Add bill"]').click()
await page.waitForTimeout(400)
bills = await dump('fixedCosts')
check('bill added', bills.length === 3 && bills.some((b) => b.name === 'Netflix' && b.amount === 40), JSON.stringify(bills))

await page.locator('button[aria-label="Netflix"]').click()
await page.waitForTimeout(300)
bills = await dump('fixedCosts')
check('bill toggled off', bills.find((b) => b.name === 'Netflix')?.active === false)

await page.getByRole('button', { name: 'Delete' }).last().click()
await page.waitForTimeout(300)
bills = await dump('fixedCosts')
check('bill deleted', bills.length === 2, `got ${bills.length}`)
check('bills summary recalculated', (await page.locator('text=/250 \\/ 500/').count()) > 0)

await page.locator('button', { hasText: 'Food & Drinks' }).first().click()
await sheet().waitFor()
await sheet().locator('input[type=number]').fill('325')
await sheet().locator('button', { hasText: 'Save' }).click()
await sheet().waitFor({ state: 'detached' })
cats = await dump('categories')
check('category budget saved', cats.find((c) => c.id === 1)?.budget === 325, JSON.stringify(cats.find((c) => c.id === 1)))

await page.locator('button', { hasText: 'Add category' }).click()
await sheet().waitFor()
await sheet().locator('input').nth(1).fill('90')
await sheet().locator('input').nth(2).fill('Cats')
await sheet().locator('button', { hasText: 'Save' }).click()
await sheet().waitFor({ state: 'detached' })
cats = await dump('categories')
check('category added', cats.length === 7 && cats.some((c) => c.names.en === 'Cats'), JSON.stringify(cats.map((c) => c.names.en)))

await page.locator('button', { hasText: 'Cats' }).first().click()
await sheet().waitFor()
await sheet().locator('button[aria-label="Delete"]').click()
await page.waitForTimeout(400)
cats = await dump('categories')
check('category deleted', cats.length === 6, `got ${cats.length}`)
txns = await dump('txns')
check('no orphaned transactions', txns.every((t) => cats.some((c) => c.id === t.categoryId)), JSON.stringify(txns))

// ==========================================================================
section('6. Goals: add, contribute, delete')
await nav('Goals')
await page.waitForTimeout(400)
await page.locator('button', { hasText: 'Add goal' }).first().click()
await sheet().waitFor()
await sheet().getByPlaceholder('Goal name').fill('Bike')
await sheet().locator('input[type=number]').fill('300')
await sheet().locator('button', { hasText: 'Save' }).click()
await sheet().waitFor({ state: 'detached' })
goals = await dump('goals')
check('goal added', goals.length === 2 && goals.some((g) => g.name === 'Bike'), JSON.stringify(goals.map((g) => g.name)))

await page.getByPlaceholder('Add savings').last().fill('50')
await page.getByRole('button', { name: 'Add', exact: true }).last().click()
await waitToastGone()
let contribs = await dump('contributions')
check('contribution saved', contribs.length === 1 && contribs[0].amount === 50, JSON.stringify(contribs))

await page.getByRole('button', { name: 'Delete' }).last().click()
await page.waitForTimeout(400)
goals = await dump('goals')
contribs = await dump('contributions')
check('goal deleted', goals.length === 1 && goals[0].name === 'Gaming PC', JSON.stringify(goals.map((g) => g.name)))
check('goal contributions removed with it', contribs.length === 0, JSON.stringify(contribs))

// ==========================================================================
section('7. Allowance dialog: all three answers')
await openSettings()
await page.waitForTimeout(400)
s = await getSettings()
const cycleLen = Math.round(
  (new Date(`${s.nextAllowance}T12:00:00`) - new Date(`${s.cycleStart}T12:00:00`)) / 86400000,
)

// "Not yet" changes nothing
const beforeNotYet = await getSettings()
await page.locator('button:has-text("I received my allowance")').click()
await page.waitForTimeout(400)
await page.locator('button:has-text("Not yet")').click()
await page.waitForTimeout(300)
check('"not yet" explains nothing changes', await page.locator('text=Nothing changes').isVisible())
await page.locator('button:has-text("Close")').click()
await page.waitForTimeout(300)
s = await getSettings()
check(
  '"not yet" left the cycle alone',
  s.cycleStart === beforeNotYet.cycleStart &&
    s.nextAllowance === beforeNotYet.nextAllowance &&
    s.allowance === beforeNotYet.allowance,
  JSON.stringify({ before: beforeNotYet, after: s }),
)

// "Same as before" starts a fresh cycle with the same amount
await page.locator('button:has-text("I received my allowance")').click()
await page.waitForTimeout(400)
await page.locator('button:has-text("Yes, it came")').click()
await page.waitForTimeout(200)
await page.locator('button:has-text("Same as before")').click()
await page.waitForTimeout(200)
await page.locator('button:has-text("Start the new cycle")').click()
await page.waitForTimeout(600)
s = await getSettings()
check('same amount kept', s.allowance === 500, `got ${s.allowance}`)
check('cycle restarted today', s.cycleStart === today, `got ${s.cycleStart}`)
check('next allowance keeps the cycle length', s.nextAllowance === shiftDays(today, cycleLen), `got ${s.nextAllowance}, wanted ${shiftDays(today, cycleLen)}`)

// "It changed" asks for the new amount
await page.locator('button:has-text("I received my allowance")').click()
await page.waitForTimeout(400)
await page.locator('button:has-text("Yes, it came")').click()
await page.waitForTimeout(200)
await page.locator('button:has-text("It changed")').click()
await page.waitForTimeout(200)
await sheet().locator('input[type=number]').fill('1234')
await page.locator('button:has-text("Start the new cycle")').click()
await page.waitForTimeout(600)
s = await getSettings()
check('new amount saved', s.allowance === 1234, `got ${s.allowance}`)

// empty amount is rejected
await page.locator('button:has-text("I received my allowance")').click()
await page.waitForTimeout(400)
await page.locator('button:has-text("Yes, it came")').click()
await page.waitForTimeout(200)
await page.locator('button:has-text("It changed")').click()
await page.waitForTimeout(200)
await sheet().locator('input[type=number]').fill('')
await page.locator('button:has-text("Start the new cycle")').click()
await page.waitForTimeout(300)
check('empty amount rejected', await page.locator('text=Enter the new amount').isVisible())
check('allowance untouched by the bad attempt', (await getSettings()).allowance === 1234)
await closeSheet()

// back navigation between the two questions
await page.locator('button:has-text("I received my allowance")').click()
await page.waitForTimeout(400)
await page.locator('button:has-text("Yes, it came")').click()
await page.waitForTimeout(200)
await page.locator('.anim-sheet button.btn-ghost').last().click()
await page.waitForTimeout(250)
check('back returns to the first question', await page.locator('text=Did your allowance arrive?').isVisible())
await closeSheet()

// ==========================================================================
section('8. PDF reports')
const [dl1] = await Promise.all([
  page.waitForEvent('download', { timeout: 30000 }),
  page.locator('button:has-text("Last 7 days")').click(),
])
await dl1.saveAs('/tmp/opencode/bughunt-week.pdf')
check('week report downloads', dl1.suggestedFilename().includes('week-report'), dl1.suggestedFilename())

const [dl2] = await Promise.all([
  page.waitForEvent('download', { timeout: 30000 }),
  page.locator('button:has-text("This month")').click(),
])
await dl2.saveAs('/tmp/opencode/bughunt-month.pdf')
check('month report downloads', dl2.suggestedFilename().includes('month-report'), dl2.suggestedFilename())

// empty period: no download, an honest toast
await page.evaluate(async () => {
  const idb = await new Promise((res) => {
    const r = indexedDB.open('wallet-of-shame')
    r.onsuccess = () => res(r.result)
  })
  idb.transaction('txns', 'readwrite').objectStore('txns').clear()
  await new Promise((r) => setTimeout(r, 300))
  idb.close()
})
await page.waitForTimeout(300)
let gotDownload = false
page.once('download', () => {
  gotDownload = true
})
await page.locator('button:has-text("Last 7 days")').click()
await page.waitForTimeout(2500)
check('empty period downloads nothing', !gotDownload)
check('empty period explains itself', await page.locator('text=Nothing was logged in that period').isVisible())

// ==========================================================================
section('9. Demo data + backup + erase + import')
await page.locator('button:has-text("Load demo data")').click()
await page.waitForTimeout(900)
txns = await dump('txns')
s = await getSettings()
check('demo data loaded', txns.length === 13, `got ${txns.length}`)
check('demo keeps the currency', s.currency === 'JPY' || s.currency === 'EUR', `got ${s.currency}`)

const [dl3] = await Promise.all([
  page.waitForEvent('download', { timeout: 30000 }),
  page.locator('button:has-text("Export backup")').click(),
])
await dl3.saveAs('/tmp/opencode/bughunt-backup.json')
const backup = JSON.parse(readFileSync(await dl3.path(), 'utf8'))
check('backup is version 1', backup.version === 1, `got ${backup.version}`)
check('backup carries the transactions', Array.isArray(backup.txns) && backup.txns.length === 13, `${backup.txns?.length}`)
check('backup carries the settings', backup.settings?.setupDone === true, JSON.stringify(backup.settings))

const [dl4] = await Promise.all([
  page.waitForEvent('download', { timeout: 30000 }),
  page.locator('button:has-text("Export transactions")').click(),
])
await dl4.saveAs('/tmp/opencode/bughunt.csv')
const csv = readFileSync(await dl4.path(), 'utf8')
check('csv has the new header', csv.split('\n')[0] === 'date,category,type,impulse,amount,note', csv.split('\n')[0])
check('csv has one line per transaction', csv.trim().split('\n').length === 14, `${csv.trim().split('\n').length}`)

await page.locator('button:has-text("Erase everything")').click()
await page.waitForTimeout(800)
txns = await dump('txns')
cats = await dump('categories')
s = await getSettings()
check('erase emptied the ledger', txns.length === 0)
check('erase re-seeded the categories', cats.length === 6, `got ${cats.length}`)
check('erase restarts the setup', s.setupDone === false)
check('the wizard is back', await page.locator('text=Welcome, soul').isVisible())

// ==========================================================================
section('10. Wizard validation on a second pass')
for (let i = 0; i < 3; i++) {
  await page.locator('button:has-text("→")').click()
  await page.waitForTimeout(200)
}
await page.locator('input[type=number]').fill('')
await page.locator('button:has-text("→")').click()
await page.waitForTimeout(300)
check('wizard refuses an empty allowance', await page.locator('text=Enter your allowance first').isVisible())
check('wizard stays on the allowance step', await page.locator('text=Step 4 of 6').isVisible())
await page.locator('input[type=number]').fill('700')
await page.locator('button:has-text("→")').click()
await page.waitForTimeout(200)
await page.locator('button:has-text("→")').click()
await page.waitForTimeout(200)
await page.locator('button:has-text("Enter the ledger")').click()
await page.waitForTimeout(1000)
check('second setup landed', (await getSettings()).allowance === 700)

// import the backup taken before the erase
await openSettings()
await page.waitForTimeout(400)
await page.locator('input[type=file]').setInputFiles({
  name: 'backup.json',
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(backup)),
})
await page.waitForTimeout(1000)
txns = await dump('txns')
s = await getSettings()
check('import restored the transactions', txns.length === 13, `got ${txns.length}`)
check('import restored the settings', s.allowance === 1000 && s.currency === backup.settings.currency, JSON.stringify({ allowance: s.allowance, currency: s.currency }))
check('import dismissed the wizard', !(await page.locator('text=Welcome, soul').isVisible().catch(() => false)))

// a file that is not a backup is rejected without touching anything
await page.locator('input[type=file]').setInputFiles({
  name: 'junk.json',
  mimeType: 'application/json',
  buffer: Buffer.from('{"nope":true}'),
})
await page.waitForTimeout(700)
check('bad backup is rejected', await page.locator('text=not a valid backup').isVisible())
check('bad backup changed nothing', (await dump('txns')).length === 13)

// ==========================================================================
section('11. Currency, theme, language')
await page.locator('select').first().selectOption('JPY')
await page.waitForTimeout(400)
s = await getSettings()
check('currency saved', s.currency === 'JPY', `got ${s.currency}`)
await nav('Home')
await page.waitForTimeout(400)
check('home shows the new symbol', (await page.locator('body').innerText()).includes('¥'))

await openSettings()
await page.waitForTimeout(300)
await page.locator('button:has-text("Light")').click()
await page.waitForTimeout(300)
check('light theme applied', (await page.getAttribute('html', 'data-theme')) === 'light')
check('theme-color meta updated', (await page.getAttribute('meta[name="theme-color"]', 'content')) === '#f4f1ea')

await page.locator('button:has-text("Français")').click()
await page.waitForTimeout(400)
check('french applied', (await page.locator('nav').innerText()).includes('Accueil'), await page.locator('nav').innerText())
check('french is ltr', (await page.getAttribute('html', 'dir')) === 'ltr')

await page.locator('button:has-text("العربية")').click()
await page.waitForTimeout(400)
check('arabic flips to rtl', (await page.getAttribute('html', 'dir')) === 'rtl')

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(900)
s = await getSettings()
check('language persists', s.lang === 'ar', `got ${s.lang}`)
check('theme persists', s.theme === 'light', `got ${s.theme}`)
check('rtl persists after reload', (await page.getAttribute('html', 'dir')) === 'rtl')
check('arabic UI rendered', (await page.locator('nav').innerText()).includes('الرئيسية'))

await page.locator('header button[aria-label="الإعدادات"]').click()
await page.waitForTimeout(400)
await page.locator('button:has-text("English")').click()
await page.waitForTimeout(300)

// ==========================================================================
section('12. Migration of a pre-existing (old) settings row')
await page.evaluate(async () => {
  const idb = await new Promise((res, rej) => {
    const r = indexedDB.open('wallet-of-shame')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
  // Await the *transaction completion*, not a timer: the journal restores the
  // settings row at boot, so the "old" fixture must be committed before reload
  // or the restore will win the race and the test would assert nothing.
  await new Promise((res, rej) => {
    const tx = idb.transaction('settings', 'readwrite')
    // A pre-migration row: setup already finished (so the journal's restore
    // guard doesn't reclaim it) but currency/theme/profile don't exist yet.
    tx.objectStore('settings').put({
      id: 1,
      lang: 'fr',
      allowance: 321,
      cycleStart: '2026-01-01',
      nextAllowance: '2026-01-31',
      setupDone: true,
    })
    tx.oncomplete = res
    tx.onerror = () => rej(tx.error)
  })
  idb.close()
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(900)
s = await getSettings()
check('migration backfills currency', s.currency === 'MAD', `got ${s.currency}`)
check('migration backfills theme', s.theme === 'dark', `got ${s.theme}`)
check('migration backfills profile', s.profile === 'student', `got ${s.profile}`)
check('migration keeps the old values', s.lang === 'fr' && s.allowance === 321 && s.setupDone === true, JSON.stringify(s))
check(
  'app survived the migration',
  await page.locator('h3', { hasText: "This week's roast" }).or(page.locator('h3')).first().isVisible().catch(() => false),
)

// ==========================================================================
section('Console')
check('no console errors during the whole run', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 5)))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) {
  console.log('\nFailures:')
  for (const p of problems) console.log(` - ${p}`)
}
await browser.close()
process.exit(fail > 0 ? 1 : 0)
