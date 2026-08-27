'use client'

// apps/web/src/app/dashboard/manage/backup/page.tsx
//
// DB 백업 다운로드 + 정답 이미지 저장용량.
// 원래 /admin/backup 이라는 별도 상단바에 있었는데, 관리 항목 하나 때문에
// 내비게이션이 2층이 되어 학원관리 안으로 들여왔다. (/admin/backup 은 여기로 리다이렉트)

import { useCallback, useEffect, useState } from 'react'
import { apiFetch, getToken } from '@/lib/api'
import { useMe } from '@/lib/useMe'

type StorageUsage = {
  driver: 'db' | 'supabase'
  totalCount: number
  totalBytes: number
  byStorage: { storage: string; count: number; bytes: number }[]
  counts: { worksheets: number; textbooks: number; textbookProblems: number }
}

const formatBytes = (n: number) => {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

/** 백업 파일을 받아 브라우저에 내려준다 */
async function download(url: string): Promise<{ savedPath: string | null; mode: string | null; reason: string | null }> {
  const token = getToken()
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    // detail에 실제 원인(설치 안내, pg_dump stderr 등)이 담겨 있다
    const msg = [body?.error, body?.detail].filter(Boolean).join('\n') || `Request failed (${res.status})`
    throw new Error(msg)
  }

  const rawPath = res.headers.get('X-Backup-Path')
  const savedPath = rawPath ? decodeURIComponent(rawPath) : null
  const mode = res.headers.get('X-Backup-Mode')
  const rawReason = res.headers.get('X-Backup-Reason')
  const reason = rawReason ? decodeURIComponent(rawReason) : null

  const blob = await res.blob()
  const urlObj = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = urlObj

  const cd = res.headers.get('content-disposition')
  let fname = 'backup.dat'
  if (cd) {
    const m = cd.match(/filename="?(.*)"?/)
    if (m) fname = m[1]
  }
  a.download = fname
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(urlObj)

  return { savedPath, mode, reason }
}

export default function BackupPage() {
  const { isAdmin, loading: loadingMe } = useMe()

  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [usage, setUsage] = useState<StorageUsage | null>(null)
  const [usageLoading, setUsageLoading] = useState(true)
  // 서버가 관리자가 아니라고 답하면 화면을 잠근다 (useMe 캐시가 어긋나는 경우 대비)
  const [denied, setDenied] = useState(false)

  const fetchUsage = useCallback(async () => {
    setUsageLoading(true)
    try {
      const res = await apiFetch('/api/admin/storage')
      if (res.status === 401 || res.status === 403) { setDenied(true); return }
      if (res.ok) setUsage(await res.json())
    } catch {
      setUsage(null)
    } finally {
      setUsageLoading(false)
    }
  }, [])

  useEffect(() => { if (isAdmin) fetchUsage() }, [isAdmin, fetchUsage])

  const handle = async (url: string, key: string) => {
    setBusy(key)
    setMessage(null)
    try {
      const { savedPath, mode, reason } = await download(url)
      setMessage({
        ok: true,
        text: [
          '백업이 완료되어 파일을 다운로드했습니다.',
          mode === 'json' ? `방식: JSON 전체 백업 — ${reason ?? ''}`.trim() : null,
          mode === 'pg_dump' ? '방식: pg_dump 전체 덤프' : null,
          savedPath ? `서버 보관본: ${savedPath}` : null,
        ].filter(Boolean).join('\n'),
      })
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : '알 수 없는 오류' })
    } finally {
      setBusy(null)
    }
  }

  if (loadingMe) {
    return <div className="py-20 text-center text-gray-400 text-sm">불러오는 중...</div>
  }

  if (!isAdmin || denied) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl px-6 py-16 text-center">
        <p className="text-3xl mb-3">🔒</p>
        <p className="text-sm font-semibold text-gray-700">관리자만 사용할 수 있는 화면입니다.</p>
        <p className="text-xs text-gray-400 mt-1.5">
          백업 다운로드는 관리자 계정으로 로그인해야 합니다.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">백업 · 저장용량</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          학원 데이터를 내려받아 보관하고, 정답 이미지가 차지하는 용량을 확인합니다.
        </p>
      </div>

      {/* 백업 다운로드 */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-bold text-gray-800">데이터 백업</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => handle('/api/backup/db', 'db')}
            disabled={busy !== null}
            className="text-left border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40 rounded-xl px-4 py-3.5 transition-colors disabled:opacity-50">
            <p className="text-sm font-semibold text-gray-900">
              {busy === 'db' ? '백업 중...' : '전체 DB 백업 다운로드'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              모든 테이블을 통째로 받습니다. 정답 스냅샷 이미지까지 포함되므로
              가장 완전한 백업입니다. pg_dump이 없는 서버에서는 JSON으로 받습니다.
            </p>
          </button>

          <button
            onClick={() => handle('/api/backup/core', 'core')}
            disabled={busy !== null}
            className="text-left border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40 rounded-xl px-4 py-3.5 transition-colors disabled:opacity-50">
            <p className="text-sm font-semibold text-gray-900">
              {busy === 'core' ? '내보내는 중...' : '주요 데이터(JSON) 다운로드'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              학생·학습지·교재 등 핵심만 JSON으로. 내용 확인은 쉽지만
              <b> 정답 이미지는 빠집니다.</b> 보관용으로는 왼쪽을 쓰세요.
            </p>
          </button>
        </div>

        {message && (
          <pre className={`whitespace-pre-wrap break-words font-sans text-xs leading-relaxed rounded-lg px-3 py-2.5 border ${
            message.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            {message.ok ? message.text : `오류: ${message.text}`}
          </pre>
        )}
      </div>

      {/* 정답 이미지 용량 */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">정답 이미지 용량</h2>
          <button
            onClick={fetchUsage}
            disabled={usageLoading}
            className="text-xs text-gray-400 hover:text-indigo-600 border border-gray-200 hover:border-indigo-300 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50">
            새로고침
          </button>
        </div>

        {usageLoading ? (
          <p className="text-sm text-gray-400">불러오는 중...</p>
        ) : !usage ? (
          <p className="text-sm text-gray-400">용량 정보를 불러오지 못했습니다.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: '정답 이미지', value: `${usage.totalCount.toLocaleString()}장`, color: 'text-indigo-600' },
                { label: '합계 용량', value: formatBytes(usage.totalBytes), color: 'text-teal-600' },
                { label: '학습지', value: `${usage.counts.worksheets.toLocaleString()}개`, color: 'text-gray-700' },
                { label: '교재', value: `${usage.counts.textbooks.toLocaleString()}권`, color: 'text-gray-700' },
              ].map(item => (
                <div key={item.label} className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-center">
                  <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{item.label}</p>
                </div>
              ))}
            </div>

            <div className="text-xs text-gray-600 space-y-1.5">
              <p>
                저장 방식{' '}
                <span className="font-semibold text-gray-900">
                  {usage.driver === 'supabase' ? 'Supabase Storage (오브젝트)' : 'DB 내부 (base64)'}
                </span>
              </p>
              {usage.byStorage.map(b => (
                <p key={b.storage} className="text-gray-500">
                  · {b.storage === 'db' ? 'DB 저장' : '오브젝트 스토리지'}
                  : {b.count.toLocaleString()}장 / {formatBytes(b.bytes)}
                </p>
              ))}
              <p className="text-gray-500">
                교재 문제 {usage.counts.textbookProblems.toLocaleString()}개
              </p>
            </div>

            {usage.driver === 'db' && (
              <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2.5 leading-relaxed">
                정답 이미지가 DB 안에 base64로 들어 있습니다. 용량이 커지면{' '}
                <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">ANSWER_IMAGE_STORAGE=supabase</code>
                로 전환하세요. 기존 저장분은 그대로 보입니다.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
