import {
    BarChart3,
    Boxes,
    Building2,
    Calculator,
    Calendar,
    Factory,
    FileSpreadsheet,
    Flame,
    Package,
    ShieldCheck,
    Upload,
    type LucideIcon,
} from 'lucide-react';

export type WorkflowStepTone = 'start' | 'input' | 'review' | 'export' | 'safety';

export interface WorkflowGuideStep {
    id: string;
    order: number;
    title: string;
    route: string;
    group: string;
    tone: WorkflowStepTone;
    icon: LucideIcon;
    purpose: string;
    primaryAction: string;
    evidence: string;
    completionSignal: string;
}

export const workflowGuideSteps: WorkflowGuideStep[] = [
    {
        id: 'installation',
        order: 1,
        title: '사업장 등록',
        route: '/installations',
        group: '시작',
        tone: 'start',
        icon: Building2,
        purpose: 'EU Communication Template의 A_InstData에 들어갈 사업장 식별정보를 준비합니다.',
        primaryAction: '영문 사업장명과 국가 코드를 먼저 저장하세요.',
        evidence: '사업장명, 국가 코드, 주소, 담당자 연락처',
        completionSignal: '사업장 카드가 1개 이상 보이고 국가 코드가 표시됩니다.',
    },
    {
        id: 'period',
        order: 2,
        title: '보고기간 설정',
        route: '/periods',
        group: '시작',
        tone: 'start',
        icon: Calendar,
        purpose: '내부 산정 범위와 Export 검토 기준 기간을 맞춥니다.',
        primaryAction: '분기 또는 연간 보고기간을 등록하세요.',
        evidence: '기간명, 시작일, 종료일',
        completionSignal: '보고기간 목록에 작성중 또는 계산준비 상태가 표시됩니다.',
    },
    {
        id: 'products',
        order: 3,
        title: '품목 등록',
        route: '/products',
        group: '입력자료',
        tone: 'input',
        icon: Package,
        purpose: 'CN 8자리 기준으로 CBAM 대상 품목과 Annex 처리 방향을 확인합니다.',
        primaryAction: 'EU 템플릿 CN 목록을 가져온 뒤 제품명과 CN 8자리 코드를 저장하세요.',
        evidence: '제품명, HS/CN 코드, 품목군, 단위',
        completionSignal: '제품 목록에 CN 8자리 코드와 산정 준비 상태가 표시됩니다.',
    },
    {
        id: 'processes',
        order: 4,
        title: '생산공정과 제품 배분',
        route: '/processes',
        group: '입력자료',
        tone: 'input',
        icon: Factory,
        purpose: '한 공정에서 여러 제품이 나오는 경우 생산량 기준으로 배출량을 배분합니다.',
        primaryAction: '공정 총생산량, 제품 생산라인, 직접 귀속 배출량을 입력하세요.',
        evidence: '생산량, 시장 출하량, 내부소비량, 배분 기준',
        completionSignal: '제품 생산라인 합계와 공정 총생산량 차이가 경고 없이 정리됩니다.',
    },
    {
        id: 'source-streams',
        order: 5,
        title: '배출원 자료 연결',
        route: '/source-streams',
        group: '입력자료',
        tone: 'input',
        icon: Flame,
        purpose: '직접배출량의 근거가 되는 연료, 공정 원료, 산정계수를 공정에 연결합니다.',
        primaryAction: '배출원 유형, 활동자료, 순발열량, 배출계수, 증빙 출처를 입력하세요.',
        evidence: '연료 사용량, 계량자료, 인보이스, 계수 출처',
        completionSignal: '생산공정의 직접배출량과 배출원 합계 차이가 검토 가능한 수준으로 표시됩니다.',
    },
    {
        id: 'precursors',
        order: 6,
        title: '전구물질 확인',
        route: '/precursors',
        group: '입력자료',
        tone: 'input',
        icon: Boxes,
        purpose: '구매 전구물질의 실제자료, 기본값 사용 사유, 검증 상태를 제품에 연결합니다.',
        primaryAction: '데이터 모드와 검증 상태를 선택하고 투입량과 SEE 값을 입력하세요.',
        evidence: '공급사 Communication Template, 기본값 사용 사유, 구매량/투입량',
        completionSignal: '기본값 사유 누락 또는 미검증 실제자료 경고가 해소됩니다.',
    },
    {
        id: 'references',
        order: 7,
        title: '공식 기준자료 가져오기',
        route: '/upload',
        group: '입력자료',
        tone: 'input',
        icon: Upload,
        purpose: 'SEFA와 기본값 시나리오 판단에 필요한 벤치마크와 국가/CN 기본값을 로컬로 읽습니다.',
        primaryAction: 'CBAMBenchmarks와 DVsasadopted 엑셀 파일을 각각 선택하세요.',
        evidence: 'EU 공식 기준자료 원본 파일',
        completionSignal: '기준자료 세트가 2/2로 표시되고 저장된 기준행 수가 보입니다.',
    },
    {
        id: 'results',
        order: 8,
        title: '산정 결과 검토',
        route: '/results',
        group: '산정·검토',
        tone: 'review',
        icon: BarChart3,
        purpose: 'CBAM 산정 기준 SEE와 내부 검토용 total SEE를 분리해 확인합니다.',
        primaryAction: '확인 필요 항목을 위에서부터 열어 입력 화면으로 돌아가 수정하세요.',
        evidence: '제품별 SEE, 배출원 불일치, 전구물질 검토 경고',
        completionSignal: '산정 결과 경고가 설명과 수정 링크로 정리됩니다.',
    },
    {
        id: 'scenarios',
        order: 9,
        title: 'SEFA·인증서 시나리오',
        route: '/scenarios',
        group: '산정·검토',
        tone: 'review',
        icon: Calculator,
        purpose: '실측/기본값 SEE와 벤치마크 기준 인증서 비용 지표를 비교합니다.',
        primaryAction: '원산지, 기본값 연도, CSCF, 인증서 가격 가정을 확인하세요.',
        evidence: '벤치마크, 국가/CN 기본값, 원산지, 인증서 가격',
        completionSignal: '실측자료와 기본값 중 어떤 기준이 검토상 유리한지 표시됩니다.',
    },
    {
        id: 'export',
        order: 10,
        title: 'EU Communication Export',
        route: '/export',
        group: '내보내기',
        tone: 'export',
        icon: FileSpreadsheet,
        purpose: '사용자가 보유한 최신 EU 원본 템플릿에 로컬 산정 데이터를 반영한 복사본을 만듭니다.',
        primaryAction: '최신 Communication Template을 선택하고 오류 0건 상태에서 복사본을 다운로드하세요.',
        evidence: 'EU 원본 템플릿, Export 게이트, 공식 수식 보존 로그',
        completionSignal: '복사본 생성 및 셀 검증 완료 메시지와 파일명이 표시됩니다.',
    },
    {
        id: 'excel-review',
        order: 11,
        title: 'Excel 공식 수식 재계산',
        route: '/export',
        group: '내보내기',
        tone: 'export',
        icon: FileSpreadsheet,
        purpose: '앱 검토값과 EU 원본 템플릿의 공식 수식 결과가 어떻게 다른지 마지막으로 확인합니다.',
        primaryAction: '다운로드한 복사본을 Microsoft Excel에서 열고 Summary_Products의 SEE 공식을 확인하세요.',
        evidence: 'Summary_Products I/J/K 공식 수식 결과',
        completionSignal: 'Excel 재계산 결과를 회사 내부 검토 기록에 남깁니다.',
    },
    {
        id: 'backup',
        order: 12,
        title: '.cbam 백업 보관',
        route: '/settings',
        group: '보안·관리',
        tone: 'safety',
        icon: ShieldCheck,
        purpose: '브라우저 로컬 DB에 저장된 입력자료를 회사가 관리하는 파일로 남깁니다.',
        primaryAction: '중요 변경 후 .cbam 백업을 내려받아 안전한 사내 폴더에 보관하세요.',
        evidence: '다운로드한 .cbam 백업 파일',
        completionSignal: '설정 화면에 마지막 백업 시각이 표시됩니다.',
    },
];

export function getWorkflowStepByRoute(route: string) {
    return workflowGuideSteps.find((step) => step.route === route);
}

export function getNextWorkflowStep(route: string) {
    const current = getWorkflowStepByRoute(route);

    if (!current) {
        return workflowGuideSteps[0];
    }

    return workflowGuideSteps.find((step) => step.order > current.order) ?? workflowGuideSteps[0];
}
