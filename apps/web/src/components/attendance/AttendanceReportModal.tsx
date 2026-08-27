'use client';

// apps/web/src/components/attendance/AttendanceReportModal.tsx
import React, { useState, useCallback, useEffect } from 'react';
import { X, Send, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { DailyReportEditor } from './DailyReportEditor';

type ReportScope = 'DAILY' | 'MONTHLY';

interface ReportRow {
  studentId: string;
  studentName: string;
  grade: string;
  parentPhone: string;
  statusLabel: string;
  detail: string;
  message: string;
  sendable: boolean;
}

interface SendResult {
  studentId: string;
  studentName: string;
  success: boolean;
  error?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** 모달을 연 시점의 기준 날짜 "YYYY-MM-DD" */
  date: string;
  year: number;
  month: number;
}

export const AttendanceReportModal: React.FC<Props> = ({ open, onClose, date, year, month }) => {
  const [scope, setScope] = useState<ReportScope>('DAILY');
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SendResult[] | null>(null);
  const [preview, setPreview] = useState<ReportRow | null>(null);

  const fetchRows = useCallback(
    async (nextScope: ReportScope) => {
      setLoading(true);
      setError(null);
      setResults(null);
      setPreview(null);
      try {
        const query =
          nextScope === 'DAILY'
            ? `scope=DAILY&date=${date}`
            : `scope=MONTHLY&year=${year}&month=${month}`;

        const res = await apiFetch(`/api/attendance/report?${query}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || '출결 리포트를 불러오지 못했습니다.');
        }

        const data = await res.json();
        const list: ReportRow[] = data.rows || [];
        setRows(list);
        setConfigured(data.configured !== false);
        setSelected(new Set(list.filter((r) => r.sendable).map((r) => r.studentId)));
        setPreview(list[0] || null);
      } catch (e) {
        setRows([]);
        setError(e instanceof Error ? e.message : '출결 리포트를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    },
    [date, year, month]
  );

  useEffect(() => {
    if (open) fetchRows(scope);
    // scope 변경은 handleScopeChange에서 직접 처리한다
  }, [open, fetchRows]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const handleScopeChange = (next: ReportScope) => {
    setScope(next);
    fetchRows(next);
  };

  const toggle = (studentId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const sendableRows = rows.filter((r) => r.sendable);
  const allSelected = sendableRows.length > 0 && sendableRows.every((r) => selected.has(r.studentId));

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(sendableRows.map((r) => r.studentId)));
  };

  const handleSend = async () => {
    if (selected.size === 0) {
      setError('발송할 학생을 선택하세요.');
      return;
    }

    setSending(true);
    setError(null);
    try {
      const res = await apiFetch('/api/attendance/report', {
        method: 'POST',
        body: JSON.stringify({
          scope,
          date,
          year,
          month,
          studentIds: [...selected],
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || '출결 알림톡 발송 실패');
      }

      setResults(data.results || []);
      setConfigured(data.configured !== false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '출결 알림톡 발송에 실패했습니다.');
    } finally {
      setSending(false);
    }
  };

  const sentCount = results?.filter((r) => r.success).length ?? 0;
  const periodLabel =
    scope === 'DAILY'
      ? `${Number(date.split('-')[1])}월 ${Number(date.split('-')[2])}일`
      : `${year}년 ${month}월`;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-900">학습리포트 발송</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {periodLabel} 수업·출결·학습 결과를 학부모에게 보냅니다.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 일별 / 월별 탭 */}
        <div className="px-6 pt-4 shrink-0">
          <div className="inline-flex bg-slate-100 p-1 rounded-xl gap-1">
            {(
              [
                { value: 'DAILY' as const, label: '일별 학습리포트' },
                { value: 'MONTHLY' as const, label: '월별 요약' },
              ]
            ).map((tab) => (
              <button
                key={tab.value}
                onClick={() => handleScopeChange(tab.value)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                  scope === tab.value ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
          {!configured && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-300 text-amber-900 p-3 rounded-xl text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <span>
                카카오 알림톡이 아직 연동되지 않아 <b>실제로 발송되지 않습니다.</b> 발송을 눌러도 학부모
                휴대폰에는 도착하지 않고 알림톡 화면에 <b>미발송(미연동)</b>으로만 기록됩니다.
              </span>
            </div>
          )}

          {error && (
            <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          {results && (
            <div
              className={`flex items-start gap-2.5 p-3 rounded-xl text-xs border ${
                sentCount > 0
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              {sentCount > 0 ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-bold">
                  {results.length}건 중 {sentCount}건 발송 성공 · {results.length - sentCount}건 미발송
                </p>
                {results.filter((r) => !r.success).length > 0 && (
                  <p className="mt-1 leading-relaxed">
                    미발송 사유: {results.find((r) => !r.success)?.error || '알 수 없음'}
                  </p>
                )}
              </div>
            </div>
          )}

          {loading ? (
            <p className="py-12 text-center text-xs text-slate-400">출결 리포트를 불러오는 중...</p>
          ) : rows.length === 0 ? (
            <p className="py-12 text-center text-xs text-slate-400">
              {periodLabel}에 발송할 출결 기록이 없습니다.
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              {/* 대상 목록 */}
              <div className="lg:col-span-3 border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="w-3.5 h-3.5 rounded-sm text-blue-600 focus:ring-blue-500"
                    />
                    전체 선택
                  </label>
                  <span className="text-[11px] font-bold text-slate-500">
                    {selected.size} / {rows.length}명 선택
                  </span>
                </div>

                <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {rows.map((row) => (
                    <div
                      key={row.studentId}
                      onClick={() => setPreview(row)}
                      className={`flex items-center gap-2 px-3 py-2.5 text-xs cursor-pointer transition ${
                        preview?.studentId === row.studentId ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(row.studentId)}
                        disabled={!row.sendable}
                        onChange={() => toggle(row.studentId)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-3.5 h-3.5 rounded-sm text-blue-600 focus:ring-blue-500 disabled:opacity-30"
                      />
                      <span className="font-bold text-slate-800 w-16 truncate">{row.studentName}</span>
                      <span className="text-slate-400 w-10 shrink-0">{row.grade}</span>
                      <span className="flex-1 text-slate-600 truncate">{row.detail}</span>
                      {!row.sendable && (
                        <span className="text-[10px] font-bold text-rose-500 shrink-0">연락처 없음</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 문구 미리보기 — 일별은 여기서 항목까지 손본다 */}
              <div className="lg:col-span-2 border border-slate-200 rounded-xl overflow-hidden flex flex-col">
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700">
                  {scope === 'DAILY' ? '학습리포트 편집' : '발송 문구 미리보기'}
                </div>
                <div className="p-3 flex-1 max-h-96 overflow-y-auto">
                  {!preview ? (
                    <p className="text-xs text-slate-400">왼쪽에서 학생을 선택하세요.</p>
                  ) : (
                    <>
                      <p className="text-[11px] text-slate-400 mb-2 font-mono">
                        {preview.studentName} · {preview.parentPhone || '연락처 없음'}
                      </p>
                      {scope === 'DAILY' ? (
                        <DailyReportEditor
                          key={`${preview.studentId}-${date}`}
                          studentId={preview.studentId}
                          studentName={preview.studentName}
                          date={date}
                          onChanged={() => fetchRows('DAILY')}
                        />
                      ) : (
                        <pre className="whitespace-pre-wrap text-xs text-slate-700 leading-relaxed font-sans bg-amber-50/60 border border-amber-100 rounded-lg p-3">
                          {preview.message}
                        </pre>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 하단 액션 */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
          <button
            onClick={() => fetchRows(scope)}
            disabled={loading || sending}
            className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition"
            >
              닫기
            </button>
            <button
              onClick={handleSend}
              disabled={sending || loading || selected.size === 0}
              className="px-5 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              {sending ? '발송 중...' : `${selected.size}명에게 발송`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
