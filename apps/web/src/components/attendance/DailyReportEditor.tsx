'use client';

// apps/web/src/components/attendance/DailyReportEditor.tsx
//
// 학생 1명의 그날 학습리포트를 손보는 칸.
//
// 여기서 끄고 켜는 것은 **그날 하루짜리 오버라이드**다. 상시 기본값은
// 알림톡 → 학습리포트 항목(선생님 프리셋)에서 바꾼다.
// 계층을 둘로 끊어 둔 이유: 학생별 상시 설정까지 만들면 어느 설정이 이겼는지
// 나중에 아무도 못 따라간다.

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, RefreshCw, RotateCcw, Save, Send } from 'lucide-react';
import { apiFetch } from '@/lib/api';

type Items = Record<string, boolean>;

interface Props {
  studentId: string;
  studentName: string;
  date: string;
  /** 저장·발송으로 문구가 바뀌면 목록을 다시 읽게 한다 */
  onChanged?: () => void;
}

const ITEM_LABEL: Record<string, string> = {
  includeAttendance: '출결·지각',
  includeHomework: '숙제',
  includeWorksheet: '오답 클리닉',
  includeUnitExam: '단원평가',
  includeGoalRate: '목표 완성률',
  includeAttitude: '수업 태도',
  includeComment: '코멘트',
};

const ORDER = Object.keys(ITEM_LABEL);

const SOURCE_LABEL: Record<string, string> = {
  default: '기본값',
  preset: '내 프리셋',
  override: '오늘만 변경됨',
};

export const DailyReportEditor: React.FC<Props> = ({ studentId, studentName, date, onChanged }) => {
  const [items, setItems] = useState<Items>({});
  const [attitude, setAttitude] = useState('');
  const [comment, setComment] = useState('');
  const [source, setSource] = useState<string>('default');
  const [editedBy, setEditedBy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const apply = useCallback((data: Record<string, unknown>) => {
    setItems((data.items as Items) || {});
    setAttitude((data.attitude as string) || '');
    setComment((data.comment as string) || '');
    setSource((data.source as string) || 'default');
    setEditedBy((data.editedBy as string) ?? null);
    setMessage((data.message as string) || '');
    setDirty(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNote(null);
    try {
      const res = await apiFetch(`/api/reports/daily/${studentId}?date=${date}`);
      if (!res.ok) throw new Error('리포트를 불러오지 못했습니다.');
      apply(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : '리포트를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [studentId, date, apply]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/reports/daily/${studentId}`, {
        method: 'PUT',
        body: JSON.stringify({ date, ...items, attitude, comment }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || '저장에 실패했습니다.');
      }
      apply(await res.json());
      setNote('오늘 하루만 적용되도록 저장했습니다.');
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/reports/daily/${studentId}?date=${date}`, { method: 'DELETE' });
      await load();
      setNote('내 프리셋으로 되돌렸습니다.');
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : '되돌리기에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const sendOne = async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await apiFetch(`/api/reports/daily/${studentId}`, {
        method: 'POST',
        body: JSON.stringify({ date }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.sent) {
        setNote(`${studentName} 학생 리포트를 발송했습니다.`);
      } else {
        // 발송되지 않은 것을 성공처럼 보여 주지 않는다
        const reason =
          data?.skipped === 'NO_PARENT_PHONE' ? '학부모 연락처가 없습니다.'
          : data?.skipped === 'NO_DATA' ? '보낼 학습 기록이 없습니다.'
          : data?.error || '알림톡이 연동되지 않아 실제로 발송되지 않았습니다.';
        setError(`미발송 — ${reason}`);
      }
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : '발송에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (key: string) => {
    setItems((prev) => ({ ...prev, [key]: !prev[key] }));
    setDirty(true);
    setNote(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-400">
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        불러오는 중...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-slate-700">담을 항목</p>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            source === 'override' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {SOURCE_LABEL[source] ?? source}
          {source === 'override' && editedBy ? ` · ${editedBy}` : ''}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {ORDER.map((key) => {
          const on = Boolean(items[key]);
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${
                on
                  ? 'bg-blue-500 border-blue-500 text-white'
                  : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
              }`}
            >
              {ITEM_LABEL[key]}
            </button>
          );
        })}
      </div>

      {/* 데이터로 뽑을 수 없는 두 항목은 직접 적는다 */}
      {items.includeAttitude && (
        <div>
          <label className="block text-[11px] font-bold text-slate-600 mb-1">수업 태도</label>
          <input
            type="text"
            value={attitude}
            onChange={(e) => {
              setAttitude(e.target.value);
              setDirty(true);
            }}
            placeholder="예) 집중해서 끝까지 풀었습니다"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      )}

      {items.includeComment && (
        <div>
          <label className="block text-[11px] font-bold text-slate-600 mb-1">선생님 코멘트</label>
          <textarea
            value={comment}
            onChange={(e) => {
              setComment(e.target.value);
              setDirty(true);
            }}
            rows={2}
            placeholder="학부모에게 남길 말"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
          {error}
        </p>
      )}
      {note && !error && (
        <p className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-2">
          {note}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={save}
          disabled={busy || !dirty}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-[11px] font-bold hover:bg-slate-900 disabled:opacity-40 transition whitespace-nowrap"
        >
          <Save className="w-3.5 h-3.5" />
          오늘만 저장
        </button>
        {source === 'override' && (
          <button
            onClick={reset}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[11px] font-bold hover:bg-slate-50 disabled:opacity-40 transition whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            프리셋으로
          </button>
        )}
        <button
          onClick={sendOne}
          disabled={busy || dirty}
          title={dirty ? '먼저 저장하세요' : undefined}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 text-blue-600 text-[11px] font-bold hover:bg-blue-50 disabled:opacity-40 transition whitespace-nowrap"
        >
          <Send className="w-3.5 h-3.5" />
          이 학생만 발송
        </button>
      </div>

      {message && (
        <pre className="whitespace-pre-wrap text-[11px] text-slate-700 leading-relaxed font-sans bg-amber-50/60 border border-amber-100 rounded-lg p-3">
          {message}
        </pre>
      )}
    </div>
  );
};

export default DailyReportEditor;
