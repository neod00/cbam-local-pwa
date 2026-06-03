import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const requiredFiles = [
  'db/admin/001_init.sql',
  'db/admin/003_license_email_verifications.sql',
  'src/lib/admin-db.ts',
  'src/lib/license-api.ts',
  'src/app/api/license/register/route.ts',
  'src/app/api/license/request-code/route.ts',
  'src/app/api/license/status/route.ts',
  'src/app/api/license/verify-code/route.ts',
  'src/app/api/update-manifest/route.ts',
  'src/app/api/announcements/route.ts',
  'src/lib/free-license-client.ts',
];

for (const file of requiredFiles) {
  assert.ok(existsSync(file), `${file} should exist`);
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
assert.ok(packageJson.dependencies['@neondatabase/serverless'], 'Neon serverless driver should be installed');

const schema = [
  readFileSync('db/admin/001_init.sql', 'utf8'),
  readFileSync('db/admin/003_license_email_verifications.sql', 'utf8'),
].join('\n');
for (const required of [
  'license_users',
  'update_manifests',
  'announcements',
  'terms_versions',
  'contact_phone',
  'license_key',
  'expires_at',
  'license_email_verifications',
  'UNREGISTERED',
  'FREE_ACTIVE',
  'RECHECK_REQUIRED',
  'required',
]) {
  assert.ok(schema.includes(required), `admin DB schema should include ${required}`);
}

const dbClient = readFileSync('src/lib/admin-db.ts', 'utf8');
assert.ok(dbClient.includes('@neondatabase/serverless'), 'admin DB client should use the Neon serverless driver');
assert.ok(dbClient.includes('DATABASE_URL'), 'admin DB client should support DATABASE_URL');
assert.ok(dbClient.includes('POSTGRES_URL'), 'admin DB client should support POSTGRES_URL');

const registerApi = readFileSync('src/app/api/license/register/route.ts', 'utf8');
for (const required of [
  'email',
  'company_name',
  'contact_name',
  'contact_phone',
  'country',
  'industry',
  'accepted_terms_version',
  'app_version',
  'hasOnlyAllowedKeys',
  "'UNREGISTERED'",
  '무료 사용 등록이 접수되었습니다',
]) {
  assert.ok(registerApi.includes(required), `license register API should include ${required}`);
}

const statusApi = readFileSync('src/app/api/license/status/route.ts', 'utf8');
for (const required of [
  'license_key',
  'minimum_supported_version',
  'terms_version',
  'notice_count',
  'next_check_after',
  'expires_at',
]) {
  assert.ok(statusApi.includes(required), `license status API should include ${required}`);
}

const requestCodeApi = readFileSync('src/app/api/license/request-code/route.ts', 'utf8');
for (const required of [
  'email',
  'license_email_verifications',
  'hashVerificationCode',
  'sendLicenseVerificationEmail',
  '등록된 이메일이면 인증코드를 발송합니다',
]) {
  assert.ok(requestCodeApi.includes(required), `license request-code API should include ${required}`);
}

const verifyCodeApi = readFileSync('src/app/api/license/verify-code/route.ts', 'utf8');
for (const required of [
  'email',
  'code',
  'app_version',
  'license_email_verifications',
  'attempt_count',
  'consumed_at',
  'license_key',
  'expires_at',
]) {
  assert.ok(verifyCodeApi.includes(required), `license verify-code API should include ${required}`);
}

const updateApi = readFileSync('src/app/api/update-manifest/route.ts', 'utf8');
for (const required of [
  'latest_version',
  'minimum_supported_version',
  'update_policy',
  'release_notes_url',
  'defaultUpdateManifest',
]) {
  assert.ok(updateApi.includes(required), `update manifest API should include ${required}`);
}

const announcementsApi = readFileSync('src/app/api/announcements/route.ts', 'utf8');
for (const required of ['title', 'body', 'severity', 'starts_at', 'ends_at']) {
  assert.ok(announcementsApi.includes(required), `announcements API should include ${required}`);
}

const freeLicenseClient = readFileSync('src/lib/free-license-client.ts', 'utf8');
for (const required of [
  'email',
  'company_name',
  'contact_name',
  'contact_phone',
  'country',
  'industry',
  'accepted_terms_version',
  'app_version',
  '/api/license/register',
  '/api/license/status',
  'OFFLINE_ALLOWED',
  'isLicenseExpired',
  'expires_at',
  'requestFreeLicenseRecoveryCode',
  'verifyFreeLicenseRecoveryCode',
]) {
  assert.ok(freeLicenseClient.includes(required), `free license client should include ${required}`);
}

const licenseApi = readFileSync('src/lib/license-api.ts', 'utf8');
for (const required of [
  'GMAIL_CLIENT_ID',
  'GMAIL_CLIENT_SECRET',
  'GMAIL_REFRESH_TOKEN',
  'GMAIL_FROM_EMAIL',
  'gmail.googleapis.com/gmail/v1/users/me/messages/send',
  'RESEND_API_KEY',
]) {
  assert.ok(licenseApi.includes(required), `license API helper should include ${required}`);
}

const apiSource = requiredFiles
  .filter((file) => file.endsWith('.ts') || file.endsWith('.sql'))
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');

for (const forbidden of [
  'source_stream',
  'precursor_id',
  'output_mass_t',
  'direct_emissions_tco2e',
  'indirect_emissions_tco2e',
  'see_cbam_basis',
  'see_informational_total',
  'template_file',
  'backup_file',
  'supplier_evidence',
]) {
  assert.equal(apiSource.includes(forbidden), false, `license/admin API source should not contain ${forbidden}`);
}

console.log('License API boundary verification passed.');
