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

export default function BackupPage() {
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

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
    </div>
  );
}
