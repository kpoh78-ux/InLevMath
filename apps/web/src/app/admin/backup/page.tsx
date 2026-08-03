'use client';

import React from 'react';

async function download(url: string) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('teacher_token') : null;
  const headers: HeadersInit = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = body?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  const blob = await res.blob();
  const urlObj = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = urlObj;
  const cd = res.headers.get('content-disposition');
  let fname = 'backup.dat';
  if (cd) {
    const m = cd.match(/filename="?(.*)"?/);
    if (m) fname = m[1];
  }
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(urlObj);
}

type StorageUsage = {
  driver: 'db' | 'supabase';
  totalCount: number;
  totalBytes: number;
  byStorage: { storage: string; count: number; bytes: number }[];
  counts: { worksheets: number; textbooks: number; textbookProblems: number };
};

const formatBytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
};

export default function BackupPage() {
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [usage, setUsage] = React.useState<StorageUsage | null>(null);

  React.useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('teacher_token') : null;
    fetch('/api/admin/storage', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => (r.ok ? r.json() : null))
      .then(setUsage)
      .catch(() => setUsage(null));
  }, []);

  const handle = async (url: string) => {
    setLoading(true);
    setMessage(null);
    try {
      await download(url);
      setMessage('백업이 완료되어 파일을 다운로드했습니다.');
    } catch (e: any) {
      setMessage(`오류: ${e?.message ?? '알 수 없는 오류'}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>백업 관리</h1>
      <div style={{ marginTop: 12 }}>
        <button
          onClick={() => handle('/api/backup/db')}
          style={{ marginRight: 8 }}
          className="btn"
          disabled={loading}
        >
          전체 DB 백업 다운로드
        </button>
        <button onClick={() => handle('/api/backup/core')} className="btn" disabled={loading}>
          주요 데이터(JSON) 다운로드
        </button>
      </div>
      {message && <p style={{ marginTop: 12 }}>{message}</p>}

      <h2 style={{ marginTop: 32, fontSize: 16 }}>정답 이미지 용량</h2>
      {!usage ? (
        <p style={{ color: '#888', fontSize: 13 }}>불러오는 중...</p>
      ) : (
        <div style={{ fontSize: 13, lineHeight: 1.9 }}>
          <p>
            저장 방식: <b>{usage.driver === 'supabase' ? 'Supabase Storage (오브젝트)' : 'DB 내부 (base64)'}</b>
            {usage.driver === 'db' && (
              <span style={{ color: '#b45309' }}>
                {' '}— 용량이 커지면 <code>ANSWER_IMAGE_STORAGE=supabase</code>로 전환하세요
              </span>
            )}
          </p>
          <p>정답 이미지 {usage.totalCount.toLocaleString()}장 · 합계 {formatBytes(usage.totalBytes)}</p>
          {usage.byStorage.map(b => (
            <p key={b.storage} style={{ color: '#666' }}>
              · {b.storage === 'db' ? 'DB 저장' : '오브젝트 스토리지'}: {b.count.toLocaleString()}장 / {formatBytes(b.bytes)}
            </p>
          ))}
          <p style={{ color: '#666' }}>
            학습지 {usage.counts.worksheets.toLocaleString()}개 ·
            교재 {usage.counts.textbooks.toLocaleString()}권 ·
            교재 문제 {usage.counts.textbookProblems.toLocaleString()}개
          </p>
        </div>
      )}
    </div>
  );
}
