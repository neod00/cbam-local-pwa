/**
 * 파일 이름에 붙는 날짜·시각 — 항상 **현지 시간**이다. 한 번에 내려받는 문서들(산정보고서·모니터링 계획·EU 엑셀·패키지·백업)이
 * 서로 다른 날짜를 달면(어떤 것은 UTC, 어떤 것은 현지) 한국 시간 새벽에 같은 시점의 문서가 하루 어긋나 보인다(씨밤이 run40 P2-01).
 */
const pad = (value: number) => String(value).padStart(2, '0');

/** YYYYMMDD */
export function localDateStamp(date: Date): string {
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

/** YYYYMMDDHHMMSS */
export function localDateTimeStamp(date: Date): string {
    return `${localDateStamp(date)}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/** YYYY-MM-DD */
export function localIsoDate(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
