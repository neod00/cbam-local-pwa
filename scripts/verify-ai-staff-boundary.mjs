import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const requiredFiles = [
  'docs/ai-staff/README.md',
  'src/lib/ai-staff/agent-definitions.ts',
  'src/components/admin/AiStaffCopyButton.tsx',
  'src/app/admin/ai-staff/page.tsx',
  'src/components/AdminShell.tsx',
];

for (const file of requiredFiles) {
  assert.ok(existsSync(file), `${file} should exist`);
}

const agentDocs = [
  'chief-of-staff',
  'regulation-researcher',
  'product-impact-analyst',
  'calculation-qa',
  'customer-onboarding',
  'cibongi-usability-tester',
  'sales-discovery',
  'content-trust',
  'product-developer',
  'release-qa',
];

for (const doc of agentDocs) {
  assert.ok(existsSync(`docs/ai-staff/agents/${doc}.md`), `${doc} agent document should exist`);
}

for (const workflow of [
  'customer-inquiry',
  'regulation-update',
  'beginner-usability-review',
  'app-impact-review',
  'weekly-operations',
  'release-check',
]) {
  assert.ok(existsSync(`docs/ai-staff/workflows/${workflow}.md`), `${workflow} workflow document should exist`);
}

const definitions = readFileSync('src/lib/ai-staff/agent-definitions.ts', 'utf8');
for (const required of [
  'AI_STAFF_DATA_BOUNDARY',
  'aiStaffAgents',
  'aiStaffWorkflows',
  'AI Chief of Staff',
  'CBAM Regulation Researcher',
  'CBAM Product Impact Analyst',
  'Calculation QA Agent',
  'Customer Onboarding Agent',
  'Cibongi Novice Usability Tester',
  'Sales / Discovery Agent',
  'Content / Trust Agent',
  'Product / Developer Agent',
  'Release QA Agent',
  'executionMode: \'manual\'',
  'automationReady',
  '.cbam 백업 파일',
  '대표 승인',
]) {
  assert.ok(definitions.includes(required), `AI staff definitions should include ${required}`);
}

const agentsSection = definitions.slice(
  definitions.indexOf('export const aiStaffAgents'),
  definitions.indexOf('export const aiStaffWorkflows')
);
const agentIdCount = [...agentsSection.matchAll(/id: '/g)].length;
assert.equal(agentIdCount, 10, 'AI staff definitions should contain exactly 10 agent IDs');

const adminPage = readFileSync('src/app/admin/ai-staff/page.tsx', 'utf8');
for (const required of [
  'AI 직원 운영 콘솔',
  '현재 수동 운영',
  'API key 없이 사용 가능',
  'OPENAI_API_KEY',
  '프롬프트 복사',
  '출력 양식 복사',
  '실행 브리프 복사',
  'AI_STAFF_DATA_BOUNDARY',
  '대표 승인',
]) {
  assert.ok(adminPage.includes(required), `AI staff admin page should include ${required}`);
}

const copyButton = readFileSync('src/components/admin/AiStaffCopyButton.tsx', 'utf8');
for (const required of ['navigator.clipboard.writeText', '복사 완료']) {
  assert.ok(copyButton.includes(required), `copy button should include ${required}`);
}

const adminShell = readFileSync('src/components/AdminShell.tsx', 'utf8');
assert.ok(adminShell.includes('AI 직원 운영'), 'admin shell should link to AI staff operations');
assert.ok(adminShell.includes('/admin/ai-staff'), 'admin shell should link to /admin/ai-staff');

const aiAdminSource = [
  adminPage,
  definitions,
  copyButton,
].join('\n');

for (const forbiddenImport of [
  '@/lib/local-db',
  '@/lib/calculation-engine',
  '@/lib/eu-template-export',
  '@/lib/scenario-calculation',
  '@/lib/reference-workbooks',
]) {
  assert.equal(aiAdminSource.includes(forbiddenImport), false, `AI staff admin source should not import ${forbiddenImport}`);
}

for (const forbiddenRuntime of [
  'process.env.OPENAI_API_KEY',
  '/api/admin/ai/run',
  'setInterval(',
  'cron',
]) {
  assert.equal(aiAdminSource.includes(forbiddenRuntime), false, `AI staff admin source should not enable automation via ${forbiddenRuntime}`);
}

for (const forbiddenField of [
  'source_stream',
  'precursor_id',
  'output_mass_t',
  'direct_emissions_tco2e',
  'indirect_emissions_tco2e',
  'see_cbam_basis',
  'see_informational_total',
  'template_file',
  'backup_file',
  'production_volume',
  'supplier_evidence',
]) {
  assert.equal(aiAdminSource.includes(forbiddenField), false, `AI staff admin source should not define forbidden field ${forbiddenField}`);
}

const readme = readFileSync('docs/ai-staff/README.md', 'utf8');
for (const required of [
  'API key: 불필요',
  'OPENAI_API_KEY',
  '브라우저 PWA 코드에 API key를 노출하지 않음',
  '자동 실행하지 않는다',
]) {
  assert.ok(readme.includes(required), `AI staff README should include ${required}`);
}

console.log('AI staff boundary verification passed.');
