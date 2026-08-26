'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Bell, MessageSquare, Send, CheckCircle2, XCircle, Clock, ShieldCheck, 
  RefreshCw, Filter, Download, Sparkles, AlertCircle 
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface SendLog {
  id: string;
  studentName: string;
  parentPhone: string;
  sendChannel: 'ALIMTALK' | 'SMS' | 'LMS';
  messageType: string;
  templateCode?: string;
  messageTitle?: string;
  sentMessageText?: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  sentAt: string;
  responseCode?: string;
  responseMessage?: string;
}

/** 인증정보/템플릿/발신번호 미설정으로 애초에 발송 시도조차 못 한 상태 */
const NOT_SENT_CODES = ['NOT_CONFIGURED', 'NO_TEMPLATE', 'NO_SENDER_PHONE'];

function isNotSent(log: SendLog): boolean {
  return log.status !== 'SUCCESS' && NOT_SENT_CODES.includes(log.responseCode || '');
}

export default function AlimtalkPage() {
  const [logs, setLogs] = useState<SendLog[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'logs' | 'templates' | 'test'>('logs');
  const [filterChannel, setFilterChannel] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [selectedLog, setSelectedLog] = useState<SendLog | null>(null);

  // 테스트 발송 상태
  const [testPhone, setTestPhone] = useState('');
  const [testStudent, setTestStudent] = useState('홍길동');
  const [testType, setTestType] = useState<'CHECK_IN' | 'CHECK_OUT' | 'REPORT'>('CHECK_IN');
  const [testSending, setTestSending] = useState(false);
  const [testSuccess, setTestSuccess] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      // 발송 내역 조회
      const res = await apiFetch('/api/alimtalk/logs');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setConfigured(data.configured !== false);
      } else {
        // 조회 실패 시 가짜 성공 로그를 만들어내지 않는다 (실제 발송 현황을 오해하게 만듦)
        setLogs([]);
      }
    } catch {
      //
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // 발송 통계 계산
  const sentLogs = logs.filter((l) => l.status === 'SUCCESS');
  const alimtalkCount = logs.filter((l) => l.sendChannel === 'ALIMTALK').length;
  const smsCount = logs.filter((l) => l.sendChannel === 'SMS').length;
  const lmsCount = logs.filter((l) => l.sendChannel === 'LMS').length;
  const successCount = sentLogs.length;
  const notSentCount = logs.filter(isNotSent).length;
  const successRate = logs.length > 0 ? Math.round((successCount / logs.length) * 100) : null;

  // 발송 비용 계산 (카카오 알림톡 6.5원 / 단문 SMS 11원 / 장문 LMS 33원)
  // 실제로 발송된 건만 과금된다. 미발송·실패 건은 비용이 발생하지 않는다.
  const totalCost =
    sentLogs.filter((l) => l.sendChannel === 'ALIMTALK').length * 6.5 +
    sentLogs.filter((l) => l.sendChannel === 'SMS').length * 11 +
    sentLogs.filter((l) => l.sendChannel === 'LMS').length * 33;

  const filteredLogs = logs.filter((l) => {
    if (filterChannel !== 'ALL' && l.sendChannel !== filterChannel) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        l.studentName.toLowerCase().includes(q) ||
        l.parentPhone.includes(q) ||
        (l.sentMessageText && l.sentMessageText.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone.trim()) {
      alert('휴대폰 번호를 입력하세요.');
      return;
    }
    setTestSending(true);
    setTestSuccess(null);
    try {
      const isCheckIn = testType === 'CHECK_IN';
      const msg = isCheckIn
        ? `[InLevMath 출결안내]\n${testStudent} 학생이 오늘 ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}에 안전하게 등원(출석)하였습니다.`
        : `[InLevMath 출결안내]\n${testStudent} 학생이 오늘 ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}에 모든 학습을 마치고 하원(퇴원)하였습니다.`;

      const res = await apiFetch('/api/alimtalk/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentPhone: testPhone,
          studentName: testStudent,
          message: msg,
          channel: 'ALIMTALK',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setTestSuccess(`✅ 테스트 메시지가 성공적으로 발송되었습니다. (${data.messageType})`);
      } else {
        setConfigured(data.configured !== false);
        setTestSuccess(
          `❌ 발송되지 않았습니다. ${data.error || '발송 실패'}${data.errorCode ? ` (${data.errorCode})` : ''}`
        );
      }
      fetchLogs();
    } catch {
      alert('발송 중 통신 오류가 발생했습니다.');
    } finally {
      setTestSending(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ── 1. 알림톡 상단 헤더 & 바로가기 ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-3xl text-white shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-400/20 border border-amber-400/30 flex items-center justify-center text-amber-300 shadow-lg">
            <Bell className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">카카오 알림톡 & 문자 발송 센터</h1>
              <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 shadow-xs">
                NEW 메인
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              등·하원 즉시 알림, 일별·월별 출결 리포트, 일일 학습 리포트를 학부모에게 발송합니다
            </p>
          </div>
        </div>

      </div>

      {/* ── 1-1. 카카오 미연동 경고 ── */}
      {!configured && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 text-amber-900 p-4 rounded-2xl">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
          <div className="text-xs leading-relaxed">
            <p className="font-black text-sm mb-1">카카오 알림톡이 아직 연동되지 않았습니다 — 메시지가 실제로 발송되지 않습니다.</p>
            <p>
              발송을 시도해도 학부모 휴대폰에는 도착하지 않고 아래 내역에 <b>미발송(미연동)</b>으로만 기록됩니다.
              실제 발송을 하려면 비즈엠 계약 → 카카오 채널 발신프로필 등록 → 알림톡 템플릿 심사 승인 →
              발신번호 사전등록을 마친 뒤, <code className="px-1 py-0.5 bg-amber-100 rounded font-mono">apps/web/.env</code>에
              <code className="px-1 py-0.5 bg-amber-100 rounded font-mono ml-1">KAKAO_BIZ_USER_ID</code>,
              <code className="px-1 py-0.5 bg-amber-100 rounded font-mono ml-1">KAKAO_SENDER_KEY</code>,
              <code className="px-1 py-0.5 bg-amber-100 rounded font-mono ml-1">KAKAO_ALIMTALK_TEMPLATE_ID</code>,
              <code className="px-1 py-0.5 bg-amber-100 rounded font-mono ml-1">KAKAO_SENDER_PHONE</code>을 설정하세요.
            </p>
          </div>
        </div>
      )}

      {/* ── 2. 통계 지표 카드 ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-bold">카카오 알림톡</span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
              6.5원/건
            </span>
          </div>
          <p className="text-2xl font-black text-slate-900">
            {alimtalkCount} <span className="text-sm font-bold text-gray-400">건</span>
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            성공률 {successRate === null ? '—' : `${successRate}%`}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-bold">문자(SMS/LMS) 대체</span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
              11~33원/건
            </span>
          </div>
          <p className="text-2xl font-black text-slate-900">
            {smsCount + lmsCount} <span className="text-sm font-bold text-gray-400">건</span>
          </p>
          <p className="text-[11px] text-gray-400 mt-1">알림톡 실패 시 자동 전환</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-bold">전체 발송 성공률</span>
            {successCount > 0 ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-500" />
            )}
          </div>
          <p className={`text-2xl font-black ${successCount > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
            {successRate === null ? '—' : `${successRate}%`}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            총 {logs.length}건 시도 · 성공 {successCount}건
            {notSentCount > 0 ? ` · 미발송 ${notSentCount}건` : ''}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-bold">당월 총 발송 예상액</span>
            <Sparkles className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-2xl font-black text-indigo-600">
            {Math.round(totalCost).toLocaleString()} <span className="text-sm font-bold text-gray-400">원</span>
          </p>
          <p className="text-[11px] text-gray-400 mt-1">실제 발송 성공분만 집계</p>
        </div>
      </div>

      {/* ── 3. 탭 네비게이션 ── */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="flex border-b border-gray-100 px-6 pt-3 gap-3 bg-gray-50/50">
          <button
            onClick={() => setActiveTab('logs')}
            className={`pb-3 px-3 text-xs font-bold transition border-b-2 flex items-center gap-2 ${
              activeTab === 'logs'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>실시간 발송 내역 로그</span>
            <span className="text-[10px] bg-gray-200 text-gray-700 font-bold px-2 py-0.5 rounded-full">
              {logs.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('templates')}
            className={`pb-3 px-3 text-xs font-bold transition border-b-2 flex items-center gap-2 ${
              activeTab === 'templates'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>카카오 알림톡 템플릿 관리</span>
          </button>

          <button
            onClick={() => setActiveTab('test')}
            className={`pb-3 px-3 text-xs font-bold transition border-b-2 flex items-center gap-2 ${
              activeTab === 'test'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>즉시 테스트 발송</span>
          </button>
        </div>

        {/* ── 4. 탭별 컨텐츠 ── */}
        <div className="p-6">
          {/* TAB 1: 발송 내역 */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="flex bg-gray-100 p-1 rounded-xl text-xs font-bold text-gray-600">
                    {['ALL', 'ALIMTALK', 'SMS', 'LMS'].map((ch) => (
                      <button
                        key={ch}
                        onClick={() => setFilterChannel(ch)}
                        className={`px-3 py-1.5 rounded-lg transition ${
                          filterChannel === ch ? 'bg-white text-indigo-600 shadow-xs' : 'hover:text-gray-900'
                        }`}
                      >
                        {ch === 'ALL' ? '전체' : ch}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={fetchLogs}
                    className="p-2 text-gray-400 hover:text-indigo-600 rounded-xl hover:bg-gray-100 transition"
                    title="새로고침"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                <div className="w-full sm:w-64">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="학생명 / 전화번호 검색"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* 테이블 */}
              <div className="overflow-x-auto border border-gray-100 rounded-2xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
                    <tr>
                      <th className="py-3 px-4 font-bold">발송 일시</th>
                      <th className="py-3 px-4 font-bold">학생명</th>
                      <th className="py-3 px-4 font-bold">수신 번호</th>
                      <th className="py-3 px-4 font-bold">채널</th>
                      <th className="py-3 px-4 font-bold">제목 / 내용 미리보기</th>
                      <th className="py-3 px-4 font-bold">상태</th>
                      <th className="py-3 px-4 font-bold text-right">상세</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredLogs.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-10 text-gray-400">
                          발송 내역이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      filteredLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-indigo-50/40 transition">
                          <td className="py-3.5 px-4 font-mono text-gray-500">
                            {new Date(log.sentAt).toLocaleString('ko-KR', {
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-gray-900">{log.studentName || '-'}</td>
                          <td className="py-3.5 px-4 font-mono text-gray-600">{log.parentPhone}</td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                log.sendChannel === 'ALIMTALK'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {log.sendChannel}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 max-w-xs truncate text-gray-600">
                            {log.sentMessageText || log.messageTitle || '-'}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center gap-1 font-bold text-[11px] ${
                                log.status === 'SUCCESS'
                                  ? 'text-emerald-600'
                                  : isNotSent(log)
                                    ? 'text-amber-600'
                                    : 'text-rose-600'
                              }`}
                              title={log.responseMessage || ''}
                            >
                              {log.status === 'SUCCESS' ? (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              ) : isNotSent(log) ? (
                                <AlertCircle className="w-3.5 h-3.5" />
                              ) : (
                                <XCircle className="w-3.5 h-3.5" />
                              )}
                              {log.status === 'SUCCESS' ? '발송완료' : isNotSent(log) ? '미발송(미연동)' : '실패'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => setSelectedLog(log)}
                              className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] transition"
                            >
                              전문 보기
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: 템플릿 관리 */}
          {activeTab === 'templates' && (
            <div className="grid md:grid-cols-3 gap-6">
              {/* 등원 템플릿 */}
              <div className="bg-slate-900 text-white rounded-3xl p-6 border border-slate-800 shadow-xl space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      키오스크 1차 연동
                    </span>
                    <span className="text-xs font-mono text-slate-400">TEMPLATE_CHECKIN_01</span>
                  </div>
                  <h3 className="text-base font-black text-white">등원 확인 알림톡</h3>
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/80 text-xs text-slate-300 leading-relaxed font-sans whitespace-pre-line">
                    {`[InLevMath 출결안내]
#{학생이름} 학생이 오늘 #{등원시각}에 안전하게 등원(출석)하였습니다.

오늘도 즐겁고 유익한 수학 학습이 진행될 수 있도록 최선을 다해 지도하겠습니다.`}
                  </div>
                </div>
                <div className="pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                  <span>변수: #{'{학생이름}'}, #{'{등원시각}'}</span>
                  <span className="text-amber-400 font-bold">카카오 승인완료</span>
                </div>
              </div>

              {/* 하원 템플릿 */}
              <div className="bg-slate-900 text-white rounded-3xl p-6 border border-slate-800 shadow-xl space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      키오스크 2차 연동
                    </span>
                    <span className="text-xs font-mono text-slate-400">TEMPLATE_CHECKOUT_01</span>
                  </div>
                  <h3 className="text-base font-black text-white">하원 완료 알림톡</h3>
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/80 text-xs text-slate-300 leading-relaxed font-sans whitespace-pre-line">
                    {`[InLevMath 출결안내]
#{학생이름} 학생이 오늘 #{하원시각}에 모든 수업 및 학습을 마치고 안전하게 하원(퇴원)하였습니다.

오늘 하루도 수고 많았습니다!`}
                  </div>
                </div>
                <div className="pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                  <span>변수: #{'{학생이름}'}, #{'{하원시각}'}</span>
                  <span className="text-amber-400 font-bold">카카오 승인완료</span>
                </div>
              </div>

              {/* 일일 리포트 템플릿 */}
              <div className="bg-slate-900 text-white rounded-3xl p-6 border border-slate-800 shadow-xl space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      일일 학습 리포트
                    </span>
                    <span className="text-xs font-mono text-slate-400">TEMPLATE_DAILY_REPORT</span>
                  </div>
                  <h3 className="text-base font-black text-white">일일 수학 학습 리포트</h3>
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/80 text-xs text-slate-300 leading-relaxed font-sans whitespace-pre-line">
                    {`[InLevMath 일일 학습 리포트]
#{학생이름} 학생의 #{날짜} 수학 학습 결과입니다.

• 출결: 정시 출석
• 숙제 완성도: #{숙제}%
• 교재/학습지 정답률: #{정답률}%
• 종합 성취율: #{성취율}%`}
                  </div>
                </div>
                <div className="pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                  <span>교사 코멘트 옵션 포함</span>
                  <span className="text-amber-400 font-bold">카카오 승인완료</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: 즉시 테스트 발송 */}
          {activeTab === 'test' && (
            <div className="max-w-xl mx-auto bg-gray-50 border border-gray-200 rounded-3xl p-6 space-y-5">
              <div>
                <h3 className="text-base font-bold text-gray-900">알림톡 테스트 발송</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  입력한 휴대폰 번호로 카카오 알림톡/문자 메시지를 즉시 발송하여 수신 상태를 테스트합니다.
                </p>
              </div>

              {testSuccess && (
                <div
                  className={`border text-xs p-3.5 rounded-2xl font-semibold ${
                    testSuccess.startsWith('✅')
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {testSuccess}
                </div>
              )}

              <form onSubmit={handleSendTest} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">테스트 수신 번호</label>
                  <input
                    type="tel"
                    required
                    maxLength={11}
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="01012345678"
                    className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">학생 이름</label>
                    <input
                      type="text"
                      value={testStudent}
                      onChange={(e) => setTestStudent(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">메시지 유형</label>
                    <select
                      value={testType}
                      onChange={(e) => setTestType(e.target.value as any)}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none font-bold"
                    >
                      <option value="CHECK_IN">등원 안내 알림톡</option>
                      <option value="CHECK_OUT">하원 안내 알림톡</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={testSending}
                  className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-600/30 transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>{testSending ? '발송 중...' : '지금 테스트 알림톡 발송하기'}</span>
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* ── 5. 메시지 전문 보기 모달 ── */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-gray-100 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="font-black text-gray-900 text-base">발송 메시지 상세 전문</h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-400">수신 학생/학부모</span>
                <span className="font-bold text-gray-800">
                  {selectedLog.studentName} ({selectedLog.parentPhone})
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-400">발송 채널 / 결과</span>
                <span className="font-bold text-indigo-600">{selectedLog.sendChannel} / {selectedLog.status}</span>
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-xs font-mono whitespace-pre-line text-gray-800 leading-relaxed">
              {selectedLog.sentMessageText || selectedLog.messageTitle}
            </div>

            <button
              onClick={() => setSelectedLog(null)}
              className="w-full py-2.5 rounded-xl bg-gray-900 text-white font-bold text-xs hover:bg-gray-800 transition"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
