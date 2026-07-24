// UI 문안 게이트 — 화면이 「확인하지 못한 것」을 단정하지 않는지 소스에서 검사한다.
//
// 왜 필요한가:
// 기존 게이트는 산정보고서(.docx XML)만 훑는다. 그래서 같은 거짓 진술이 **화면에 남아 있어도**
// npm run verify가 그린이었다. 실제로 그렇게 빠져나갔다 —
//   · 대시보드가 판정 못 한 제품에 "Annex II direct-only" 인쇄 (씨밤이 P1)
//   · SEE 흐름도가 "철강(CN 72/73) 규칙 기준" = 접두 규칙 진술 (씨밤이 P1, 보고서에선 제거했는데 UI에 재발)
// 보고서만 검사하는 게이트는 UI를 볼 수 없다. 이 스크립트가 그 구멍을 메운다.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src/app', 'src/components', 'src/lib'];
const EXTENSIONS = ['.ts', '.tsx'];

/** 검사에서 뺄 파일 — 생성 파일과 그 사실을 설명하는 문서. */
const EXEMPT = [
    'src/lib/cn-master.generated.ts',
];

function walk(dir) {
    const files = [];

    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry).replace(/\\/g, '/');

        if (statSync(path).isDirectory()) {
            files.push(...walk(path));
        } else if (EXTENSIONS.some((ext) => path.endsWith(ext))) {
            files.push(path);
        }
    }

    return files;
}

/**
 * 금지 문안. 전부 「우리가 확인하지 못한 것」을 단정하는 표현이다.
 * 주석(//, *)에서의 언급은 허용한다 — 왜 금지인지 설명해야 하므로.
 */
const FORBIDDEN = [
    {
        pattern: /Annex II direct-only/,
        why: 'Annex II 등재는 확인하지 못했다. 원본 워크북에 "Annex II" 문자열이 0건이다. '
            + '「EU 공식 CN 목록상 간접배출 비관련」이라고 쓸 것.',
    },
    {
        pattern: /철강\s*\(\s*CN\s*72\s*\/\s*73\s*\)\s*규칙/,
        why: '접두 규칙 진술이다. 판정은 공식 CN 목록 조회로 한다. 보고서에서 제거한 문안이 UI에 재발하면 안 된다.',
    },
    {
        pattern: /접두 규칙 기반|접두 규칙으로 판정|접두 규칙에 따른/,
        why: '앱은 접두 규칙으로 판정하지 않는다. 조회 사실을 쓸 것.',
    },
    {
        // 5단계 저장 안내가 「저장했습니다. 철강은 이 값이 인증서 계산에서 빠지지만…」이라고
        // 말하고 있었다. 위 두 패턴은 "CN 72/73"이나 "Annex II"를 요구해서 이걸 놓쳤다.
        // 품목 이름만으로 배제를 단정하는 문장은 전부 막는다.
        pattern: /철강[^\n]{0,60}(빠지지만|빠집니다|제외됩니다|제외된다|제외돼)/,
        why: '품목군 이름만으로 간접배출 배제를 단정한다. 소결광(CN 2601 12 00)처럼 간접이 '
            + '기준에 포함되는 품목이 있고, 판정 불가도 있다. describeSeeFlowIndirect의 상태에서 '
            + '파생하거나, 판정을 7단계로 넘기고 사실만 쓸 것.',
    },
];

/**
 * 주석 줄인가 — 금지 문안을 「왜 금지인지」 설명하는 것은 허용한다.
 * JSX 주석 `{/* … *␘/}`도 포함한다. 빠뜨리면 「이 문장을 쓰면 안 되는 이유」를 코드 옆에
 * 남길 수 없고, 그러면 다음 사람이 같은 문장을 다시 쓴다.
 */
function isComment(line) {
    const trimmed = line.trim();

    return trimmed.startsWith('//')
        || trimmed.startsWith('*')
        || trimmed.startsWith('/*')
        || trimmed.startsWith('{/*');
}

const failures = [];

for (const root of ROOTS) {
    for (const file of walk(root)) {
        if (EXEMPT.includes(file)) {
            continue;
        }

        const lines = readFileSync(file, 'utf8').split(/\r?\n/);

        lines.forEach((line, index) => {
            if (isComment(line)) {
                return;
            }

            for (const { pattern, why } of FORBIDDEN) {
                if (pattern.test(line)) {
                    failures.push(`${file}:${index + 1}\n    ${line.trim().slice(0, 110)}\n    → ${why}`);
                }
            }
        });
    }
}

if (failures.length > 0) {
    console.error(`UI claims verification FAILED (${failures.length}건):\n\n${failures.join('\n\n')}`);
    process.exit(1);
}

// 3상태가 표시 계층에서 boolean으로 붕괴하지 않는지.
// indirect_emissions_applicable을 타입에서 지웠으므로 컴파일러가 잡지만, 되살리는 것도 막는다.
const sources = ROOTS.flatMap((root) => walk(root));
const revived = sources.filter((file) => {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);

    return lines.some((line) => !isComment(line) && /indirect_emissions_applicable/.test(line));
});

if (revived.length > 0) {
    console.error(
        'UI claims verification FAILED: indirect_emissions_applicable(boolean)이 되살아났습니다 — '
        + `${revived.join(', ')}\n`
        + '  이 boolean은 「판정 불가」를 「제외」로 붕괴시킨다. 여섯 번 연속 일부 소비자만 고치게 만든 원인이다.\n'
        + '  indirect_emissions_relevance(3상태)를 쓰세요.'
    );
    process.exit(1);
}

console.log(`UI claims verification passed (${sources.length}개 파일 · 금지 문안 ${FORBIDDEN.length}종 · boolean 붕괴 없음).`);
