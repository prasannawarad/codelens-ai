// End-to-end flow: register → project → 3 files → audit → report → resolve →
// timeline. Screenshots at each stage. Runs locally (system Chrome) and in CI
// (CHROME_PATH from the runner). Requires API + worker (demo mode) + client.
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const path = require('path');

const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const APP = process.env.APP_URL || 'http://localhost:5173';
const API = process.env.API_URL || 'http://localhost:3001';
const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const stamp = Date.now();
const EMAIL = `flow${stamp}@test.dev`;

const FILES = [
  {
    filename: 'src/payment.js',
    content:
      'const STRIPE_KEY = "sk_live_abc123def456";\n\nfunction charge(amount, card) {\n  if (amount > 0 && card) {\n    console.log(card);\n    return eval("amount * 1.02");\n  }\n  return null;\n}\n\nmodule.exports = { charge };\n',
  },
  {
    filename: 'src/report.py',
    content:
      'def build_report(rows):\n    # TODO: paginate\n    out = []\n    for r in rows:\n        if r:\n            print(r)\n            out.append(r)\n    return out\n',
  },
  {
    filename: 'src/utils.js',
    content: 'export function formatDate(d) {\n  return new Date(d).toISOString();\n}\n',
  },
];

const errors = [];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));

  const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
  const clickText = async (sel, text) => {
    await page.evaluate(
      ({ sel, text }) => {
        const el = [...document.querySelectorAll(sel)].find((e) =>
          e.textContent.trim().includes(text)
        );
        if (!el) throw new Error(`No ${sel} with text "${text}"`);
        el.click();
      },
      { sel, text }
    );
  };
  const waitText = (text, timeout = 20000) =>
    page.waitForFunction(
      (t) => document.body.innerText.includes(t),
      { timeout },
      text
    );

  // 1. Register
  await page.goto(`${APP}/register`, { waitUntil: 'networkidle0' });
  await shot('01-register');
  await page.type('input#name', 'Flow Tester');
  await page.type('input[type=email]', EMAIL);
  await page.type('input[type=password]', 'hunter2222');
  await clickText('button[type=submit]', 'Create account');
  await waitText('Projects');
  await shot('02-dashboard-empty');
  console.log('registered + dashboard OK');

  // 2. Create project
  await clickText('button', 'New project');
  await waitText('New project');
  await page.type('form input:first-of-type', 'Payment Service');
  await clickText('button[type=submit]', 'Create project');
  await waitText('No files yet');
  await shot('03-project-empty');
  console.log('project created OK');

  // 3. Add file 1 via paste modal
  await clickText('button', '+ Add');
  await waitText('Add files');
  await page.type('input[placeholder="src/routes/auth.js"]', FILES[0].filename);
  await page.type('textarea', FILES[0].content);
  await shot('04-paste-modal');
  await clickText('button[type=submit]', 'Add file');
  await waitText('payment.js');
  console.log('paste add OK');

  // Files 2-3 via API for speed, then refresh
  const token = await page.evaluate(() => localStorage.getItem('codelens_token'));
  const projectId = await page.evaluate(() => location.pathname.split('/').pop());
  const res = await fetch(`${API}/api/projects/${projectId}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(FILES.slice(1)),
  });
  if (res.status !== 201) throw new Error(`file add failed: ${res.status}`);
  await page.reload({ waitUntil: 'networkidle0' });
  await waitText('report.py');

  // open a file in the viewer
  await clickText('button', 'src/payment.js');
  await waitText('STRIPE_KEY');
  await shot('05-project-files');
  console.log('3 files present, code viewer OK');

  // 4. Run audit
  await clickText('button', 'Run audit');
  await page.waitForFunction(
    () => document.body.innerText.match(/Queued|static metrics|AI analysis|Scoring/),
    { timeout: 10000 }
  );
  await shot('06-audit-progress');
  // AuditProgress auto-navigates to the report on completion
  await waitText('Audit report', 60000);
  await waitText('Static metrics');
  await shot('07-audit-report');
  console.log('audit completed, report rendered OK');

  // 5. Resolve an issue
  await clickText('button', 'Mark resolved');
  await waitText('Reopen');
  await shot('08-issue-resolved');
  console.log('resolve toggle OK');

  // 6. Timeline
  await clickText('a', 'Timeline');
  await waitText('Debt timeline');
  await waitText('Audit history');
  await shot('09-timeline');
  console.log('timeline OK');

  if (errors.length) {
    console.log('CONSOLE ERRORS:');
    errors.forEach((e) => console.log('  -', e));
  } else {
    console.log('no console errors');
  }
  await browser.close();
  console.log('FLOW COMPLETE');
})().catch(async (err) => {
  console.error('FLOW FAILED:', err.message);
  if (errors.length) errors.forEach((e) => console.log('  console -', e));
  process.exit(1);
});
