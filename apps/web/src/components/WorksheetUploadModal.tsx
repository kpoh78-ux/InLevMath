'use client'

// 학습지 업로드 — 1단계: PC 폴더 연결 + 파일 선택
//
// 원본 파일은 DB에 넣지 않는다. 선생님 PC 폴더를 한 번 연결해 두고
// 파일명만 기억했다가 인쇄·AI 정답 추출에 쓴다. (자세한 배경은 lib/worksheetFiles.ts)

import { useState, useEffect, useCallback } from 'react'
import {
  supportsFolderAccess, pickWorksheetFolder, getSavedFolder, requestSavedFolder,
  forgetWorksheetFolder, listWorksheetFiles, formatSize,
  type WorksheetFile,
} from '@/lib/worksheetFiles'

export function WorksheetUploadModal({
  onClose, onPick,
}: {
  onClose: () => void
  /** 파일을 고르면 다음 단계(정답 추출)로 넘긴다 */
  onPick: (file: WorksheetFile) => void
}) {
  const [folder, setFolder] = useState<FileSystemDirectoryHandle | null>(null)
  const [files, setFiles] = useState<WorksheetFile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [needsPermission, setNeedsPermission] = useState(false)

  const supported = supportsFolderAccess()

  const loadFiles = useCallback(async (dir: FileSystemDirectoryHandle) => {
    setLoading(true); setError('')
    try {
      setFiles(await listWorksheetFiles(dir))
    } catch (e) {
      setError(e instanceof Error ? e.message : '파일 목록을 읽지 못했습니다.')
    } finally { setLoading(false) }
  }, [])

  // 이전에 연결한 폴더가 있으면 바로 이어서 쓴다
  useEffect(() => {
    if (!supported) return
    getSavedFolder().then(dir => {
      if (dir) { setFolder(dir); loadFiles(dir) }
      else setNeedsPermission(true)
    })
  }, [supported, loadFiles])

  const connect = async () => {
    setError('')
    try {
      const dir = await pickWorksheetFolder()
      if (!dir) return
      setFolder(dir); setNeedsPermission(false)
      await loadFiles(dir)
    } catch (e) {
      setError(e instanceof Error ? e.message : '폴더를 연결하지 못했습니다.')
    }
  }

  const reconnect = async () => {
    setError('')
    const dir = await requestSavedFolder()
    if (dir) { setFolder(dir); setNeedsPermission(false); await loadFiles(dir) }
    else await connect()
  }

  const disconnect = async () => {
    await forgetWorksheetFolder()
    setFolder(null); setFiles([]); setNeedsPermission(false)
  }

  const shown = files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '88vh' }}>
        <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">학습지 업로드</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              PC의 학습지 폴더를 연결하고 파일을 고르세요
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4">×</button>
        </div>

        {!supported ? (
          <div className="p-8 text-center">
            <p className="text-3xl mb-3">🖥️</p>
            <p className="text-sm font-semibold text-gray-700">Chrome에서만 사용할 수 있습니다.</p>
            <p className="text-xs text-gray-400 mt-1.5">
              폴더 연결 기능(File System Access API)은 Chrome 계열 브라우저만 지원합니다.
            </p>
          </div>
        ) : (
          <>
            {/* 폴더 상태 */}
            <div className="px-6 pt-4">
              {folder ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 flex items-center gap-3">
                  <span className="text-sm text-emerald-800 truncate">
                    연결된 폴더: <strong>{folder.name}</strong>
                    <span className="ml-2 text-emerald-600 text-xs">학습지 {files.length}개</span>
                  </span>
                  <div className="ml-auto flex gap-2 shrink-0">
                    <button onClick={connect}
                      className="text-xs font-semibold text-emerald-700 border border-emerald-200 bg-white hover:border-emerald-400 px-2.5 py-1 rounded transition-colors whitespace-nowrap">
                      폴더 변경
                    </button>
                    <button onClick={disconnect}
                      className="text-xs text-gray-500 hover:text-rose-600 px-2 py-1 whitespace-nowrap">
                      연결 해제
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-4 text-center">
                  <p className="text-sm text-gray-600 mb-3">
                    {needsPermission
                      ? '이전에 연결한 폴더가 있습니다. 권한을 다시 허용해주세요.'
                      : '학습지가 들어 있는 폴더를 연결하세요.'}
                  </p>
                  <button onClick={needsPermission ? reconnect : connect}
                    className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
                    {needsPermission ? '폴더 다시 연결' : '폴더 선택'}
                  </button>
                  <p className="text-[11px] text-gray-400 mt-2.5 leading-relaxed">
                    파일은 앱에 저장되지 않고 PC에 그대로 있습니다.<br />
                    한 번 연결하면 다음에도 이어서 쓸 수 있습니다.
                  </p>
                </div>
              )}
            </div>

            {/* 파일 검색 */}
            {folder && (
              <div className="px-6 pt-3">
                <input
                  type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="파일명 검색"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
            )}

            {error && (
              <p className="mx-6 mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {/* 파일 목록 */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {!folder ? null : loading ? (
                <p className="py-12 text-center text-gray-400 text-sm">파일을 읽는 중...</p>
              ) : shown.length === 0 ? (
                <p className="py-12 text-center text-gray-400 text-sm">
                  {files.length === 0
                    ? '이 폴더에 PDF·이미지 파일이 없습니다.'
                    : '검색 결과가 없습니다.'}
                </p>
              ) : (
                <div className="border border-gray-200 rounded-xl divide-y divide-gray-50 overflow-hidden">
                  {shown.map(f => (
                    <button key={f.name} onClick={() => onPick(f)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-indigo-50 transition-colors">
                      <span className="text-base shrink-0">
                        {f.name.toLowerCase().endsWith('.pdf') ? '📄' : '🖼️'}
                      </span>
                      <span className="flex-1 text-sm text-gray-800 truncate">{f.name}</span>
                      <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">{formatSize(f.size)}</span>
                      <span className="text-xs font-semibold text-indigo-600 shrink-0 whitespace-nowrap">선택 →</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}