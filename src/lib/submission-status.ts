import type { AttributionStatusResult } from './attribution-status';
import type { EuExportReadinessResult } from './eu-template-export';
import type { Installation, PurchasedPrecursor, ReportingPeriod } from './local-db';
import type { TodoItem } from './todo-items';

/**
 * 제출 화면(UX 목업 6번)의 점검표와 판정 — **읽고 모으기만 한다**.
 * 새로 판단하는 규칙도, 산술도 없다:
 *  · 막는 것은 EU 문서 준비도 검사(`evaluateEuExportReadiness`)의 오류뿐이다 — 이 화면이 새로 막지 않는다.
 *  · 점검표의 각 줄은 할 일 화면(`buildTodoItems`)·귀속 점검표(`buildAttributionStatus`)·입력된 자료에서 가져온다.
 * 어조(목업): 막는 것이 없으면 「보낼 수 있습니다. 다만 …은 파일에 「기본값」 또는 「잠정」으로 적힙니다」.
 */

export type SubmissionRowStatus = 'ok' | 'notice' | 'blocked';

export interface SubmissionRow {
    id: string;
    title: string;
    detail: string;
    status: SubmissionRowStatus;
    /** 고치러 갈 곳과 이름 */
    href?: string;
    hrefLabel?: string;
}

export interface SubmissionBlocker {
    message: string;
    href?: string;
}

export interface SubmissionVerdict {
    kind: 'blocked' | 'notice' | 'ready' | 'empty';
    headline: string;
    detail: string;
    /** 주의로 남은 줄 수 */
    noticeCount: number;
    /** 파일을 막는 오류(준비도 검사) — 무엇이 막는지 화면이 그대로 말한다. 최대 5건 */
    blockers: SubmissionBlocker[];
}

export interface SubmissionSummary {
    rows: SubmissionRow[];
    verdict: SubmissionVerdict;
}

const fmt = (value: number, digits = 1) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0);

export function buildSubmissionSummary(input: {
    installation?: Pick<Installation, 'name'>;
    /** 문서에 나갈 보고기간(하나면 그것, 여럿이면 고른 것). 정해지지 않았으면 undefined */
    exportPeriod?: Pick<ReportingPeriod, 'name'>;
    periodCount: number;
    /** 신고 대상 결과(제품 라인) */
    products: Array<{ name: string; cnCode?: string; outputMassT: number }>;
    /** 이 기간 구매 강재 */
    precursors: Array<Pick<PurchasedPrecursor, 'data_mode' | 'verification_status'>>;
    fuelOrElectricityEntered: boolean;
    readiness: Pick<EuExportReadinessResult, 'errorCount' | 'warningCount'>;
    /** 막는 오류의 문장과 고칠 곳(준비도 검사의 오류, 호출부가 링크까지 붙여 넘긴다) */
    blockingIssues?: SubmissionBlocker[];
    todoItems: TodoItem[];
    attribution: AttributionStatusResult;
}): SubmissionSummary {
    const rows: SubmissionRow[] = [];
    const hasData = input.products.length > 0;

    // 제품과 CN
    rows.push(hasData
        ? { id: 'products', title: '제품과 CN 코드', status: 'ok', detail: input.products.map((product) => `${product.name} · CN ${product.cnCode ?? '—'}`).join(' / ') }
        : { id: 'products', title: '제품과 CN 코드', status: 'blocked', detail: '신고 대상 제품의 산정 결과가 아직 없습니다.', href: '/talk', hrefLabel: '질문으로 입력' });

    // 보고기간
    const periodMissing = input.periodCount === 0 || (input.periodCount > 1 && !input.exportPeriod);
    rows.push(periodMissing
        ? { id: 'period', title: '보고기간', status: 'blocked', detail: input.periodCount === 0 ? '보고기간이 없습니다.' : `보고기간이 ${input.periodCount}개인데 문서에 넣을 기간을 고르지 않았습니다.`, href: '/', hrefLabel: '지도 1단계에서 고르기' }
        : { id: 'period', title: '보고기간', status: 'ok', detail: `${input.exportPeriod?.name ?? ''} — 이 기간이 파일에 들어갑니다` });

    // 생산량
    const totalOutput = input.products.reduce((sum, product) => sum + product.outputMassT, 0);
    rows.push(totalOutput > 0
        ? { id: 'output', title: '생산량', status: 'ok', detail: `${fmt(totalOutput)} t` }
        : { id: 'output', title: '생산량', status: hasData ? 'blocked' : 'notice', detail: '생산량이 아직 없습니다.', href: '/talk', hrefLabel: '질문으로 입력' });

    // 연료·전력
    const energyQuestions = input.todoItems.filter((item) => /^q:[^:]+:(fuel|electricity|heat)$/.test(item.id));
    rows.push(input.fuelOrElectricityEntered && energyQuestions.length === 0
        ? { id: 'energy', title: '연료 · 전력', status: 'ok', detail: '연료·전력·밖에서 산 열 질문에 모두 답했습니다.' }
        : { id: 'energy', title: '연료 · 전력', status: 'notice', detail: input.fuelOrElectricityEntered ? `답하지 않은 질문이 ${energyQuestions.length}개 있습니다.` : '연료·전력이 아직 입력되지 않았습니다.', href: '/todo', hrefLabel: '할 일에서 보기' });

    // 구매 강재
    const defaultCount = input.precursors.filter((precursor) => precursor.data_mode !== 'ACTUAL').length;
    const provisionalCount = input.precursors.filter((precursor) => precursor.data_mode !== 'DEFAULT' && precursor.verification_status !== 'VERIFIED').length;
    const precursorQuestions = input.todoItems.filter((item) => /^q:[^:]+:precursor$/.test(item.id));
    if (precursorQuestions.length > 0) {
        rows.push({ id: 'precursors', title: '구매 강재', status: 'notice', detail: '구매한 강재가 있는지 아직 답하지 않았습니다.', href: '/talk', hrefLabel: '질문으로 답하기' });
    } else if (defaultCount > 0 || provisionalCount > 0) {
        rows.push({
            id: 'precursors',
            title: '구매 강재',
            status: 'notice',
            detail: [defaultCount > 0 ? `EU 기본값 ${defaultCount}건(또는 일부만 실측)` : '', provisionalCount > 0 ? `실측이지만 제3자 검증 전(잠정) ${provisionalCount}건` : ''].filter(Boolean).join(' · '),
            href: '/todo',
            hrefLabel: '공급사 요청·확인은 할 일에서',
        });
    } else {
        rows.push({ id: 'precursors', title: '구매 강재', status: 'ok', detail: input.precursors.length > 0 ? `${input.precursors.length}건 모두 제3자 검증된 실측입니다.` : '구매한 강재가 없다고 확인했습니다.' });
    }

    // 사업장 정보
    const installationItems = input.todoItems.filter((item) => item.area === '사업장');
    rows.push(installationItems.length > 0
        ? { id: 'installation', title: '사업장 정보', status: 'notice', detail: `${installationItems.map((item) => item.title.replace(/^[^:]+:\s*/, '')).join(' · ')}`, href: '/todo', hrefLabel: '할 일에서 채우기' }
        : { id: 'installation', title: '사업장 정보', status: 'ok', detail: input.installation?.name ?? '입력됨' });

    // 귀속·할당
    const { fix, review } = input.attribution.counts;
    rows.push(fix > 0
        ? { id: 'attribution', title: '귀속·할당 점검', status: 'notice', detail: `수정 필요 ${fix}건 · 확인 필요 ${review}건 — 배출이 빠지거나 겹쳤을 수 있습니다.`, href: '/todo', hrefLabel: '귀속·할당 점검 보기' }
        : review > 0
            ? { id: 'attribution', title: '귀속·할당 점검', status: 'notice', detail: `확인 필요 ${review}건(규정상 확인을 권하는 항목)`, href: '/todo', hrefLabel: '귀속·할당 점검 보기' }
            : { id: 'attribution', title: '귀속·할당 점검', status: 'ok', detail: input.attribution.rows.length > 0 ? `${input.attribution.counts.ok}개 점검 모두 통과` : '해당하는 점검이 없습니다.' });

    const blockedByRows = rows.filter((row) => row.status === 'blocked').length;
    const noticeRows = rows.filter((row) => row.status === 'notice');
    let verdict: SubmissionVerdict;
    if (!hasData) {
        verdict = { kind: 'empty', headline: '아직 보낼 자료가 없습니다.', detail: '제품과 생산량, 연료·전력, 구매 강재를 입력하면 여기서 제출 파일을 만들 수 있습니다.', noticeCount: 0, blockers: [] };
    } else if (input.readiness.errorCount > 0 || blockedByRows > 0) {
        verdict = {
            kind: 'blocked',
            headline: '아직 파일을 만들 수 없습니다.',
            detail: `EU 문서를 만들기 전에 해결할 것이 ${Math.max(input.readiness.errorCount, blockedByRows)}건 있습니다. 아래 표와 할 일에서 먼저 해결하세요.`,
            noticeCount: noticeRows.length,
            blockers: (input.blockingIssues ?? []).slice(0, 5),
        };
    } else if (noticeRows.length > 0) {
        verdict = {
            kind: 'notice',
            headline: '보낼 수 있습니다.',
            detail: `다만 아래 ${noticeRows.length}가지는 파일에 「기본값」 또는 「잠정」으로 적히거나 비어 있습니다. 수입업자가 물어볼 수 있으니 할 일에서 먼저 정리하면 좋습니다.`,
            noticeCount: noticeRows.length,
            blockers: [],
        };
    } else {
        verdict = { kind: 'ready', headline: '보낼 수 있습니다.', detail: '막는 항목도, 남은 확인도 없습니다. 엑셀에서 한 번 열어 공식 수식이 다시 계산됐는지만 확인하세요.', noticeCount: 0, blockers: [] };
    }
    return { rows, verdict };
}
