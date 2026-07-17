// EU 공식 Communication Template에서 CN 마스터와 확정기간 간접배출 관련성 플래그를 추출해
// src/lib/cn-master.generated.ts 로 생성한다.
//
// 왜 생성해서 커밋하는가:
// - 판정이 동기 함수여야 한다(엔진이 결과 계산에 쓴다). 런타임 xlsx 파싱은 비동기다.
// - 로컬 우선 PWA라 번들 크기가 제약이다. 569행 = raw ~20KB / gzip ~2.3KB로 감당된다.
// - 플래그가 바뀌면 SEE가 바뀐다. 그 결정 자리는 런타임이 아니라 PR 리뷰다.
//
// 출처 (전부 숨김시트):
// - Parameters_CNCodes  : D열=8자리 CN, E열="CBAM good" 품목군. 4~572행.
// - Parameters_Constants: A89:A106=품목군 18종, C열="Indir.em relevant? (definitive)" 1/0.
//                         0 = 확정기간 간접배출 비관련(= 직접배출만).
//
// ⚠️ C열을 읽는 이유: 워크북이 실제로 참조하는 CONST_LIST_GoodsIndRel은 D열인데,
//    D89 = IF(MATCH(CNTR_CBAMPeriod,...)=1, TRUE, C89) 인 **기간 스위치**다.
//    배포본은 B1='Transitional' 상태로 저장돼 D열 캐시가 전부 1이다. 게다가 B1 자체가
//    수식 셀(=Translations!$B$2091)이라 "B1을 Definitive로 바꿔 재계산"은 빌드타임에 부적합하다.
//    따라서 확정기간 값을 얻으려면 C열을 직접 읽어야 한다.
//
// ⚠️ 이 워크북은 "Annex II"를 인용하지 않는다(문자열 0건). 따라서 이 플래그를 Annex II 등재와
//    동일시하면 안 된다. 그 법적 동치는 EUR-Lex 원문 대조가 필요하며 미완이다.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { strFromU8, unzipSync } = require('fflate');

const TEMPLATE_PATH = 'public/templates/CBAM_Communication_template_for_installations_en_20241213.xlsx';
const OUTPUT_PATH = 'src/lib/cn-master.generated.ts';
const TEMPLATE_VERSION = '20241213';

function attr(tag, name) {
    return tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];
}

function loadWorkbook(path) {
    const zip = unzipSync(new Uint8Array(readFileSync(path)));
    const workbook = strFromU8(zip['xl/workbook.xml']);
    const rels = strFromU8(zip['xl/_rels/workbook.xml.rels']);

    const relTargets = new Map();
    for (const tag of rels.match(/<Relationship\b[^>]*\/?>/g) ?? []) {
        relTargets.set(attr(tag, 'Id'), attr(tag, 'Target').replace(/^\//, '').replace(/^xl\//, ''));
    }

    const sheets = new Map();
    for (const tag of workbook.match(/<sheet\b[^>]*\/?>/g) ?? []) {
        const rid = attr(tag, 'r:id');
        sheets.set(attr(tag, 'name'), `xl/${relTargets.get(rid)}`);
    }

    const shared = [];
    if (zip['xl/sharedStrings.xml']) {
        const xml = strFromU8(zip['xl/sharedStrings.xml']);
        for (const si of xml.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
            shared.push((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [])
                .map((t) => t.replace(/<[^>]+>/g, ''))
                .join('')
                .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
        }
    }

    return { zip, sheets, shared };
}

/** 시트를 셀 참조 → 값 맵으로. 수식 결과 캐시(<v>)를 읽는다. */
function readSheet({ zip, sheets, shared }, name) {
    const path = sheets.get(name);

    if (!path || !zip[path]) {
        throw new Error(`시트를 찾지 못했습니다: ${name}`);
    }

    const xml = strFromU8(zip[path]);
    const cells = new Map();

    // [^>]*는 탐욕적이라 자기닫힘 셀의 '/'까지 먹고 다음 셀들을 통째로 삼킨다. 반드시 lazy.
    for (const cell of xml.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
        const ref = attr(cell, 'r');
        const type = attr(cell, 't');

        if (!ref) {
            continue;
        }

        if (type === 'inlineStr') {
            cells.set(ref, (cell.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, '')).join(''));
            continue;
        }

        const raw = cell.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1];

        if (raw === undefined) {
            continue;
        }

        const decoded = raw.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        cells.set(ref, type === 's' ? shared[Number(decoded)] : decoded);
    }

    return cells;
}

function columnOf(cells, header, headerRow) {
    for (const [ref, value] of cells) {
        const match = ref.match(/^([A-Z]+)(\d+)$/);

        if (match && Number(match[2]) === headerRow && String(value).trim() === header) {
            return match[1];
        }
    }

    return undefined;
}

const workbook = loadWorkbook(TEMPLATE_PATH);
const sha256 = createHash('sha256').update(readFileSync(TEMPLATE_PATH)).digest('hex');

// ---------------- 품목군 → 확정기간 간접배출 관련성 ----------------
const constants = readSheet(workbook, 'Parameters_Constants');
// 헤더는 88행. 열 위치를 하드코딩하지 않고 헤더 문자열로 찾는다 — 판본이 바뀌면 열이 밀 수 있다.
const relevanceColumn = columnOf(constants, 'Indir.em relevant? (definitive)', 88);

if (!relevanceColumn) {
    throw new Error('Parameters_Constants 88행에서 「Indir.em relevant? (definitive)」 열을 찾지 못했습니다. 템플릿 판본을 확인하세요.');
}

const goodsRelevance = [];
for (let row = 89; row <= 106; row += 1) {
    const good = constants.get(`A${row}`);
    const flag = constants.get(`${relevanceColumn}${row}`);

    if (good === undefined || flag === undefined) {
        throw new Error(`Parameters_Constants ${row}행이 비어 있습니다(품목군=${good}, 플래그=${flag}). 블록 A89:C106을 확인하세요.`);
    }

    if (flag !== '0' && flag !== '1') {
        throw new Error(`Parameters_Constants ${relevanceColumn}${row}의 값이 0/1이 아닙니다: ${flag}`);
    }

    goodsRelevance.push({ good, indirectRelevant: flag === '1', row });
}

// ---------------- CN → 품목군 ----------------
const cnSheet = readSheet(workbook, 'Parameters_CNCodes');
const cnColumn = 'D';
const goodColumn = 'E';
const cnMaster = [];
const knownGoods = new Set(goodsRelevance.map((item) => item.good));

for (let row = 4; row <= 572; row += 1) {
    const cn = cnSheet.get(`${cnColumn}${row}`);
    const good = cnSheet.get(`${goodColumn}${row}`);

    if (cn === undefined && good === undefined) {
        continue;
    }

    if (cn === undefined || good === undefined) {
        throw new Error(`Parameters_CNCodes ${row}행: CN=${cn}, good=${good} — 한쪽이 비었습니다.`);
    }

    if (!knownGoods.has(good)) {
        throw new Error(`Parameters_CNCodes ${row}행의 품목군 「${good}」이 Parameters_Constants A89:A106에 없습니다. 조인 실패는 조용히 넘기지 않습니다.`);
    }

    cnMaster.push({ cn: String(cn).replace(/\D/g, ''), good });
}

const duplicates = cnMaster.filter((item, index) => cnMaster.findIndex((other) => other.cn === item.cn) !== index);

if (duplicates.length > 0) {
    throw new Error(`Parameters_CNCodes에 중복 CN이 있습니다: ${duplicates.map((d) => d.cn).join(', ')}`);
}

// ---------------- 생성 ----------------
const goodsEntries = goodsRelevance
    .map((item) => `    ${JSON.stringify(item.good)}: ${item.indirectRelevant},`)
    .join('\n');
const cnEntries = cnMaster
    .map((item) => `    ${JSON.stringify(item.cn)}: ${JSON.stringify(item.good)},`)
    .join('\n');

const output = `// 생성 파일 — 직접 수정하지 마세요. \`npm run generate:cn-master\`로 재생성합니다.
// 출처: ${TEMPLATE_PATH}
//   Parameters_CNCodes!D4:E572       — CN 8자리 → CBAM good 품목군
//   Parameters_Constants!A89:${relevanceColumn}106 — 품목군 → "Indir.em relevant? (definitive)"
//
// ⚠️ 이 플래그는 「Annex II 등재」가 아니다. 원본 워크북은 "Annex II"를 인용하지 않는다(문자열 0건).
//    확인된 사실은 「EU 공식 워크북이 확정기간 간접배출 관련성을 0/1로 분류했다」뿐이며,
//    그것이 Regulation (EU) 2023/956 Annex II와 법적으로 동치인지는 EUR-Lex 원문 대조 미완이다.
//    보고서 문안은 이 구분을 반드시 지켜야 한다.

/** 원본 템플릿 판본. 보고서가 인용한다. */
export const CN_MASTER_TEMPLATE_VERSION = '${TEMPLATE_VERSION}';

/** 원본 파일 해시. 템플릿이 교체됐는데 재생성하지 않으면 드리프트 게이트가 잡는다. */
export const CN_MASTER_SOURCE_SHA256 = '${sha256}';

/**
 * 이 플래그가 Regulation (EU) 2023/956 Annex II 등재와 법적으로 동치임을 확인했는가.
 * 리터럴 false — true로 바꾸려면 타입이 바뀌므로 리뷰가 강제된다.
 */
export const CN_MASTER_LEGAL_BASIS_VERIFIED: false = false;

/** 품목군 → 확정기간 간접배출 관련성. true = 간접 포함, false = 직접배출만. */
export const GOODS_INDIRECT_RELEVANCE: Readonly<Record<string, boolean>> = {
${goodsEntries}
};

/** 8자리 CN → CBAM good 품목군. 포함 목록이므로 부재가 곧 명시적 배제는 아니다. */
export const CN_MASTER: Readonly<Record<string, string>> = {
${cnEntries}
};
`;

writeFileSync(OUTPUT_PATH, output);

const directOnly = goodsRelevance.filter((item) => !item.indirectRelevant);
console.log(`CN 마스터 생성 완료: ${OUTPUT_PATH}`);
console.log(`  CN ${cnMaster.length}종 · 품목군 ${goodsRelevance.length}종`);
console.log(`  직접배출만(C=0) ${directOnly.length}종: ${directOnly.map((item) => item.good.trim()).join(', ')}`);
console.log(`  원본 sha256: ${sha256.slice(0, 16)}…`);
