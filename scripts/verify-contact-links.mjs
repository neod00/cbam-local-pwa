import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const requiredFiles = [
  'src/lib/contact.ts',
  'src/components/Sidebar.tsx',
  'src/app/license/page.tsx',
  'src/app/settings/page.tsx',
  'src/app/export/page.tsx',
];

for (const file of requiredFiles) {
  assert.ok(existsSync(file), `${file} should exist`);
}

const contact = readFileSync('src/lib/contact.ts', 'utf8');
for (const required of [
  "SUPPORT_EMAIL = 'openbrain.main@gmail.com'",
  'CONTACT_DATA_WARNING',
  'createContactMailto',
  'mailto:',
  'encodeMailtoValue',
  'encodeURIComponent',
  '생산량, 배출량, EU 템플릿 작성본, .cbam 백업 파일',
]) {
  assert.ok(contact.includes(required), `contact helper should include ${required}`);
}

assert.equal(contact.includes('new URLSearchParams'), false, 'contact mailto helper should not encode spaces as plus signs');

const sidebar = readFileSync('src/components/Sidebar.tsx', 'utf8');
for (const required of [
  'createContactMailto',
  '[CBAM Local] 사용/사업 문의',
  '사용/사업 문의',
]) {
  assert.ok(sidebar.includes(required), `sidebar should include ${required}`);
}

const license = readFileSync('src/app/license/page.tsx', 'utf8');
for (const required of [
  'CONTACT_DATA_WARNING',
  'SUPPORT_EMAIL',
  '[CBAM Local] 무료 사용 승인 문의',
  '승인·사용 문의',
  '무료 사용 문의 메일 보내기',
]) {
  assert.ok(license.includes(required), `license page should include ${required}`);
}

const settings = readFileSync('src/app/settings/page.tsx', 'utf8');
for (const required of [
  'CONTACT_DATA_WARNING',
  'SUPPORT_EMAIL',
  '[CBAM Local] 사용/도입/컨설팅 문의',
  '사용·도입 문의',
  '문의 메일 보내기',
]) {
  assert.ok(settings.includes(required), `settings page should include ${required}`);
}

const exportPage = readFileSync('src/app/export/page.tsx', 'utf8');
for (const required of [
  'CONTACT_DATA_WARNING',
  'SUPPORT_EMAIL',
  '[CBAM Local] CBAM Export 검토 문의',
  'CBAM 산정·Export 검토 문의',
  'Export 검토 문의',
]) {
  assert.ok(exportPage.includes(required), `export page should include ${required}`);
}

console.log('Contact link verification passed.');
