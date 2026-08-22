'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Volume2, VolumeX, Sparkles, X, RotateCcw } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subUnitName: string;
  accuracyRate: number;
  thresholdRate?: number;
  customThreshold?: number;
  threshold?: number;
  voiceScript?: string;
  voiceBriefing?: string;
  onStartMission: () => void;
}

export const PrescriptionVoiceModal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subUnitName,
  accuracyRate,
  thresholdRate,
  customThreshold,
  threshold,
  voiceScript,
  voiceBriefing,
  onStartMission
}) => {
  // 1. 임계치 수치 다중 키 안전 바인딩 (어떤 프로퍼티명으로 넘겨도 정확하게 N% 추출)
  const displayThreshold = thresholdRate ?? customThreshold ?? threshold ?? 60;
  const scriptText = voiceScript || voiceBriefing || 
    `최근 ${subUnitName} 단원의 정답률이 ${accuracyRate}%로 선생님 목표 기준 ${displayThreshold}%보다 낮아 맞춤 처방 5문항 클리닉이 배정되었습니다.`;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // 음성 합성 재생 함수 (브라우저 정책 및 보이스 로딩 방어)
  const playVoice = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume(); // 브라우저 일시정지 상태 해제

      const utterance = new SpeechSynthesisUtterance(scriptText);
      utterance.lang = 'ko-KR';
      utterance.rate = 1.0;
      utterance.pitch = 1.05;

      // 한국어 보이스 선택
      const voices = window.speechSynthesis.getVoices();
      const koVoice = voices.find(v => v.lang.includes('ko') || v.lang.includes('KR'));
      if (koVoice) {
        utterance.voice = koVoice;
      }

      utterance.onstart = () => {
        setIsSpeaking(true);
        setAutoplayBlocked(false);
      };

      utterance.onend = () => {
        setIsSpeaking(false);
      };

      utterance.onerror = (e) => {
        console.warn('[TTS Playback Warning]', e);
        setIsSpeaking(false);
        // 브라우저 자동재생 차단(not-allowed) 등 감지
        if (e.error === 'not-allowed' || e.error === 'interrupted') {
          setAutoplayBlocked(true);
        }
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error('[TTS Execution Error]', err);
      setAutoplayBlocked(true);
    }
  }, [scriptText]);

  const stopVoice = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  // 팝업 열릴 때 자동 재생 시도
  useEffect(() => {
    if (isOpen) {
      setAutoplayBlocked(false);
      // 브라우저 음성 목록 비동기 로드 대응
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = () => {
          // 보이스 로드 완료
        };
      }
      
      const timer = setTimeout(() => {
        playVoice();
      }, 300);

      return () => {
        clearTimeout(timer);
        stopVoice();
      };
    } else {
      stopVoice();
    }
  }, [isOpen, playVoice, stopVoice]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 relative animate-in fade-in zoom-in duration-200">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 상단 뱃지 및 음성 재생 버튼 */}
        <div className="flex items-center justify-between mb-3 pr-8">
          <div className="flex items-center gap-2">
            <span className={`p-2 rounded-xl transition-all ${
              isSpeaking 
                ? 'bg-purple-600 text-white animate-pulse shadow-md shadow-purple-500/30' 
                : 'bg-purple-100 text-purple-700'
            }`}>
              <Volume2 className="w-5 h-5" />
            </span>
            <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full border border-purple-200">
              AI 음성 코칭 & 자동 처방 미션
            </span>
          </div>

          <button
            type="button"
            onClick={isSpeaking ? stopVoice : playVoice}
            className="flex items-center gap-1 text-[11px] font-bold text-purple-700 bg-purple-100/70 hover:bg-purple-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
          >
            {isSpeaking ? (
              <>
                <VolumeX className="w-3.5 h-3.5" />
                <span>음성 멈춤</span>
              </>
            ) : (
              <>
                <RotateCcw className="w-3.5 h-3.5" />
                <span>음성 다시듣기</span>
              </>
            )}
          </button>
        </div>

        <h3 className="text-xl font-bold text-slate-900 mb-2 leading-snug">
          {title}
        </h3>

        {/* 현재 정답률 vs 선생님 목표치 비교 배너 */}
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 my-3 text-xs text-rose-800 flex items-center justify-between shadow-xs">
          <div>
            <span className="font-bold text-slate-800 block text-xs">{subUnitName}</span>
            <span className="text-[11px] text-rose-700">기준 미달 취약점 감지</span>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 justify-end">
              <span className="text-[11px] text-slate-500">내 정답률:</span>
              <span className="text-sm font-black text-rose-600 font-mono">{accuracyRate}%</span>
            </div>
            <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md inline-block mt-0.5">
              선생님 목표: {displayThreshold}%
            </span>
          </div>
        </div>

        {/* 음성 코칭 텍스트 박스 */}
        <div className="relative bg-slate-50 p-3.5 rounded-2xl border border-slate-200 mb-5">
          <p className="text-xs text-slate-700 leading-relaxed font-medium">
            "{scriptText}"
          </p>
          {autoplayBlocked && (
            <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-purple-700 font-semibold">
              <span>🔊 브라우저 자동재생 차단됨</span>
              <button
                type="button"
                onClick={playVoice}
                className="underline hover:text-purple-900 cursor-pointer"
              >
                여기를 눌러 음성 듣기
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="py-3 px-4 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
          >
            나중에 하기
          </button>
          <button
            type="button"
            onClick={onStartMission}
            className="py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-bold shadow-md flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-98"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>미션 시작하기</span>
          </button>
        </div>
      </div>
    </div>
  );
};
