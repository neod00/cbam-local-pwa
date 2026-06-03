import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const requiredFiles = [
  'src/lib/contact.ts',
  'src/lib/license-api.ts',
  'src/components/ContactDialog.tsx',
  'src/components/Sidebar.tsx',
  'src/app/api/contact/route.ts',
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
  'CONTACT_MESSAGE_MAX_LENGTH',
  'CONTACT_INQUIRY_TYPES',
  'createContactMailto',
  'mailto:',
  'encodeMailtoValue',
  'encodeURIComponent',
  '생산량, 배출량, EU 템플릿 작성본, .cbam 백업 파일',
]) {
  assert.ok(contact.includes(required), `contact helper should include ${required}`);
}

assert.equal(contact.includes('new URLSearchParams'), false, 'contact mailto helper should not encode spaces as plus signs');
assert.equal(contact.includes('회사명:'), false, 'direct mailto fallback should not ask again for profile fields');
assert.equal(contact.includes('담당자:'), false, 'direct mailto fallback should not ask again for profile fields');
assert.equal(contact.includes('연락처:'), false, 'direct mailto fallback should not ask again for profile fields');

const licenseApi = readFileSync('src/lib/license-api.ts', 'utf8');
for (const required of [
  'sendOperationalTextEmail',
  'Reply-To',
  'sendLicenseVerificationEmail',
  'GMAIL_REFRESH_TOKEN',
  'RESEND_API_KEY',
]) {
  assert.ok(licenseApi.includes(required), `license mail helper should include ${required}`);
}

const dialog = readFileSync('src/components/ContactDialog.tsx', 'utf8');
for (const required of [
  'FREE_LICENSE_SETTING_KEY',
  'getLocalSetting<FreeLicenseRegistration>',
  'CONTACT_DATA_WARNING',
  'CONTACT_MESSAGE_MAX_LENGTH',
  '/api/contact',
  'source_path',
  'app_version',
  'SUPPORT_EMAIL',
  '로 이메일로 직접 문의하기',
  '무료 라이선스 등록 정보로 문의합니다',
]) {
  assert.ok(dialog.includes(required), `contact dialog should include ${required}`);
}

for (const forbidden of [
  'type="checkbox"',
  '회사명 *',
  '담당자명 *',
  '연락처 *',
]) {
  assert.equal(dialog.includes(forbidden), false, `contact dialog should not include ${forbidden}`);
}

const contactApi = readFileSync('src/app/api/contact/route.ts', 'utf8');
for (const required of [
  'hasOnlyAllowedKeys',
  'sendOperationalTextEmail',
  'SUPPORT_EMAIL',
  'email',
  'company_name',
  'contact_name',
  'contact_phone',
  'country',
  'industry',
  'inquiry_type',
  'message',
  'source_path',
  'app_version',
  '문의 내용을 DB에 저장하지 않고 운영 메일 발송에만 사용',
]) {
  assert.ok(contactApi.includes(required), `contact API should include ${required}`);
}

for (const forbidden of [
  '@/lib/admin-db',
  'getAdminSql',
  'DATABASE_URL',
  'template_file',
  'backup_file',
  'production_volume',
  'supplier_evidence',
]) {
  assert.equal(contactApi.includes(forbidden), false, `contact API should not include ${forbidden}`);
}

const sidebar = readFileSync('src/components/Sidebar.tsx', 'utf8');
for (const required of [
  'ContactDialog',
  '[CBAM Local] 사용/사업 문의',
  '사용/사업 문의',
]) {
  assert.ok(sidebar.includes(required), `sidebar should include ${required}`);
}

const license = readFileSync('src/app/license/page.tsx', 'utf8');
for (const required of [
  'ContactDialog',
  '[CBAM Local] 무료 사용 승인 문의',
  '승인·사용 문의',
  '무료 사용 문의하기',
]) {
  assert.ok(license.includes(required), `license page should include ${required}`);
}

const settings = readFileSync('src/app/settings/page.tsx', 'utf8');
for (const required of [
  'ContactDialog',
  '[CBAM Local] 사용/도입/컨설팅 문의',
  '사용·도입 문의',
  '등록 정보를 다시 입력하지 않습니다',
]) {
  assert.ok(settings.includes(required), `settings page should include ${required}`);
}

const exportPage = readFileSync('src/app/export/page.tsx', 'utf8');
for (const required of [
  'ContactDialog',
  '[CBAM Local] CBAM Export 검토 문의',
  'CBAM 산정·Export 검토 문의',
  'Export 검토 문의',
]) {
  assert.ok(exportPage.includes(required), `export page should include ${required}`);
}

console.log('Contact form verification passed.');
