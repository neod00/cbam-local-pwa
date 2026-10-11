/**
 * 「제품 이름 · CN 코드」를 한 줄로 쓴다. 이름에 CN이 이미 들어 있으면(품번 목록으로 만든 이름 「SWCH18A · CN 73181575」) 다시 붙이지 않는다 —
 * 「… · CN 73181575 · CN 73181575」로 겹쳐 보이던 것(run35 P2-01).
 * missing: CN이 비었을 때 보일 글자(없으면 CN 부분을 생략한다).
 */
export function productWithCn(name: string, cn: string | null | undefined, missing?: string): string {
    const code = (cn ?? '').trim();
    if (!code) return missing === undefined ? name : `${name} · CN ${missing}`;
    const digits = code.replace(/\D/g, '');
    if (digits && name.replace(/\s+/g, '').includes(digits)) return name;
    return `${name} · CN ${code}`;
}
