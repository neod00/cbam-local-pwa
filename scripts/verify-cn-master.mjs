// CN 마스터 드리프트 게이트.
//
// src/lib/cn-master.generated.ts 는 생성 파일이지만 커밋된다. 즉 사람이 손댈 수 있고,
// 원본 템플릿이 교체됐는데 재생성을 안 할 수도 있다. 그러면 앱이 "공식 워크북을 조회했다"고
// 말하면서 실제로는 누군가 손으로 고친 값을 쓰게 된다 — 접두 휴리스틱보다 나쁘다(권위를 참칭).
//
// 이 게이트는 생성기를 다시 돌려 **바이트 단위로 비교**한다. 다르면 실패.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const GENERATED = 'src/lib/cn-master.generated.ts';
const TEMPLATE = 'public/templates/CBAM_Communication_template_for_installations_en_20241213.xlsx';

function fail(message) {
    console.error(`CN master verification FAILED: ${message}`);
    process.exit(1);
}

// 개행은 정규화해 비교한다. core.autocrlf=true 환경에서는 git이 체크아웃 시 CRLF로 바꾸는데
// 생성기는 LF로 쓰므로, 바이트 그대로 비교하면 **내용이 같아도** 실패한다.
// 잡으려는 것은 개행이 아니라 내용 드리프트다.
const normalize = (text) => text.replace(/\r\n/g, '\n');

const committed = readFileSync(GENERATED, 'utf8');
let regenerated;

// 백업 파일을 쓰지 않는다. 복원은 메모리의 committed로 하므로 파일은 유출 경로일 뿐이었다 —
// fail()의 process.exit이 finally를 건너뛰어 실패할 때마다 .verify-backup이 남았고,
// gitignore 대상도 아니라 git add -A로 CN 마스터 사본이 커밋될 수 있었다(씨밤이 P2).
try {
    execFileSync('node', ['scripts/generate-cn-master.mjs'], { stdio: 'pipe' });
    regenerated = readFileSync(GENERATED, 'utf8');
} finally {
    // 생성기가 덮어쓴 파일을 반드시 커밋본으로 되돌린다. 생성기가 던져도 작업트리를 더럽히지 않는다.
    writeFileSync(GENERATED, committed);
}

if (normalize(regenerated) !== normalize(committed)) {
    fail(
        `${GENERATED}가 원본 템플릿에서 재생성한 결과와 다릅니다.\n` +
        '  생성 파일을 손으로 고쳤거나, 템플릿이 교체됐는데 재생성하지 않았습니다.\n' +
        '  `npm run generate:cn-master`를 실행하고 변경 내용을 리뷰하세요.\n' +
        '  플래그가 바뀌면 SEE가 바뀝니다 — 그 결정 자리는 PR 리뷰입니다.'
    );
}

// 원본 판본 핀 — 템플릿이 바뀌면 생성 파일의 sha256도 바뀌므로 위 비교에서 이미 잡히지만,
// 어느 파일이 원본인지를 게이트가 명시적으로 확인해 둔다.
const actualSha = createHash('sha256').update(readFileSync(TEMPLATE)).digest('hex');
const pinnedSha = committed.match(/CN_MASTER_SOURCE_SHA256 = '([0-9a-f]+)'/)?.[1];

if (pinnedSha !== actualSha) {
    fail(`원본 템플릿 sha256 불일치. 핀=${pinnedSha?.slice(0, 16)}… 실제=${actualSha.slice(0, 16)}…`);
}

// 이 워크북은 "Annex II"를 인용하지 않는다. 그 사실이 코드 주석에서 사라지면
// 다음 사람이 "Annex II 등재를 확인했다"고 쓰게 된다. 고지를 고정한다.
if (!committed.includes('Annex II 등재」가 아니다')) {
    fail('생성 파일에서 「이 플래그는 Annex II 등재가 아니다」 고지가 사라졌습니다. 이 고지는 사실이며 지우면 안 됩니다.');
}

if (!/CN_MASTER_LEGAL_BASIS_VERIFIED = false as const/.test(committed)) {
    fail('CN_MASTER_LEGAL_BASIS_VERIFIED가 리터럴 false가 아닙니다. Annex II 법적 동치는 EUR-Lex 원문 대조 미완입니다.');
}

// 판정에 실제로 쓰이는 사실 몇 가지를 고정한다. 이 값이 조용히 바뀌면 SEE가 바뀐다.
const expectations = [
    ['"Iron or steel products": false', '철강 제품 = 직접배출만'],
    ['"Crude steel": false', '조강 = 직접배출만'],
    ['"Sintered Ore": true', 'CN 2601 12 00 응결 철광석 = 간접 포함 (철강계 유일 예외)'],
    ['"Hydrogen": false', '수소 = 직접배출만'],
    ['"Cement": true', '시멘트 = 간접 포함'],
    ['"26011200": "Sintered Ore"', 'CN 26011200 → Sintered Ore 매핑'],
    ['"73063077": "Iron or steel products"', 'CN 73063077 → Iron or steel products 매핑'],
];

for (const [needle, label] of expectations) {
    if (!committed.includes(needle)) {
        fail(`${label} — 「${needle}」을(를) 생성 파일에서 찾지 못했습니다.`);
    }
}

// 접두 휴리스틱이 오판하던 CN이 마스터에 없어야 한다(포함 목록이므로 부재로 확인).
for (const [cn, label] of [['72042100', '철강 스크랩'], ['73151100', '체인(73류이나 CBAM 목록 밖)']]) {
    if (committed.includes(`"${cn}":`)) {
        fail(`${label} CN ${cn}이 마스터에 있습니다 — 접두 휴리스틱 회귀 전제가 깨졌습니다.`);
    }
}

const cnCount = (committed.match(/^    "\d+": "/gm) ?? []).length;
const goodsCount = (committed.match(/^    "[^"]+": (true|false),$/gm) ?? []).length;

if (cnCount !== 569) {
    fail(`CN 개수가 569가 아닙니다: ${cnCount}`);
}

if (goodsCount !== 18) {
    fail(`품목군 개수가 18이 아닙니다: ${goodsCount}`);
}

// 개행이 CRLF로 체크아웃돼도 게이트가 통과해야 한다.
// core.autocrlf=true 환경에서 git이 CRLF로 바꿔놓는데 생성기는 LF로 쓴다. 이걸 바이트 그대로
// 비교하면 내용이 같아도 실패해 main의 verify가 깨진다 — 실제로 깨뜨렸다.
// 반대로 내용이 다르면 개행과 무관하게 반드시 잡아야 한다.
const crlf = committed.replace(/\n/g, '\r\n').replace(/\r\r\n/g, '\r\n');
const lf = committed.replace(/\r\n/g, '\n');

if (normalize(crlf) !== normalize(lf)) {
    fail('개행 정규화가 깨졌습니다 — CRLF/LF가 정규화 후 같아야 합니다.');
}

// 내용 드리프트는 개행과 무관하게 잡혀야 한다(게이트가 무력화되지 않았는지 확인).
const tampered = lf.replace('"Sintered Ore": true', '"Sintered Ore": false');

if (tampered === lf) {
    fail('게이트 자가검사: 변조 문자열을 찾지 못했습니다.');
}

if (normalize(tampered) === normalize(crlf)) {
    fail('게이트 자가검사: 내용이 달라졌는데 정규화 비교가 같다고 판정합니다 — 게이트가 무력합니다.');
}

console.log(`CN master verification passed (CN ${cnCount}종 · 품목군 ${goodsCount}종 · 원본 sha256 ${actualSha.slice(0, 12)}… · 재생성 내용 동일, 개행 무관).`);
