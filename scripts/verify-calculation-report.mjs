// 산정보고서 기반 유틸 검증 (P1): docx-builder(OOXML) + report-format(반올림·표시값 정합).
// 설계: docs/calculation-report-design.md §5·§6
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const fflate = require('fflate');

function loadModule(path, exportsList, extraPrelude = '') {
  const source = readFileSync(path, 'utf8')
    .replace("import { strToU8, zipSync } from 'fflate';", 'const { strToU8, zipSync } = fflate;')
    .replace(/^import type .*;\r?\n/gm, '')
    .replace(/^export /gm, '');
  const compiled = ts.transpileModule(
    `${extraPrelude}${source}\nglobalThis.__mod = { ${exportsList.join(', ')} };`,
    { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  const context = { fflate, console, Intl, Math, Number, String, Array, Object };
  vm.runInNewContext(compiled, context);
  return context.__mod;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}
function assertTrue(value, label) {
  if (!value) {
    throw new Error(`${label}: expected true`);
  }
}

// ---------------- report-format ----------------
const fmt = loadModule('src/lib/report-format.ts', [
  'roundForReport', 'formatForReport', 'formatIntegerForReport', 'formatPercentForReport', 'checkDisplaySum',
]);

// 음수 사사오입 — Math.round는 -0.795 → -0.79로 절댓값이 줄어든다. 절댓값 기준이어야 한다.
assertEqual(fmt.roundForReport(-0.795, 2), -0.8, 'roundForReport 음수 half-away-from-zero');
assertEqual(fmt.roundForReport(0.795, 2), 0.8, 'roundForReport 양수 half-up');
// 부동소수점 이진오차 — 1.025×1.95 = 1.9987499999999998. 순진하게 자르면 1.9987(샘플 v0.1 결함).
assertEqual(fmt.roundForReport(1.025 * 1.95, 4), 1.9988, 'roundForReport 이진오차 제거 (1.9988)');
assertEqual(fmt.roundForReport(240.009264 / 8000, 4), 0.03, 'roundForReport 자체 직접 SEE');
assertEqual(fmt.roundForReport(0.39904375, 4), 0.399, 'roundForReport 간접 소계');
assertEqual(fmt.formatForReport(1.025 * 1.95, 4), '1.9988', 'formatForReport 4자리');
assertEqual(fmt.formatForReport(0.55 * 0.545, 5), '0.29975', 'formatForReport 원천 자릿수 5자리');
assertEqual(fmt.formatForReport(undefined), '-', 'formatForReport undefined');
assertEqual(fmt.formatIntegerForReport(8000), '8,000', 'formatIntegerForReport');
assertEqual(fmt.formatPercentForReport(-0.163205), '-16.32%', 'formatPercentForReport 음수');
assertEqual(fmt.formatPercentForReport(0.1922), '+19.22%', 'formatPercentForReport 양수 부호');

// 게이트 G1 — 구성 표시값 합 = 소계 표시값
const okSum = fmt.checkDisplaySum({
  label: 'SEE 직접 소계',
  parts: [240.009264 / 8000, 1.025 * 1.95],
  total: 240.009264 / 8000 + 1.025 * 1.95,
});
assertTrue(okSum.isValid, 'checkDisplaySum 정합 케이스');
assertEqual(okSum.displayedPartsSum, 2.0288, 'checkDisplaySum 구성합');
assertEqual(okSum.displayedTotal, 2.0288, 'checkDisplaySum 소계');
// 불일치 케이스는 반드시 잡아내야 한다(게이트가 무력하면 안 됨)
const badSum = fmt.checkDisplaySum({ label: '인위적 불일치', parts: [0.03, 1.0], total: 1.5 });
assertEqual(String(badSum.isValid), 'false', 'checkDisplaySum 불일치 검출');

// ---------------- docx-builder ----------------
const docx = loadModule('src/lib/docx-builder.ts', ['paragraph', 'cell', 'table', 'createDocx', 'xmlEscape']);

// 기존 호출부 호환 — 옵션 없이 부르면 종전 산출물과 동일해야 한다(delivery-package 회귀 방지)
assertEqual(
  docx.cell('x'),
  '<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr><w:p><w:r><w:t xml:space="preserve">x</w:t></w:r></w:p></w:tc>',
  'cell() 기본 출력 하위호환'
);
assertEqual(
  docx.paragraph('x'),
  '<w:p><w:r><w:t xml:space="preserve">x</w:t></w:r></w:p>',
  'paragraph() 기본 출력 하위호환'
);
assertTrue(!docx.table(['h'], [['v']]).includes('w:shd'), 'table() 기본은 음영 없음 (하위호환)');
assertTrue(!docx.table(['h'], [['v']]).includes('tblHeader'), 'table() 기본은 헤더반복 없음 (하위호환)');
assertTrue(docx.table(['h'], [['v']]).includes('<w:tblW w:w="0" w:type="auto"/>'), 'table() 기본 auto 폭');

// 신규 — 표 음영은 반드시 clear (solid는 Word에서 검게 렌더된다)
const shaded = docx.table(['h'], [['v']], { headerShade: 'F5F5F7', headerBold: true, repeatHeader: true });
assertTrue(shaded.includes('<w:shd w:val="clear" w:color="auto" w:fill="F5F5F7"/>'), 'table() 헤더 음영 clear');
assertTrue(!shaded.includes('w:val="solid"'), 'table() solid 음영 미사용');
assertTrue(shaded.includes('<w:tblHeader/>'), 'table() 헤더행 반복');
assertTrue(shaded.includes('<w:b/>'), 'table() 헤더 굵게');

// 신규 — 가변 셀 너비 + tblGrid, 폭 합계가 tblW와 일치
const sized = docx.table(['a', 'b'], [['1', '2']], { widths: [2700, 6300] });
assertTrue(sized.includes('<w:tblGrid><w:gridCol w:w="2700"/><w:gridCol w:w="6300"/></w:tblGrid>'), 'table() tblGrid');
assertTrue(sized.includes('<w:tblW w:w="9000" w:type="dxa"/>'), 'table() 폭 합계 = tblW');
assertTrue(sized.includes('<w:tcW w:w="2700" w:type="dxa"/>'), 'table() 셀 개별 폭');

// 신규 — 글자색/크기
assertTrue(docx.paragraph('x', undefined, { color: '1D1D1F', size: 21, bold: true })
  .includes('<w:rPr><w:b/><w:color w:val="1D1D1F"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr>'), 'paragraph() rPr');

// XML 이스케이프 — 보고서 문안에 &, < 가 들어가도 깨지면 안 된다
assertTrue(docx.paragraph('a & b < c').includes('a &amp; b &lt; c'), 'paragraph() XML 이스케이프');

// 신규 — 머리글/바닥글 + 페이지번호가 실제 패키지에 들어가는지
const bytes = docx.createDocx('T', docx.paragraph('body'), new Date('2026-01-01T00:00:00.000Z'), {
  header: { text: '검토용 샘플', align: 'right', color: '6E6E73', size: 14 },
  footer: { text: 'CBAM-RPT-2026-001', pageNumber: true, align: 'center', size: 14 },
});
const zip = fflate.unzipSync(bytes);
const read = (p) => fflate.strFromU8(zip[p]);

assertTrue(Boolean(zip['word/header1.xml']), 'header1.xml 존재');
assertTrue(Boolean(zip['word/footer1.xml']), 'footer1.xml 존재');
assertTrue(read('word/header1.xml').includes('검토용 샘플'), 'header 텍스트');
assertTrue(read('word/footer1.xml').includes('<w:fldSimple w:instr=" PAGE ">'), 'footer PAGE 필드');
assertTrue(read('word/footer1.xml').includes('<w:fldSimple w:instr=" NUMPAGES ">'), 'footer NUMPAGES 필드');
// r:id 참조를 쓰므로 relationships 네임스페이스 선언이 없으면 Word가 파일을 못 연다
assertTrue(read('word/document.xml').includes('xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'), 'document.xml xmlns:r 선언');
assertTrue(read('word/document.xml').includes('<w:headerReference w:type="default" r:id="rId2"/>'), 'sectPr headerReference');
assertTrue(read('word/document.xml').includes('<w:footerReference w:type="default" r:id="rId3"/>'), 'sectPr footerReference');
assertTrue(read('word/_rels/document.xml.rels').includes('Target="header1.xml"'), 'rels header');
assertTrue(read('word/_rels/document.xml.rels').includes('Target="footer1.xml"'), 'rels footer');
assertTrue(read('[Content_Types].xml').includes('/word/header1.xml'), 'content-types header override');
assertTrue(read('[Content_Types].xml').includes('/word/footer1.xml'), 'content-types footer override');

// 머리글/바닥글이 없으면 관련 파트·참조가 전부 없어야 한다(기존 산출물 회귀 방지)
const plain = fflate.unzipSync(docx.createDocx('T', docx.paragraph('b'), new Date('2026-01-01T00:00:00.000Z')));
assertTrue(!plain['word/header1.xml'], '옵션 없으면 header1.xml 없음');
assertTrue(!plain['word/footer1.xml'], '옵션 없으면 footer1.xml 없음');
assertTrue(!fflate.strFromU8(plain['word/document.xml']).includes('headerReference'), '옵션 없으면 headerReference 없음');
assertTrue(!fflate.strFromU8(plain['[Content_Types].xml']).includes('header1.xml'), '옵션 없으면 header override 없음');

console.log('Calculation report utils verification passed (docx-builder + report-format).');
