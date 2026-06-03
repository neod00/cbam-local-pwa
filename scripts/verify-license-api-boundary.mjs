import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const requiredFiles = [
  'db/admin/001_init.sql',
  'src/lib/admin-db.ts',
  'src/lib/license-api.ts',
  'src/app/api/license/register/route.ts',
  'src/app/api/license/status/route.ts',
  'src/app/api/update-manifest/route.ts',
  'src/app/api/announcements/route.ts',
];

for (const file of requiredFiles) {
  assert.ok(existsSync(file), `${file} should exist`);
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
assert.ok(packageJson.dependencies['@neondatabase/serverless'], 'Neon serverless driver should be installed');

const schema = readFileSync('db/admin/001_init.sql', 'utf8');
for (const required of [
  'license_users',
  'update_manifests',
  'announcements',
  'terms_versions',
  'contact_phone',
  'license_key',
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
  '무료 라이선스가 등록되었습니다',
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
]) {
  assert.ok(statusApi.includes(required), `license status API should include ${required}`);
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
