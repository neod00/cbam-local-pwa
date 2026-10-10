/**
 * 철강 제품의 시스템 경계 — 어떤 공정의 배출을 직접배출에 넣고 어떤 공정의 것을 빼는가.
 *
 * Implementing Regulation (EU) 2025/2547 부속서 I 3.16.2 「Iron or steel products — System boundary」:
 *  넣는다: re-heating, re-melting, casting, hot rolling, cold rolling, forging, annealing, coating, galvanizing, wire drawing, pickling
 *  뺀다: plating, cutting, welding and finishing of iron or steel products
 * EU 확정기간 가이던스 No.5d(2026-08) 2.2.3.8과 각주 20이 같은 내용을 설명한다(빼는 공정도 경계를 따질 때는 넣되 그 배출만 뺀다).
 *
 * 앱은 연료가 어느 설비의 것인지 모른다 — 넣지 말라고 **알리기만** 하고, 이름으로 짐작되는 연료는 되묻는다(지우지 않는다).
 * 서식 가져오기(activity-import.ts)와 지도 4단계·질문 화면·연료 나누기가 같은 문장과 같은 판단을 쓴다.
 */

export const STEEL_BOUNDARY_ANCHOR = '2025/2547 부속서 I 3.16.2';

/** 연료를 넣는 자리에 늘 보이는 안내 */
export const STEEL_BOUNDARY_NOTE =
    `도금·절단·태핑·용접·선별·포장 같은 마무리 설비 전용 연료는 넣지 않습니다 — 규정이 철강 제품의 직접배출에서 빼는 공정입니다(${STEEL_BOUNDARY_ANCHOR}). `
    + '단조·열처리·소둔·산세·신선·코팅·용융아연도금의 연료는 넣습니다.';

/** 이름으로 짐작될 때의 되묻기(화면용 — 짧게) */
export const STEEL_BOUNDARY_NAME_WARNING =
    '이름으로 보아 도금·절단·용접·마무리 설비의 연료일 수 있습니다. 그 설비 전용 연료라면 넣지 마세요 — 넣으면 배출량이 실제보다 크게 나옵니다.';

const EXCLUDED_STEP = /도금|절단|태핑|탭핑|용접|선별|포장|마무리|plating|cutting|welding|finishing/i;
/** 같은 조항이 「넣는다」고 한 것 — 용융아연도금(galvanizing)·코팅. 이름에 있으면 되묻지 않는다. */
const INCLUDED_COATING = /용융|코팅|지오메트|다크로|galvaniz|coating/i;

/** 연료 이름이 경계 밖 공정(도금·절단·용접·마무리)의 것으로 보이는가. */
export function looksLikeExcludedStepFuel(name: string | undefined): boolean {
    const text = name ?? '';
    return EXCLUDED_STEP.test(text) && !INCLUDED_COATING.test(text);
}
