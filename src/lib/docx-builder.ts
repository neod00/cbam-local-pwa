import { strToU8, zipSync } from 'fflate';

// 앱의 Word(.docx) 생성 공용 빌더.
// .docx는 OOXML(XML) 묶음을 zip한 것이라 문자열로 직접 만든다. 외부 라이브러리를 쓰지 않는 이유:
// 이 앱은 로컬 우선·오프라인 PWA라 라이브러리가 사용자 기기로 내려가고 서비스워커 캐시 대상이 된다
// (docx npm 4.5MB vs 현 최대 의존성 fflate 837KB). 설계: docs/calculation-report-design.md §2.1.
//
// delivery-package.ts에서 추출·확장했다. 기존 호출부 호환을 위해 시그니처는 그대로 두고
// 선택 옵션만 추가했다(표 음영·가변 셀너비·머리글/바닥글·페이지번호·글자색).

/**
 * Legend — 표기의 뜻을 설명하는 범례. 겉모습은 Note와 같지만 스타일을 따로 두어,
 * 문서를 훑는 쪽(산정보고서 14.1 등록부)이 **문자열이 아니라 구조로** 범례를 골라낼 수 있게 한다.
 * 문자열로 알아보면 본문 문안에 같은 문구가 섞이는 순간 조용히 오작동한다(씨밤이 P2).
 */
export type DocxParagraphStyle = 'Title' | 'Heading1' | 'Heading2' | 'Note' | 'Legend';
export type DocxAlign = 'left' | 'center' | 'right';

export interface DocxRunOptions {
    bold?: boolean;
    /** RGB hex, '#' 없이 (예: '1D1D1F') */
    color?: string;
    /** half-point 단위 (예: 20 = 10pt) — OOXML w:sz 규격 */
    size?: number;
}

export interface DocxParagraphOptions extends DocxRunOptions {
    align?: DocxAlign;
}

export interface DocxCellOptions extends DocxRunOptions {
    /** DXA(1440 = 1인치). 미지정 시 2400 — 기존 호출부 기본값 유지 */
    width?: number;
    /** 배경 RGB hex. w:val은 항상 'clear' — 'solid'는 Word에서 검게 렌더된다 */
    shade?: string;
}

export interface DocxTableOptions {
    /** 열 너비(DXA). 지정 시 tblGrid + 고정 폭으로 렌더 */
    widths?: number[];
    /** 헤더행 배경 RGB hex */
    headerShade?: string;
    /** 헤더행 굵게. 기본 false — 기존 호출부(delivery-package) 산출물을 그대로 유지하기 위함 */
    headerBold?: boolean;
    /** 페이지 넘김 시 헤더행 반복. 기본 false — 위와 같은 이유 */
    repeatHeader?: boolean;
}

export interface DocxHeaderFooterOptions {
    text?: string;
    align?: DocxAlign;
    /** 'n / m' 형태의 페이지번호 삽입 */
    pageNumber?: boolean;
    color?: string;
    size?: number;
}

export interface CreateDocxOptions {
    header?: DocxHeaderFooterOptions;
    footer?: DocxHeaderFooterOptions;
}

export function xmlEscape(value: string | number | undefined) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

function runPropsXml(options?: DocxRunOptions) {
    if (!options) {
        return '';
    }

    const parts = [
        options.bold ? '<w:b/>' : '',
        options.color ? `<w:color w:val="${xmlEscape(options.color)}"/>` : '',
        options.size ? `<w:sz w:val="${options.size}"/><w:szCs w:val="${options.size}"/>` : '',
    ].join('');

    return parts ? `<w:rPr>${parts}</w:rPr>` : '';
}

function alignXml(align?: DocxAlign) {
    return align && align !== 'left' ? `<w:jc w:val="${align}"/>` : '';
}

/**
 * 문단. 텍스트의 개행(\n)은 <w:br/>로 변환한다(OOXML에는 개행 문자가 없다).
 */
export function paragraph(text: string, style?: DocxParagraphStyle, options?: DocxParagraphOptions) {
    const styleXml = style ? `<w:pStyle w:val="${style}"/>` : '';
    const jc = alignXml(options?.align);
    const pPr = styleXml || jc ? `<w:pPr>${styleXml}${jc}</w:pPr>` : '';
    const rPr = runPropsXml(options);
    const runs = text.split('\n').map((line, index) => {
        const breakXml = index === 0 ? '' : '<w:br/>';
        return `<w:r>${rPr}${breakXml}<w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r>`;
    }).join('');

    return `<w:p>${pPr}${runs}</w:p>`;
}

export function cell(text: string | number | undefined, options?: DocxCellOptions) {
    const width = options?.width ?? 2400;
    const shading = options?.shade
        ? `<w:shd w:val="clear" w:color="auto" w:fill="${xmlEscape(options.shade)}"/>`
        : '';
    const paragraphs = String(text ?? '-')
        .split('\n')
        .map((line) => paragraph(line, undefined, options))
        .join('');

    return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${shading}</w:tcPr>${paragraphs}</w:tc>`;
}

export function table(
    headers: string[],
    rows: Array<Array<string | number | undefined>>,
    options?: DocxTableOptions
) {
    const border = '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:color="CBD5E1"/><w:insideV w:val="single" w:sz="4" w:color="CBD5E1"/></w:tblBorders>';
    const widths = options?.widths;

    const cellOptionsAt = (index: number): DocxCellOptions => ({
        width: widths ? widths[index] : undefined,
    });

    const headerProps = options?.repeatHeader ? '<w:trPr><w:tblHeader/></w:trPr>' : '';
    const headerRow = `${headerProps}${headers
        .map((header, index) => cell(header, { ...cellOptionsAt(index), bold: options?.headerBold, shade: options?.headerShade }))
        .join('')}`;
    const bodyRows = rows
        .map((row) => `<w:tr>${row.map((value, index) => cell(value, cellOptionsAt(index))).join('')}</w:tr>`)
        .join('');

    // 폭을 지정하면 tblGrid로 고정, 아니면 기존과 동일하게 auto
    const totalWidth = widths ? widths.reduce((sum, value) => sum + value, 0) : 0;
    const tableWidth = widths
        ? `<w:tblW w:w="${totalWidth}" w:type="dxa"/>`
        : '<w:tblW w:w="0" w:type="auto"/>';
    const grid = widths
        ? `<w:tblGrid>${widths.map((value) => `<w:gridCol w:w="${value}"/>`).join('')}</w:tblGrid>`
        : '';

    return `<w:tbl><w:tblPr>${tableWidth}${border}</w:tblPr>${grid}<w:tr>${headerRow}</w:tr>${bodyRows}</w:tbl>`;
}

function headerFooterBodyXml(options: DocxHeaderFooterOptions) {
    const rPr = runPropsXml(options);
    const runs: string[] = [];

    if (options.text) {
        runs.push(`<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(options.text)}</w:t></w:r>`);
    }

    if (options.pageNumber) {
        if (options.text) {
            runs.push(`<w:r>${rPr}<w:t xml:space="preserve"> · </w:t></w:r>`);
        }
        // PAGE / NUMPAGES 필드 — Word가 열 때 실제 쪽 번호로 채운다
        runs.push(`<w:fldSimple w:instr=" PAGE "><w:r>${rPr}<w:t>1</w:t></w:r></w:fldSimple>`);
        runs.push(`<w:r>${rPr}<w:t xml:space="preserve"> / </w:t></w:r>`);
        runs.push(`<w:fldSimple w:instr=" NUMPAGES "><w:r>${rPr}<w:t>1</w:t></w:r></w:fldSimple>`);
    }

    return `<w:p><w:pPr>${alignXml(options.align)}</w:pPr>${runs.join('')}</w:p>`;
}

function headerXml(options: DocxHeaderFooterOptions) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${headerFooterBodyXml(options)}</w:hdr>`;
}

function footerXml(options: DocxHeaderFooterOptions) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${headerFooterBodyXml(options)}</w:ftr>`;
}

function docxStylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Malgun Gothic"/><w:sz w:val="20"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Malgun Gothic"/><w:sz w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="280" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Note"><w:name w:val="Note"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="475569"/><w:sz w:val="18"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Legend"><w:name w:val="Legend"/><w:basedOn w:val="Note"/><w:rPr><w:color w:val="475569"/><w:sz w:val="18"/></w:rPr></w:style>
</w:styles>`;
}

function docxContentTypesXml(hasHeader: boolean, hasFooter: boolean) {
    const headerOverride = hasHeader
        ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>'
        : '';
    const footerOverride = hasFooter
        ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
        : '';

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  ${headerOverride}
  ${footerOverride}
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function docxRelsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function documentRelsXml(hasHeader: boolean, hasFooter: boolean) {
    const headerRel = hasHeader
        ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>'
        : '';
    const footerRel = hasFooter
        ? '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'
        : '';

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  ${headerRel}
  ${footerRel}
</Relationships>`;
}

function corePropsXml(title: string, generatedAt: Date) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${xmlEscape(title)}</dc:title>
  <dc:creator>CBAM Local</dc:creator>
  <cp:lastModifiedBy>CBAM Local</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${generatedAt.toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${generatedAt.toISOString()}</dcterms:modified>
</cp:coreProperties>`;
}

function appPropsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>CBAM Local</Application>
</Properties>`;
}

export function createDocx(title: string, bodyXml: string, generatedAt: Date, options?: CreateDocxOptions) {
    const hasHeader = Boolean(options?.header);
    const hasFooter = Boolean(options?.footer);
    const headerReference = hasHeader ? '<w:headerReference w:type="default" r:id="rId2"/>' : '';
    const footerReference = hasFooter ? '<w:footerReference w:type="default" r:id="rId3"/>' : '';
    // 머리글/바닥글 참조에 r:id를 쓰므로 relationships 네임스페이스 선언이 필요하다.
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyXml}
    <w:sectPr>${headerReference}${footerReference}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1080" w:bottom="1440" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>
  </w:body>
</w:document>`;
    const files: Record<string, Uint8Array> = {
        '[Content_Types].xml': strToU8(docxContentTypesXml(hasHeader, hasFooter)),
        '_rels/.rels': strToU8(docxRelsXml()),
        'docProps/app.xml': strToU8(appPropsXml()),
        'docProps/core.xml': strToU8(corePropsXml(title, generatedAt)),
        'word/_rels/document.xml.rels': strToU8(documentRelsXml(hasHeader, hasFooter)),
        'word/document.xml': strToU8(documentXml),
        'word/styles.xml': strToU8(docxStylesXml()),
    };

    if (options?.header) {
        files['word/header1.xml'] = strToU8(headerXml(options.header));
    }

    if (options?.footer) {
        files['word/footer1.xml'] = strToU8(footerXml(options.footer));
    }

    return zipSync(files);
}
