import { createRequire } from 'node:module';
const require = createRequire('C:/Users/NT940XHA/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/');
export const { chromium } = require('playwright-core');
export async function open() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? await context.newPage();
  page.setDefaultTimeout(20000);
  return { browser, context, page };
}
export const mapText = async (page) => {
  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(2500);
  return (await page.locator('main').innerText()).replace(/\n+/g, ' | ').slice(0, 1400);
};
export const openStep = async (page, n) => {
  await page.locator(`svg g:has(> title:text-matches("^${n}단계"))`).first().click();
  await page.waitForTimeout(1500);
};
export const dumpForm = async (page, label = '') => {
  const fields = await page.locator('main').evaluate((root) => {
    const out = [];
    root.querySelectorAll('input, select, textarea').forEach((el) => {
      if (el.type === 'file' || el.offsetParent === null) return;
      let lab = el.getAttribute('aria-label') || '';
      if (!lab && el.id) lab = root.querySelector(`label[for="${el.id}"]`)?.textContent ?? '';
      if (!lab) lab = el.closest('label')?.textContent ?? el.closest('div')?.querySelector('label, p, span')?.textContent ?? '';
      out.push(`${el.tagName.toLowerCase()}${el.type ? ':' + el.type : ''} | ${lab.trim().slice(0, 40)} | ph=${(el.placeholder || '').slice(0, 24)} | v=${String(el.value).slice(0, 24)}`);
    });
    return out;
  });
  console.log(`--- form ${label} (${fields.length})`); fields.forEach((f, i) => console.log(String(i).padStart(2), f));
  console.log('buttons:', (await page.getByRole('button').allInnerTexts()).filter(Boolean).map((b) => b.replace(/\n/g, ' ').slice(0, 22)).join(' / '));
};
