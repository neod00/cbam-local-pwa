// EU 공식 Communication Template의 CN 품명(영문)을 src/lib/cn-descriptions.generated.ts 로 생성한다.
//
// 왜 필요한가: 엑셀 서식·화면에 CN을 잘못 적어도(예: 비스테인리스 볼트에 스테인리스 볼트 CN) 지금까지는 8단계의 EU 문서를
// 열어서야 알았다(run35 P1-07). 공식 품명을 되돌려 보여 주면 채운 사람이 그 자리에서 바로잡을 수 있다.
//
// 범위: 철강(Iron or steel products · Crude steel · Pig iron · Alloys · DRI · Sintered Ore)만 담는다 — 앱의 지원 범위이고,
//       번들 크기를 지키기 위해서다(전체 569종 중 철강 계열만).
// 출처: Parameters_CNCodes — D열 = 8자리 CN, E열 = CBAM good 품목군, H열 = 영문 품명(SELFTEXT_EN).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadWorkbook, readSheet } from './lib-template-sheets.mjs';

const TEMPLATE_PATH = 'public/templates/CBAM_Communication_template_for_installations_en_20241213.xlsx';
const OUTPUT_PATH = 'src/lib/cn-descriptions.generated.ts';
const STEEL_GOODS = new Set(['Iron or steel products', 'Crude steel', 'Pig iron', 'Alloys (FeMn, FeCr, FeNi)', 'Direct reduced iron', 'Sintered Ore']);

const workbook = loadWorkbook(TEMPLATE_PATH);
const sha256 = createHash('sha256').update(readFileSync(TEMPLATE_PATH)).digest('hex');
const sheet = readSheet(workbook, 'Parameters_CNCodes');

const entries = [];
for (let row = 4; row <= 572; row += 1) {
    const cn = sheet.get(`D${row}`);
    const good = sheet.get(`E${row}`);
    if (cn === undefined || good === undefined || !STEEL_GOODS.has(good.trim())) continue;
    const text = (sheet.get(`H${row}`) ?? sheet.get(`C${row}`) ?? '').replace(/\s+/g, ' ').trim();
    if (!text) throw new Error(`Parameters_CNCodes ${row}행(${cn}): 품명이 비었습니다.`);
    entries.push({ cn: String(cn).replace(/\D/g, ''), text });
}

const duplicates = entries.filter((item, index) => entries.findIndex((other) => other.cn === item.cn) !== index);
if (duplicates.length > 0) throw new Error(`중복 CN: ${duplicates.map((item) => item.cn).join(', ')}`);

const body = entries.map((item) => `    ${JSON.stringify(item.cn)}: ${JSON.stringify(item.text)},`).join('\n');
writeFileSync(OUTPUT_PATH, `// 생성 파일 — 직접 수정하지 마세요. \`npm run generate:cn-descriptions\`로 재생성합니다.
// 출처: ${TEMPLATE_PATH} (Parameters_CNCodes!D·H열, 철강 계열 품목군만)
// 원본 sha256: ${sha256}

/** 8자리 CN → EU 공식 영문 품명(철강 계열만). 목록에 없다고 CBAM 비대상이라는 뜻은 아니다 — 다른 품목군은 담지 않았다. */
export const CN_DESCRIPTIONS: Readonly<Record<string, string>> = {
${body}
};
`);
console.log(`CN 품명 생성 완료: ${OUTPUT_PATH} (${entries.length}종, 원본 sha256 ${sha256.slice(0, 16)}…)`);
