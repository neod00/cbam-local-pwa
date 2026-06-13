# P0 수정 기록 — see_cbam_basis 전구물질 indirect 과대계상

> 씨밤이 run01에서 발견한 P0 결함(`improvement-suggestions.md` 참조)을 2026-06-13 같은 세션에서 수정·검증한 기록.

## 무엇이 문제였나
철강 등 **Annex II direct-only** 품목의 인증서 산정 기준 SEE(`see_cbam_basis`)에, 자체 전력 간접배출은 정상 제외되었으나 **전구물질(precursor)의 간접배출까지 포함**되어 인증서 의무량이 과대계상되었다.

- 수정 전: `precursor_see = Σ(소비량 × (direct_see + indirect_see)) / output` 를 합산한 뒤 `see_cbam_basis = direct_see + indirect_see(=0) + precursor_see` 로 계산 → 전구물질 indirect가 그대로 인증서 기준에 포함.
- 영향(EU 공식 EAF alloys 예제 대비): P1 1.79689 vs 정답 1.00149 (**+79.4%**), P2 2.93239 vs 1.43961 (**+103.7%**).

## 무엇을 고쳤나
`src/lib/calculation-engine.ts`:
1. 전구물질 기여를 **direct/indirect로 분리** 집계(`precursorDirectEmissions` / `precursorIndirectEmissions`).
2. declarant 보고용 필드 추가: `see_direct_incl_precursor`(= 자체 direct + 전구물질 direct = EU SEE(direct)), `see_indirect_incl_precursor`(= 자체 indirect + 전구물질 indirect = EU SEE(indirect)), `precursor_direct_see`, `precursor_indirect_see`.
3. **인증서 기준 산식 교정**:
   - Annex II direct-only 품목: `see_cbam_basis = see_direct_incl_precursor` (자체·전구물질 indirect 모두 제외)
   - 그 외(간접 포함 품목, 예 CN 2601 12 00): `see_cbam_basis = see_direct_incl_precursor + see_indirect_incl_precursor`
4. `see_informational_total`(참고용 총 SEE)는 변경 없음 — 여전히 direct + own_indirect + precursor(d+i).
5. 공정-합계 분기와 제품 생산라인(output line) 분기 모두 적용. 레거시 `calculateEmission` 헬퍼(미사용)도 새 필드 채우도록 갱신.

`scripts/verify-local-calculation.mjs`: 기존 기대값 교정(`see_cbam_basis` 1.57→1.32) + 신규 필드 단언 + **EU EAF alloys 예제 회귀 케이스** 추가(인증서 기준이 EU SEE(direct)와 일치, 과거 버그값 미재발 가드).

## 검증 결과 (수정 후)
| 제품 | see_cbam_basis (수정 후) | EU SEE(direct) 정답 | informational_total | EU SEE(total) |
|------|--------------------------|----------------------|---------------------|----------------|
| P1 (CN 72189911) | **1.00153** | 1.00149 ✅ | 2.37999 | 2.37991 ✅ |
| P2 (CN 72191310) | **1.43961** | 1.43961 ✅ | 3.17111 | 3.17109 ✅ |

- `node cbamy/runs/2026-06-13_run01/engine-crosscheck.mjs` → 차이 0.00000, OK
- `npm run verify:calculation` (EAF 회귀 포함) PASS, `verify:scenarios`·`verify:dashboard`·`verify:export` PASS, `npm run lint`·`npm run build` PASS

## (4) declarant 보고용 SEE(direct)/SEE(indirect) 분해 노출 — 완료
- `/results`(데스크톱 표 보조줄 + 모바일 카드)와 `/export` 미리보기(모바일 카드 + 데스크톱 표)에 **보고용 SEE(직접/간접, 전구물질 포함)** 을 표시. 기존 "직접/간접 SEE"는 "(자체)"로 라벨 명확화. 컬럼 추가 없이 보조줄 방식으로 반영(colSpan 영향 없음).
- `eu-template-export.ts`: 코드 변경 불필요로 확인. 전구물질 direct/indirect를 E_PurchPrec에 각각 기록(L+35/L+38/L+41)하고 Summary_Products의 SEE(direct/indirect) 셀(I/J)은 **Excel 공식에 위임**하므로, 내보낸 워크북의 declarant SEE 분해는 Excel 재계산으로 정확히 산출됨(direct-only 제외 로직도 워크북 자체 공식이 처리).

## 남은 후속 (선택)
- IR (EU) 2025 확정기간 원문으로 direct-only 전구물질 indirect 제외 산식 최종 확인(본 수정은 EU 공식 예제 재현으로 검증).
- `/results`·`/export`에 "보고용 SEE(전구물질 포함) vs CBAM 산정 기준 SEE(인증서 의무)" 차이를 설명하는 안내 문구 보강.
