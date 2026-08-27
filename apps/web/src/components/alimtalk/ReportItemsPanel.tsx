'use client';

// apps/web/src/components/alimtalk/ReportItemsPanel.tsx
//
// 하원 학습리포트에 무엇을 담을지 — 선생님별 프리셋 설정.
// 여기서 정한 값이 매일의 기본값이 되고, 그날 하루만 다르게 하고 싶으면
// 출결 → 학습리포트 모달에서 학생별로 바꾼다 (당일 오버라이드).

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, RefreshCw, Save } from 'lucide-react';
import { apiFetch } from '@/lib/api';

type Items = Record<string, boolean>;
type Meta = Record<string, { label: string; hint: string }>;

export const ReportItemsPanel: React.FC = () => {
  const [items, setItems] = useState<Items>({});
  const [order, setOrder] = useState<string[]>([]);
  const [meta, setMeta] = useState<Meta>({});
  const [autoSend, setAutoSend] = useState(false);
  const [saved, setSaved] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/reports/config');
      if (!res.ok) throw new Error('리포트 항목 설정을 불러오지 못했습니다.');
      const data = await res.json();
      setItems(data.items || {});
      setOrder(data.order || []);
      setMeta(data.meta || {});
      setAutoSend(Boolean(data.autoSendOnCheckOut));
      setSaved(Boolean(data.saved));
      setConfigured(data.alimtalkConfigured !== false);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '설정을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (key: string) => {
    setItems((prev) => ({ ...prev, [key]: !prev[key] }));
    setDirty(true);
    setDone(false);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch('/api/reports/config', {
        method: 'PUT',
        body: JSON.stringify({ ...items, autoSendOnCheckOut: autoSend }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || '저장에 실패했습니다.');
      }
      const data = await res.json();
      setItems(data.items || items);
      setAutoSend(Boolean(data.autoSendOnCheckOut));
      setSaved(true);
      setDirty(false);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const onCount = order.filter((k) => items[k]).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-400">
        <RefreshCw className="w-4 h-4 animate-spin" />
        불러오는 중...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900">하원 학습리포트 항목</h3>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            학생이 하원할 때 학부모에게 보낼 내용입니다. {onCount}개 켜짐
            {!saved && <span className="text-amber-600"> · 아직 저장한 적 없음(기본값)</span>}
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="flex items-center gap-2 bg-indigo-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition whitespace-nowrap"
        >
          <Save className="w-4 h-4" />
          {saving ? '저장 중...' : dirty ? '변경사항 저장' : '저장됨'}
        </button>
      </div>

      {!configured && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-relaxed">
            카카오 알림톡이 아직 연동되지 않아 <strong>실제로 발송되지 않습니다.</strong>
            설정은 저장되고, 발송 시도는 내역에 &ldquo;미발송(미연동)&rdquo;으로 남습니다.
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <p className="text-xs text-rose-700">{error}</p>
        </div>
      )}

      {done && !dirty && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-xs text-emerald-800">저장했습니다. 다음 하원부터 적용됩니다.</p>
        </div>
      )}

      {/* 항목 체크박스 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {order.map((key) => {
          const on = Boolean(items[key]);
          const info = meta[key];
          if (!info) return null;
          return (
            <label
              key={key}
              className={`flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer transition ${
                on ? 'border-indigo-300 bg-indigo-50/60' : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(key)}
                className="w-5 h-5 mt-0.5 accent-indigo-600 shrink-0"
              />
              <span className="min-w-0">
                <span className={`block text-sm font-bold ${on ? 'text-indigo-900' : 'text-gray-700'}`}>
                  {info.label}
                </span>
                <span className="block text-[11px] text-gray-500 mt-0.5 leading-relaxed">{info.hint}</span>
              </span>
            </label>
          );
        })}
      </div>

      {/* 자동 발송 */}
      <div
        className={`rounded-xl border px-4 py-4 transition ${
          autoSend ? 'border-emerald-300 bg-emerald-50/60' : 'border-gray-200 bg-white'
        }`}
      >
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={autoSend}
            onChange={() => {
              setAutoSend((v) => !v);
              setDirty(true);
              setDone(false);
            }}
            className="w-5 h-5 mt-0.5 accent-emerald-600 shrink-0"
          />
          <span className="min-w-0">
            <span className="block text-sm font-bold text-gray-900">하원 처리 시 자동 발송</span>
            <span className="block text-[11px] text-gray-500 mt-1 leading-relaxed">
              켜면 학생이 하원할 때 위 항목으로 학습리포트가 자동으로 나갑니다.
              같은 날 같은 학생에게 두 번 보내지 않습니다.
              <br />
              끄면 발송되지 않고, 출결 화면에서 직접 보낼 때만 나갑니다.
            </span>
          </span>
        </label>
      </div>

      <p className="text-[11px] text-gray-400 leading-relaxed">
        여기 설정은 <strong>{'('}로그인한 선생님 본인{')'}</strong>의 기본값입니다.
        특정 학생의 하루만 다르게 하려면 출결 화면의 학습리포트에서 그 학생 항목을 바꾸세요 (그날 하루만 적용).
      </p>
    </div>
  );
};

export default ReportItemsPanel;
