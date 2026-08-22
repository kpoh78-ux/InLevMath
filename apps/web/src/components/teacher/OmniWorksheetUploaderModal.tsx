// apps/web/src/components/teacher/OmniWorksheetUploaderModal.tsx
'use client';

import React, { useState } from 'react';
import { Sparkles, FileText, CheckCircle2, Cpu, ArrowRight, Layers, Table, AlertTriangle } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedFileName: string;
  pdfFileBlob?: Blob;
  onConfirmSave: (data: any) => void;
}

export const OmniWorksheetUploaderModal: React.FC<Props> = ({
  isOpen,
  onClose,
  selectedFileName,
  pdfFileBlob,
  onConfirmSave
}) => {
  const [isParsing, setIsParsing] = useState(false);
  const [parsedResult, setParsedResult] = useState<any>(null);

  const handleStartOmniParse = async () => {
    if (!pdfFileBlob) return;
    setIsParsing(true);

    try {
      const formData = new FormData();
      formData.append('file', pdfFileBlob, selectedFileName);

      const res = await fetch('/api/worksheet/parse-omni', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setParsedResult(data.analysis);
      }
    } catch (e) {
      alert('자동 분석 중 오류가 발생했습니다.');
    } finally {
      setIsParsing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-3xl p-6 max-w-2xl w-full shadow-2xl border border-slate-100 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-purple-100 text-purple-700">
              <Sparkles className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Omni-Route AI 학습지 정답 & 단원·유형 자동 추출</h3>
              <p className="text-xs text-slate-500">{selectedFileName}</p>
            </div>
          </div>
          <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full font-bold">
            토큰 90% 절약 모드
          </span>
        </div>

        {!parsedResult ? (
          <div className="py-10 text-center space-y-4 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
            <FileText className="w-12 h-12 text-slate-400 mx-auto animate-bounce" />
            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-800">무료 티어 멀티 AI(Gemini 2.5 Flash / Groq)를 통해</p>
              <p className="text-xs text-slate-500">정답표 추출과 대/중/소단원/유형 분류를 1초 만에 완료합니다.</p>
            </div>
            <button
              onClick={handleStartOmniParse}
              disabled={isParsing}
              className="py-3 px-6 rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-98 text-white text-xs font-bold shadow-md inline-flex items-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>{isParsing ? '무료 AI 로드밸런싱 분석 중...' : '원클릭 AI 정답 & 유형 추출 시작'}</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4 max-h-[460px] overflow-y-auto pr-1">
            {/* 단원 및 유형 분류 결과 카드 */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2">
              <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-600" /> 4계층 교과 분류 결과
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-400 block">대단원</span>
                  <span className="font-bold text-slate-800">{parsedResult.majorUnit}</span>
                </div>
                <div className="p-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-400 block">중단원</span>
                  <span className="font-bold text-slate-800">{parsedResult.middleUnit}</span>
                </div>
                <div className="p-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-400 block">소단원</span>
                  <span className="font-bold text-slate-800">{parsedResult.subUnit}</span>
                </div>
                <div className="p-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-400 block">대표 문제유형</span>
                  <span className="font-bold text-purple-700">{parsedResult.mainPatternType}</span>
                </div>
              </div>
            </div>

            {/* 정답표 테이블 */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-2">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Table className="w-4 h-4 text-emerald-600" /> 추출된 문항 정답표 ({parsedResult.answers?.length || 0}문항)
              </span>
              <div className="grid grid-cols-5 gap-1.5 text-center text-xs">
                {(parsedResult.answers || []).map((ans: any) => (
                  <div key={ans.questionNumber} className="p-2 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="text-[10px] text-slate-400 block">{ans.questionNumber}번</span>
                    <span className="font-bold text-indigo-700">{ans.answer}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
              <span>적용 프로바이더: <strong className="text-slate-700">{parsedResult.providerUsed}</strong></span>
              <span>비용: 0원 (무료 티어 활용)</span>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer">
            닫기
          </button>
          {parsedResult && (
            <button
              onClick={() => onConfirmSave(parsedResult)}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-300" />
              <span>정답 & 단원 설정 저장</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
