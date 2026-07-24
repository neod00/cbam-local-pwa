# 개선 제안 — run09

회귀 6/6 유지. 신규 1건.

---

## P1-run09-01 — 소결광은 등록은 되는데 EU 문서를 만들 수 없다

**무엇**

2단계에서 CN 26011200을 넣으면 앱이 이렇게 말한다:

> CBAM 대상 · Iron and steel — EU 공식 Communication Template(판본 20241213)의 CN 목록에서
> CN 26011200 → 품목군 「Sintered Ore」로 조회됨.

그런데 7단계에서는 **오류 2건**으로 Export가 막힌다:

> 제품 — 소결광 (Sintered Ore): EU CBAM goods category로 매핑할 수 없습니다.
> 생산공정 — 소결공장: 제품 소결광 (Sintered Ore)의 EU goods category 매핑이 필요합니다.

**같은 앱이 같은 CN을 두고 「조회됨」과 「매핑할 수 없음」을 동시에 말한다.**
8단계는 잠긴 채로 남고, 사용자는 무엇을 고쳐야 하는지 알 수 없다 — 고칠 것이 없기 때문이다.

**원인 (두 겹)**

1. `eu-template-export.ts`의 `mapProductToEuGood`은 **접두 규칙 사슬**로 매핑한다:
   `7201`(선철) · `7203`(DRI) · `7206/7207`(조강) · `7208~7229`·`73`(철강제품).
   소결광 CN은 **2601**이라 어디에도 걸리지 않고 `undefined`를 돌려준다.
   이 파일은 `cn-master.generated.ts`를 **쓰지 않는다** (쓰는 곳은 calculation-report.ts와
   cbam-product-rules.ts뿐). 즉 CN 마스터 작업이 Export 경로에는 닿지 않았다.

2. 더 정확히는 — 그 앞에 `cnCodeMap`(업로드한 워크북에서 파싱한 CN→품목군 맵)을 보는
   분기가 있고, 거기서는 `Sintered Ore`가 통과한다. 그런데 **화면이 쓰는 준비도 검사는
   그 맵 없이 계산된다**:

   ```ts
   // GuidedWorkspace.fetchGuidedData
   evaluateEuExportReadiness({ periods, reportingPeriodId, products, ... })   // ← cnCodeMap 없음
   // createEuTemplateExportCopyResult
   evaluateEuExportReadiness(data, cnCodeMap)                                  // ← 있음
   ```

   즉 **화면의 준비도가 실제 Export보다 엄격하다.** 소결광은 Export 시점이면 통과할
   값인데, 그 앞에서 버튼이 잠긴다. 사용자는 통과할 수 있는 자료를 두고 막힌다.

**영향 범위 — 소결광만이 아니다**

`mapProductToEuGood`의 두 성공 분기가 **모두 `STEEL_EU_GOODS_SET`(6개)로 한정**된다:

```ts
if (templateGood && STEEL_EU_GOODS_SET.has(templateGood)) return templateGood;
if (EU_GOODS_SET.has(pte) && STEEL_EU_GOODS_SET.has(pte)) return pte;
```

그래서 시멘트·비료·알루미늄·수소·암모니아는 CN 마스터에 있고 2단계에서 「CBAM 대상」으로
조회되지만 **Export는 영영 안 된다.** 지도는 569개 CN을 받아들이는데 Export는 철강 6종만
안다. 철강 전용이라는 범위 설정이라면 그건 그것대로 정당하나, **화면이 그 범위를 말하지
않는다.** 사용자는 등록이 되니 지원되는 줄 안다.

**제안**

1. **(핵심) 준비도 검사에 CN 마스터를 물린다.** `cn-master.generated.ts`가 오프라인
   권위 자료다 — 워크북 업로드 여부와 무관하게 26011200 → Sintered Ore를 안다.
   `mapProductToEuGood`이 접두 사슬보다 **먼저** CN 마스터를 조회하게 하면,
   화면 준비도와 실제 Export가 같은 답을 낸다. 접두 사슬은 CN이 마스터에 없을 때의
   최후 수단으로만 남긴다(또는 제거).
2. **범위를 화면에서 말한다.** 철강 6종 밖의 품목군을 등록하면 2단계에서
   「이 품목군은 EU 문서 생성이 아직 지원되지 않습니다」를 그 자리에서 알린다.
   7단계에서 「매핑할 수 없습니다」로 만나면 원인도 해법도 알 수 없다.
3. 게이트: 준비도 검사를 부르는 곳이 CN 판정 자료 없이 부르지 못하게 한다
   (지금은 5곳이 제각각이다).

**재현**

1. 새 프로젝트 → 사업장·보고기간 등록
2. 2단계에서 제품 「소결광」, CN `26011200` → 「CBAM 대상 · Sintered Ore로 조회됨」 확인
3. 3단계 공정 등록, 4·5단계 연료·전력 입력
4. 7단계 → 오류 2건, 8단계 잠김. 고칠 방법이 화면에 없음.

---

## 참고 — 이번 run이 확인한 것

- **MIXED 집계 상태가 실사용에서 성립한다.** 소결광(간접 포함) + 강관(간접 비관련)
  조합에서 화면이 「제품마다 다름」이라 하고, 총 SEE 항등식을 인쇄하지 않았다.
  실제로 기준 0.188 + 간접 0.020 = 0.209 ≠ 총 0.196이라, 인쇄했으면 **틀린 등식이
  화면에 나갔을** 자리다. R7~R9 작업이 단위테스트 밖에서도 유지된다.
- 화면 숫자 5종이 손계산과 소수점까지 일치했다.
- run08 6건 수정이 전부 유지된다.
