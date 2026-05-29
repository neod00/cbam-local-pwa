export default function Home() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
      <p className="mt-4 text-gray-600">
        국내 중소·중견 기업을 위한 로컬 우선 CBAM 내재배출량 산정 도구입니다.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="text-lg font-medium text-gray-900">앱 상태</h3>
          <p className="mt-2 text-sm text-gray-500">
            입력, 백업, 산정 준비가 가능한 로컬 PWA 모드입니다.
          </p>
          <div className="mt-4">
            <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
              정상
            </span>
          </div>
        </div>

        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="text-lg font-medium text-gray-900">주요 작업</h3>
          <ul className="mt-2 list-disc pl-5 text-sm text-gray-500">
            <li>HS72/73 제품 등록</li>
            <li>보고기간 생성</li>
            <li>활동자료 엑셀 업로드 준비</li>
          </ul>
        </div>

        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="text-lg font-medium text-gray-900">데이터 보관</h3>
          <p className="mt-2 text-sm text-gray-500">
            기업 데이터는 브라우저 로컬 DB에 저장됩니다. 중요한 입력 후에는 .cbam 백업 파일을 내려받으세요.
          </p>
        </div>
      </div>
    </div>
  );
}
