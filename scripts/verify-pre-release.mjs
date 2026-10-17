// 공개 전 확인 — 운영자 정보와 개인정보 처리방침이 사실과 같은가.
//
// 개인정보 처리방침은 「무엇을 수집하는가」를 사람이 손으로 적는 문서다. 수집 항목이 늘었는데 문서를 안 고치면
// 방침이 사실과 달라지는데, 화면만 봐서는 알 수 없다. 여기서 등록 API가 받는 항목과 방침의 표를 대조한다.
// 운영자 정보(운영자명·보호책임자·관할 등)는 사람이 채워야 하므로, 비어 있으면 **막지 않고 알린다**.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const operatorInfo = read('src/lib/operator-info.ts');

// ── 수집 항목: 등록 API ↔ 처리방침 ─────────────────────────────────────
// 등록 API가 받는 키(배포 관리용 메타는 뺀다) 하나하나가 방침의 표에 있어야 한다.
const registerRoute = read('src/app/api/license/register/route.ts');
const allowedBlock = registerRoute.slice(registerRoute.indexOf('const allowedKeys = ['), registerRoute.indexOf('] as const'));
const apiKeys = [...allowedBlock.matchAll(/'([a-z_]+)'/g)].map((match) => match[1])
  .filter((key) => !['accepted_terms_version', 'app_version'].includes(key));
assert.ok(apiKeys.length >= 5, `등록 API의 수집 항목을 읽지 못했다: ${apiKeys.join(', ')}`);

const KEY_LABELS = {
  email: '이메일',
  company_name: '회사명',
  contact_name: '담당자명',
  contact_phone: '연락처',
  country: '국가',
  industry: '업종',
};
const declaredBlock = operatorInfo.slice(operatorInfo.indexOf('COLLECTED_PERSONAL_DATA = ['), operatorInfo.indexOf('] as const', operatorInfo.indexOf('COLLECTED_PERSONAL_DATA = [')));
const declared = [...declaredBlock.matchAll(/field: '([^']+)'/g)].map((match) => match[1]);

const missingLabel = apiKeys.filter((key) => !KEY_LABELS[key]);
assert.deepEqual(missingLabel, [], `등록 API에 새 수집 항목이 생겼는데 이름을 모른다 — scripts/verify-pre-release.mjs의 KEY_LABELS와 개인정보 처리방침에 추가하세요: ${missingLabel.join(', ')}`);
const undeclared = apiKeys.map((key) => KEY_LABELS[key]).filter((label) => !declared.includes(label));
assert.deepEqual(undeclared, [], `개인정보 처리방침에 없는 수집 항목이 있다 — src/lib/operator-info.ts의 COLLECTED_PERSONAL_DATA에 추가하세요: ${undeclared.join(', ')}`);
const overDeclared = declared.filter((label) => !apiKeys.map((key) => KEY_LABELS[key]).includes(label));
assert.deepEqual(overDeclared, [], `수집하지 않는 항목이 처리방침에 있다: ${overDeclared.join(', ')}`);

// ── 문의 창(/api/contact)의 전송 항목과 메일 발송 업체도 방침에 있다 ────────────────
{
  const contactRoute = read('src/app/api/contact/route.ts');
  const contactBlock = contactRoute.slice(contactRoute.indexOf('const allowedKeys = ['), contactRoute.indexOf('] as const'));
  const contactKeys = [...contactBlock.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
  const CONTACT_LABELS = { ...KEY_LABELS, inquiry_type: '문의 유형', message: '문의 내용', source_path: '문의한 화면', app_version: '앱 버전' };
  assert.ok(contactKeys.length >= 8, `문의 API의 전송 항목을 읽지 못했다: ${contactKeys.join(', ')}`);
  const unlabeled = contactKeys.filter((key) => !CONTACT_LABELS[key]);
  assert.deepEqual(unlabeled, [], `문의 API에 새 전송 항목이 생겼는데 이름을 모른다 — KEY_LABELS(CONTACT_LABELS)와 CONTACT_FORM_PERSONAL_DATA에 추가하세요: ${unlabeled.join(', ')}`);
  const contactBlockText = operatorInfo.slice(operatorInfo.indexOf('CONTACT_FORM_PERSONAL_DATA = ['), operatorInfo.indexOf('] as const', operatorInfo.indexOf('CONTACT_FORM_PERSONAL_DATA = [')));
  const undeclaredContact = contactKeys.map((key) => CONTACT_LABELS[key]).filter((label) => !contactBlockText.includes(label));
  assert.deepEqual(undeclaredContact, [], `개인정보 처리방침의 문의 창 항목에 없다 — src/lib/operator-info.ts의 CONTACT_FORM_PERSONAL_DATA에 추가하세요: ${undeclaredContact.join(', ')}`);
  assert.match(read('src/app/privacy/page.tsx'), /문의 창으로 문의를 보낼 때/, '처리방침에 문의 창 절이 없다');
  // 메일 발송 업체: 코드가 부르는 곳은 모두 처리 위탁 목록에 있다
  const mailCode = read('src/lib/license-api.ts');
  const processorBlock = operatorInfo.slice(operatorInfo.indexOf('PERSONAL_DATA_PROCESSORS = ['), operatorInfo.indexOf('] as const', operatorInfo.indexOf('PERSONAL_DATA_PROCESSORS = [')));
  for (const [needle, name] of [['api.resend.com', 'Resend'], ['gmail.googleapis.com', 'Google']]) {
    if (mailCode.includes(needle)) assert.ok(processorBlock.includes(`name: '${name}`), `메일 발송 코드가 ${needle}를 부르는데 처리 위탁 목록에 ${name}이 없다`);
  }
}

// ── 처리방침이 현재 시제인가 ───────────────────────────────────────────
// 라이선스 등록은 이미 동작 중이다. 「향후 … 검토합니다」는 사실과 다르다.
const privacy = read('src/app/privacy/page.tsx');
assert.doesNotMatch(privacy, /향후 무료 라이선스 또는 관리자 콘솔이 연결되면/, '개인정보 처리방침이 실제 수집을 「향후 검토」로 적고 있다');
assert.match(privacy, /무료 라이선스 등록은 앱을 쓰기 위한 필수 절차/, '등록이 필수라는 사실을 말하지 않는다');
for (const [section, pattern] of [
  ['보유 기간', /보유 기간/],
  ['처리 위탁', /처리 위탁/],
  ['국외 이전', /국외로 이전/],
  ['정보주체 권리', /열람, 정정, 삭제, 처리정지/],
  ['보호책임자', /개인정보 보호책임자/],
  ['침해 신고처', /개인정보침해신고센터/],
]) {
  assert.match(privacy, pattern, `개인정보 처리방침에 「${section}」이 없다`);
}

// ── 약관 ───────────────────────────────────────────────────────────
const terms = read('src/app/terms/page.tsx');
assert.match(terms, /준거법과 관할/, '약관에 준거법·관할이 없다');
assert.match(terms, /무료 라이선스 등록/, '약관이 라이선스 등록 시 개인정보가 전송된다는 것을 말하지 않는다');
for (const page of [privacy, terms]) {
  assert.match(page, /OperatorInfoGapNotice/, '운영자 정보가 비어 있을 때 알리는 배너가 없다');
  assert.match(page, /isOperatorInfoComplete\(\)/, '운영자 정보를 다 채워도 「검토 필요」 배지가 그대로 남는다');
}

// ── 운영자 정보: 비어 있으면 막지 않고 알린다(사람이 정할 일) ──────────
const blockStart = operatorInfo.indexOf('export const OPERATOR_INFO: OperatorInfo = {');
const block = operatorInfo.slice(blockStart, operatorInfo.indexOf('};', blockStart));
const gaps = [...block.matchAll(/(\w+): '',/g)].map((match) => match[1]);
assert.match(operatorInfo, /export function getOperatorInfoGaps/, '빈칸을 셀 방법이 없다');
if (gaps.length > 0) {
  console.log(`Pre-release verification passed — 수집 항목 ${apiKeys.length}종이 처리방침과 일치.`);
  console.log(`  ⚠ 공개 전 채워야 할 운영자 정보 ${gaps.length}건: ${gaps.join(', ')}`);
  console.log('    src/lib/operator-info.ts에서 채우세요. 절차: docs/pre-release-checklist.md');
} else {
  console.log(`Pre-release verification passed — 운영자 정보 완료, 수집 항목 ${apiKeys.length}종이 처리방침과 일치.`);
}
