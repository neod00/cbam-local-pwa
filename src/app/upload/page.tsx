'use client';

import { Upload as UploadIcon, FileText } from 'lucide-react';

export default function UploadPage() {
    return (
        <div>
            <h1 className="text-2xl font-bold text-gray-900">자료 업로드</h1>
            <p className="mt-2 text-gray-600">표준 엑셀 템플릿을 사용해 활동자료를 업로드합니다.</p>

            <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">

                {/* Step 1: Download Template */}
                <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                    <h2 className="text-lg font-medium text-gray-900">1. 템플릿 다운로드</h2>
                    <p className="mt-2 text-sm text-gray-500">
                        데이터 수집용 내부 템플릿을 내려받습니다. EU 제출용 원본 템플릿은 Export 단계에서 별도로 생성합니다.
                    </p>
                    <button className="mt-4 flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                        <FileText className="mr-2 h-4 w-4 text-gray-500" />
                        엑셀 템플릿 다운로드
                    </button>
                </div>

                {/* Step 2: Upload File */}
                <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                    <h2 className="text-lg font-medium text-gray-900">2. 자료 업로드</h2>
                    <div className="mt-4 flex max-w-lg justify-center rounded-md border-2 border-dashed border-gray-300 px-6 pt-5 pb-6">
                        <div className="space-y-1 text-center">
                            <UploadIcon className="mx-auto h-12 w-12 text-gray-400" />
                            <div className="flex text-sm text-gray-600">
                                <label
                                    htmlFor="file-upload"
                                    className="relative cursor-pointer rounded-md bg-white font-medium text-blue-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 hover:text-blue-500"
                                >
                                    <span>파일 선택</span>
                                    <input id="file-upload" name="file-upload" type="file" className="sr-only" />
                                </label>
                                <p className="pl-1">또는 끌어다 놓기</p>
                            </div>
                            <p className="text-xs text-gray-500">XLSX, CSV 최대 10MB</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
