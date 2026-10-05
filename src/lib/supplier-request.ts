import { createDocx, paragraph, table } from './docx-builder';
import type { PurchasedPrecursor } from './local-db';

/**
 * 공급사 요청서 — 전구물질 고리(UX 컨셉 v4 §12)의 「요청」 쪽.
 *
 * 앱은 어떤 구매 원료가 몇 t, 어느 보고기간에 필요한지 이미 안다. 그래서 공급사에 보낼 요청서(한·영 병기 .docx)를 자동으로 만든다.
 * 공급사에게 부탁하는 것은 하나다 — EU가 정한 표준 양식(Communication Template for installations)을 채워 보내 달라는 것.
 * 그 파일의 Summary_Products 시트를 앱이 읽어 같은 CN의 전구물질만 실측으로 바꾼다(supplier-reply.ts).
 *
 * 요청서에는 우리 회사의 생산·배출 자료를 넣지 않는다 — 구매 원료의 제품명·CN·구매량·보고기간만 담는다.
 */

export interface SupplierRequestItem {
    precursorId: string;
    name: string;
    cnCode: string;
    purchasedMassT: number;
    periodLabel: string;
    route: string;
}

export interface SupplierRequestGroup {
    key: string;
    /** 공급사(설비) 이름. 비어 있으면 빈칸으로 둔다. */
    supplierName: string;
    country: string;
    items: SupplierRequestItem[];
}

export interface SupplierRequester {
    companyName: string;
    contactName: string;
    email: string;
}

const MUTE = '64748B';
const fmtNumber = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(Number.isFinite(value) ? value : 0);

/** 구매 전구물질을 공급사(설비 이름 + 국가)별로 묶는다. 이름이 같은 공급사의 여러 원료는 한 장에 담는다. */
export function groupPrecursorsBySupplier(
    precursors: PurchasedPrecursor[],
    periodNameOf: (periodId: string | undefined) => string
): SupplierRequestGroup[] {
    const groups = new Map<string, SupplierRequestGroup>();
    for (const precursor of precursors) {
        const supplierName = precursor.supplier_installation.trim();
        const country = precursor.supplier_country.trim();
        const key = `${supplierName.toLowerCase()}|${country.toLowerCase()}`;
        const group = groups.get(key) ?? { key, supplierName, country, items: [] };
        group.items.push({
            precursorId: precursor.id,
            name: precursor.name,
            cnCode: (precursor.precursor_cn_code ?? '').replace(/\D/g, ''),
            purchasedMassT: precursor.purchased_mass_t,
            periodLabel: periodNameOf(precursor.period_id),
            route: precursor.production_route.trim(),
        });
        groups.set(key, group);
    }
    return Array.from(groups.values());
}

/** 요청서 파일 이름. 공급사 이름이 없으면 국가로 구분한다. */
export function supplierRequestFilename(group: SupplierRequestGroup, generatedAt: Date): string {
    const label = (group.supplierName || group.country || 'supplier').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40);
    return `CBAM_data_request_${label}_${generatedAt.toISOString().slice(0, 10)}.docx`;
}

export function buildSupplierRequestDocx(input: {
    group: SupplierRequestGroup;
    requester: SupplierRequester;
    generatedAt: Date;
}): Uint8Array {
    const { group, requester } = input;
    const body: string[] = [];

    body.push(paragraph('배출량 자료 요청서 / Request for Embedded Emissions Data', 'Title'));
    body.push(paragraph('CBAM (EU Regulation 2023/956) — purchased precursors', 'Note'));

    body.push(paragraph(
        `수신 / To: ${group.supplierName || '__________________'}${group.country ? ` (${group.country})` : ''}\n발신 / From: ${requester.companyName || '__________________'}${requester.contactName ? ` — ${requester.contactName}` : ''}${requester.email ? ` <${requester.email}>` : ''}\n회신 기한 / Reply by: __________________`,
        undefined
    ));

    body.push(paragraph('1. 요청 배경 / Background', 'Heading1'));
    body.push(paragraph(
        '당사는 귀사로부터 아래 원료를 구매하여 EU로 수출하는 제품을 생산합니다. EU 탄소국경조정제도(CBAM)에 따라 당사는 이 원료에 내재된 배출량(SEE, 제품 1톤당 tCO2e)을 신고해야 하며, 귀사의 실제 배출량 자료가 없으면 EU 기본값(보수적으로 높게 정해진 값)을 사용해야 합니다.\n' +
        'We purchase the materials below from you and make products exported to the EU. Under the EU CBAM we must report the specific embedded emissions (SEE, tCO2e per tonne) of these materials. Without your actual data we have to use the EU default values, which are set conservatively high.'
    ));

    body.push(paragraph('2. 대상 원료 / Materials concerned', 'Heading1'));
    body.push(table(
        ['제품 / Product', 'CN code', '구매량 / Purchased (t)', '보고기간 / Period'],
        group.items.map((item) => [item.name + (item.route ? `\n(${item.route})` : ''), item.cnCode || '-', fmtNumber(item.purchasedMassT), item.periodLabel || '-']),
        { widths: [3800, 1800, 2000, 2000], headerBold: true, headerShade: 'F1F5F9', repeatHeader: true }
    ));

    body.push(paragraph('3. 부탁드리는 것 / What we ask', 'Heading1'));
    body.push(paragraph(
        '① EU 집행위원회가 제공하는 표준 양식 「CBAM Communication template for installations」(엑셀)을 귀사 설비 기준으로 채워 회신해 주십시오. 특히 Summary_Products 시트의 CN 코드별 SEE(직접)·SEE(간접)가 필요합니다.\n' +
        '   Please return the EU "CBAM Communication template for installations" (Excel) completed for your installation — in particular the SEE (direct) and SEE (indirect) per CN code in the sheet Summary_Products.\n' +
        '② 보고기간은 위 표의 기간과 같아야 합니다. 다르면 어느 기간의 자료인지 알려 주십시오.\n' +
        '   The reporting period should match the table above; if it does not, please tell us which period your data covers.\n' +
        '③ 제3자 검증보고서가 있으면 함께 보내 주십시오(검증기관·발행일 포함). 없으면 없다고 알려 주십시오.\n' +
        '   If a third-party verification report exists, please attach it (verifier and date). If not, please say so.\n' +
        '④ 일부 값을 EU 기본값으로 채우셨다면 템플릿의 「Share of emissions by default value」 칸에 그 비율을 적어 주십시오.\n' +
        '   If some values are EU defaults, please state their share in the column "Share of emissions by default value".\n' +
        '⑤ 파일을 엑셀에서 열어 저장한 뒤 보내 주십시오(계산값이 비어 있으면 읽을 수 없습니다).\n' +
        '   Please open and save the file in Excel before sending, so calculated values are stored.'
    ));

    body.push(paragraph('4. 자료의 사용 / Use of your data', 'Heading1'));
    body.push(paragraph(
        '회신 자료는 당사의 CBAM 배출량 산정·EU 신고 및 검증에만 사용하며, 검증인 요청이 없는 한 제3자에게 제공하지 않습니다. 귀사의 영업비밀(공정 상세 등)은 요청하지 않으며, 위 표의 제품별 SEE만 필요합니다.\n' +
        'Your reply is used only for our CBAM calculation, EU reporting and verification and is not passed on unless a verifier asks. We do not ask for trade secrets; only the product-level SEE above is needed.'
    ));

    body.push(paragraph(`CBAM Local에서 ${input.generatedAt.toISOString().slice(0, 10)}에 자동 생성 / generated by CBAM Local`, 'Note', { color: MUTE }));

    return createDocx('CBAM 공급사 자료 요청서', body.join(''), input.generatedAt, {
        header: { text: 'CBAM data request / 배출량 자료 요청', align: 'right', color: MUTE, size: 14 },
        footer: { text: 'CBAM Local', pageNumber: true, align: 'center', color: MUTE, size: 14 },
    });
}
