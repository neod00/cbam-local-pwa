import { getLocalSetting, REPORT_INPUTS_SETTING_KEY, setLocalSetting, type ReportInputs } from './local-db';
import { withGridFactorMeta } from './electricity-ef-basis';

/**
 * 전력 배출계수로 앱에 내장된 값(한국 0.475 · 목록에 없는 나라 0.465)을 계통 평균으로 저장했다면, 그 값의 출처(공표기관·문서·연도)를
 * 보고서 입력(제7장)에 함께 적는다 — 사용자가 따로 적지 않아도 검증인이 대조할 수 있다. 다른 값이면 아무것도 하지 않는다.
 */
export async function applyGridFactorMeta(processId: string, ef: number, efSource: string | undefined): Promise<void> {
    const current = await getLocalSetting<ReportInputs>(REPORT_INPUTS_SETTING_KEY);
    const next = withGridFactorMeta(current, processId, ef, efSource);
    if (next) await setLocalSetting(REPORT_INPUTS_SETTING_KEY, next);
}
