'use client';

// apps/web/src/components/kiosk/AttendanceKiosk.tsx
//
// 학원 입구 태블릿의 4자리 PIN 출결 화면 (/kiosk).
//
// 원래 apps/kiosk/ 라는 별도 폴더에 있었고, apps/web 에서 한 줄짜리 re-export 로
// 폴더 밖(../../../../kiosk/...)을 끌어다 썼다. package.json 도 없는 워크스페이스라
// 빌드·배포가 apps/web 밖 파일에 기대는 상태였다. 여기로 옮겨 그 연결을 끊었다.
//
// ── 로그인 ──────────────────────────────────────────────────────────────────
// 키오스크 API 는 선생님 로그인을 요구한다. 태블릿에 한 번 로그인해 두면
// 토큰이 30일 유지되므로 아침마다 다시 할 필요는 없다.
// 로그아웃돼 있으면 키패드 대신 안내를 띄운다 — 눌러도 안 되는 화면을
// 그대로 보여 주면 기기 고장으로 오해한다.

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Delete, CheckCircle2, LogOut, Bell, UserCheck, RefreshCw, Clock, Sparkles, Lock } from 'lucide-react';
import { getToken } from '@/lib/api';

interface AttendanceResponse {
  studentId?: string;
  studentName: string;
  grade: string;
  type: 'CHECK_IN' | 'NEED_CHECK_OUT' | 'CHECK_OUT' | 'ALREADY_CHECKED_OUT' | 'ERROR';
  checkInTime?: string;
  checkOutTime?: string;
  parentPhoneMasked: string;
  alimtalkSent: boolean;
  message?: string;
}

export const AttendanceKiosk: React.FC = () => {
  const [pin, setPin] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<AttendanceResponse | null>(null);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  // null = 아직 확인 전. 서버가 401 을 주면 false 로 내려간다
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    setSignedIn(Boolean(getToken()));
  }, []);

  /** 키오스크 API 호출 — 저장된 선생님 토큰을 함께 보낸다 */
  const kioskFetch = async (path: string, body: unknown) => {
    const token = getToken();
    const res = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    // 토큰이 없거나 만료됐다 — 키패드 대신 안내를 띄운다.
    // apiFetch 처럼 곧바로 다른 화면으로 보내지 않는 이유: 태블릿이 입구에
    // 놓여 있어 화면이 바뀌면 아무도 되돌리지 못한다.
    if (res.status === 401) setSignedIn(false);
    return res;
  };

  // 실시간 시계
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleDateString('ko-KR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleKeyClick = (digit: string) => {
    if (loading) return;
    setErrorMsg('');
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      if (nextPin.length === 4) {
        processPin(nextPin);
      }
    }
  };

  const handleDelete = () => {
    if (loading) return;
    setErrorMsg('');
    setPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (loading) return;
    setPin('');
    setResult(null);
    setErrorMsg('');
  };

  // 4자리 입력 시 서버 검증 & 등/하원 처리
  const processPin = async (inputPin: string) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await kioskFetch('/api/attendance/kiosk-check', { pin: inputPin });
      const data: AttendanceResponse = await res.json();

      if (!res.ok || data.type === 'ERROR') {
        setErrorMsg(data.message || '출결 번호가 일치하지 않습니다.');
        setTimeout(() => {
          setPin('');
          setErrorMsg('');
        }, 3000);
        return;
      }

      setResult(data);

      // 등원이나 하원 완료 시 3.5초 후 자동 리셋
      if (data.type === 'CHECK_IN' || data.type === 'CHECK_OUT' || data.type === 'ALREADY_CHECKED_OUT') {
        setTimeout(() => {
          setPin('');
          setResult(null);
        }, 3500);
      }
    } catch (e: any) {
      setErrorMsg('출결 확인에 실패했습니다. 관리자에게 문의하세요.');
      setTimeout(() => {
        setPin('');
        setErrorMsg('');
      }, 3000);
    } finally {
      setLoading(false);
    }
  };

  // 2차 입력 후 [퇴원하기] 버튼 클릭
  const handleConfirmCheckOut = async () => {
    if (!result) return;
    setLoading(true);
    try {
      const res = await kioskFetch('/api/attendance/confirm-checkout', {
        pin, studentId: result.studentId,
      });
      const data: AttendanceResponse = await res.json();
      setResult(data);
      setTimeout(() => {
        setPin('');
        setResult(null);
      }, 3500);
    } catch (e) {
      alert('하원 처리에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 로그아웃 상태 — 키패드를 아예 띄우지 않는다.
  // 눌러도 안 되는 화면을 보여 주면 학생이 기기 고장으로 오해한다.
  if (signedIn === false) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center gap-6 p-8 text-center font-sans">
        <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center">
          <Lock className="w-7 h-7 text-slate-400" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold">출결 키오스크가 잠겨 있습니다</h1>
          <p className="text-sm text-slate-400 leading-relaxed max-w-xs">
            이 태블릿에 선생님 계정으로 한 번 로그인하면 다시 쓸 수 있습니다.<br />
            로그인은 30일 동안 유지됩니다.
          </p>
        </div>
        <Link
          href="/"
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-8 py-4 rounded-2xl
                     text-base transition-colors min-h-[56px] flex items-center"
        >
          로그인하러 가기
        </Link>
        <button
          onClick={() => setSignedIn(Boolean(getToken()))}
          className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-4"
        >
          로그인을 마쳤다면 여기를 눌러 다시 확인
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-between p-6 select-none font-sans">
      {/* ── 1. 키오스크 상단 헤더 ── */}
      <header className="w-full max-w-md flex items-center justify-between border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-700 to-indigo-500 flex items-center justify-center font-black text-white text-lg shadow-lg shadow-indigo-600/30">
            InL
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-extrabold text-lg text-white tracking-tight">InLevMath 출결 시스템</h1>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                KIOSK
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">{currentTime}</p>
          </div>
        </div>
        <span className="text-[11px] font-bold px-3 py-1.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          정상 작동중
        </span>
      </header>

      {/* ── 2. 중앙 키패드 및 출결 안내 ── */}
      <main className="w-full max-w-md flex-1 flex flex-col items-center justify-center py-6 space-y-6">
        {!result ? (
          <>
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-black text-white tracking-tight">
                출결 번호 4자리를 입력하세요
              </h2>
              <p className="text-xs text-slate-400">
                (학생 전화번호 끝 4자리 또는 부여받은 출결 PIN)
              </p>
            </div>

            {/* 4자리 입력 디스플레이 */}
            <div className="flex items-center gap-3.5">
              {[0, 1, 2, 3].map((idx) => {
                const char = pin[idx];
                return (
                  <div
                    key={idx}
                    className={`w-14 h-16 rounded-2xl border-2 flex items-center justify-center text-3xl font-mono font-black transition-all duration-200 ${
                      char
                        ? 'bg-indigo-600/25 border-indigo-500 text-indigo-300 shadow-xl shadow-indigo-500/25 scale-105'
                        : 'bg-slate-900 border-slate-800 text-slate-700'
                    }`}
                  >
                    {char || '•'}
                  </div>
                );
              })}
            </div>

            {/* 에러 메시지 알림 */}
            {errorMsg && (
              <div className="w-full max-w-xs bg-rose-500/20 border border-rose-500/40 text-rose-300 px-4 py-2.5 rounded-2xl text-xs font-semibold text-center animate-shake">
                {errorMsg}
              </div>
            )}

            {/* 3x4 터치 숫자 키패드 (44px 이상 터치 타깃 준수) */}
            <div className="grid grid-cols-3 gap-3.5 w-full max-w-xs pt-1">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'DEL'].map((k) => {
                if (k === 'C') {
                  return (
                    <button
                      key={k}
                      onClick={handleClear}
                      disabled={loading || pin.length === 0}
                      className="h-16 rounded-2xl bg-slate-900 hover:bg-slate-800 active:scale-95 text-slate-400 font-bold text-sm border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-center disabled:opacity-40"
                    >
                      전체지움
                    </button>
                  );
                }
                if (k === 'DEL') {
                  return (
                    <button
                      key={k}
                      onClick={handleDelete}
                      disabled={loading || pin.length === 0}
                      className="h-16 rounded-2xl bg-slate-900 hover:bg-rose-950/40 hover:text-rose-400 active:scale-95 text-rose-400 font-bold text-lg border border-slate-800 hover:border-rose-800/50 transition-all flex items-center justify-center disabled:opacity-40"
                    >
                      <Delete className="w-6 h-6" />
                    </button>
                  );
                }
                return (
                  <button
                    key={k}
                    onClick={() => handleKeyClick(k)}
                    disabled={loading || pin.length >= 4}
                    className="h-16 rounded-2xl bg-slate-900 hover:bg-indigo-600 hover:text-white active:scale-95 text-slate-100 font-mono font-bold text-2xl border border-slate-800 hover:border-indigo-500 shadow-md hover:shadow-indigo-500/20 transition-all flex items-center justify-center disabled:opacity-60"
                  >
                    {k}
                  </button>
                );
              })}
            </div>
          </>
        ) : result.type === 'CHECK_IN' ? (
          /* ── 1차 입력 완료: 등원 완료 & 알림톡 발송 화면 ── */
          <div className="w-full bg-slate-900 border border-emerald-500/40 rounded-3xl p-7 text-center space-y-5 shadow-2xl shadow-emerald-500/10 animate-fade-in">
            <div className="w-18 h-18 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-11 h-11" />
            </div>
            <div>
              <span className="text-xs bg-emerald-500/20 text-emerald-300 px-3.5 py-1.5 rounded-full font-bold border border-emerald-500/30 inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                등원 확인 완료
              </span>
              <h3 className="text-2xl font-black text-white mt-3">
                {result.studentName} 학생 ({result.grade}) 반갑습니다!
              </h3>
              <p className="text-sm text-slate-300 mt-1.5">
                등원 시간: <strong className="text-emerald-400 font-mono text-base">{result.checkInTime}</strong>
              </p>
            </div>
            <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 text-xs text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-2 text-amber-300 font-semibold">
                <Bell className="w-4 h-4 text-amber-400 animate-bounce" /> 학부모 카카오 알림톡 자동 발송
              </span>
              <span className="font-mono text-slate-400">{result.parentPhoneMasked}</span>
            </div>
            <p className="text-[11px] text-slate-500">3.5초 후 초기 화면으로 자동 전환됩니다...</p>
          </div>
        ) : result.type === 'NEED_CHECK_OUT' ? (
          /* ── 2차 입력 시: 이미 등원 상태이므로 [퇴원하기] 버튼 표시 ── */
          <div className="w-full bg-slate-900 border border-blue-500/40 rounded-3xl p-7 text-center space-y-6 shadow-2xl animate-fade-in">
            <div className="w-18 h-18 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/40 mx-auto flex items-center justify-center shadow-lg shadow-blue-500/20">
              <UserCheck className="w-11 h-11" />
            </div>
            <div>
              <span className="text-xs bg-blue-500/20 text-blue-300 px-3.5 py-1.5 rounded-full font-bold border border-blue-500/30">
                현재 등원 중 (등원: {result.checkInTime})
              </span>
              <h3 className="text-2xl font-black text-white mt-3">
                {result.studentName} 학생, 수업을 마치셨나요?
              </h3>
              <p className="text-xs text-slate-400 mt-2">
                아래 [퇴원하기] 버튼을 누르면 학부모님께 하원 알림톡이 즉시 발송됩니다.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleClear}
                className="flex-1 py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 font-bold text-sm border border-slate-700 transition"
              >
                취소
              </button>
              <button
                onClick={handleConfirmCheckOut}
                disabled={loading}
                className="flex-2 py-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 active:scale-98 text-white font-black text-base shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-2 transition"
              >
                <LogOut className="w-5 h-5" />
                <span>{loading ? '하원 처리 중...' : '지금 퇴원하기'}</span>
              </button>
            </div>
          </div>
        ) : (
          /* ── 하원 처리 완료 화면 ── */
          <div className="w-full bg-slate-900 border border-indigo-500/40 rounded-3xl p-7 text-center space-y-5 shadow-2xl animate-fade-in">
            <div className="w-18 h-18 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 mx-auto flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <CheckCircle2 className="w-11 h-11" />
            </div>
            <div>
              <span className="text-xs bg-indigo-500/20 text-indigo-300 px-3.5 py-1.5 rounded-full font-bold border border-indigo-500/30">
                하원 처리 완료
              </span>
              <h3 className="text-2xl font-black text-white mt-3">
                {result.studentName} 학생 안녕히 가세요!
              </h3>
              <p className="text-sm text-slate-300 mt-1.5">
                하원 시간: <strong className="text-indigo-400 font-mono text-base">{result.checkOutTime}</strong>
              </p>
            </div>
            <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 text-xs text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-2 text-amber-300 font-semibold">
                <Bell className="w-4 h-4 text-amber-400" /> 학부모 하원 알림톡 발송 완료
              </span>
              <span className="font-mono text-slate-400">{result.parentPhoneMasked}</span>
            </div>
            <p className="text-[11px] text-slate-500">3.5초 후 초기 화면으로 자동 전환됩니다...</p>
          </div>
        )}
      </main>

      {/* ── 3. 하단 학원 안내 ── */}
      <footer className="w-full max-w-md text-center text-xs text-slate-500 border-t border-slate-800/80 pt-3.5 flex items-center justify-between">
        <span>InLevMath Smart Attendance</span>
        <span className="text-[11px] text-slate-600">비즈엠 카카오 알림톡 자동 연동</span>
      </footer>
    </div>
  );
};
