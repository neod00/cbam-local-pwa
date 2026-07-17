// CN 마스터 드리프트 게이트.
//
// src/lib/cn-master.generated.ts 는 생성 파일이지만 커밋된다. 즉 사람이 손댈 수 있고,
// 원본 템플릿이 교체됐는데 재생성을 안 할 수도 있다. 그러면 앱이 "공식 워크북을 조회했다"고
// 말하면서 실제로는 누군가 손으로 고친 값을 쓰게 된다 — 접두 휴리스틱보다 나쁘다(권위를 참칭).
//
// 이 게이트는 생성기를 다시 돌려 **바이트 단위로 비교**한다. 다르면 실패.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';

const GENERATED = 'src/lib/cn-master.generated.ts';
const TEMPLATE = 'public/templates/CBAM_Communication_template_for_installations_en_20241213.xlsx';
const BACKUP = 'src/lib/cn-master.generated.ts.verify-backup';

function fail(message) {
    console.error(`CN master verification FAILED: ${message}`);
    process.exit(1);
}

const committed = readFileSync(GENERATED, 'utf8');
writeFileSync(BACKUP, committed);

try {
    execFileSync('node', ['scripts/generate-cn-master.mjs'], { stdio: 'pipe' });
    const regenerated = readFileSync(GENERATED, 'utf8');

    if (regenerated !== committed) {
        writeFileSync(GENERATED, committed);
        fail(
            `${GENERATED}가 원본 템플릿에서 재생성한 결과와 다릅니다.\n` +
            '  생성 파일을 손으로 고쳤거나, 템플릿이 교체됐는데 재생성하지 않았습니다.\n' +
            '  `npm run generate:cn-master`를 실행하고 변경 내용을 리뷰하세요.\n' +
            '  플래그가 바뀌면 SEE가 바뀝니다 — 그 결정 자리는 PR 리뷰입니다.'
        );
    }
} finally {
    try {
        unlinkSync(BACKUP);
    } catch {
        // 백업 삭제 실패는 검증 결과에 영향을 주지 않는다.
    }
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

if (!/CN_MASTER_LEGAL_BASIS_VERIFIED: false = false/.test(committed)) {
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

console.log(`CN master verification passed (CN ${cnCount}종 · 품목군 ${goodsCount}종 · 원본 sha256 ${actualSha.slice(0, 12)}… · 재생성 바이트 동일).`);
