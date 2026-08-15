'use client'

// 학습지 원본 파일 접근 (Windows + Chrome 전용)
//
// 학습지 PDF는 한 개가 수 MB라 DB에 넣으면 금방 수 GB가 된다.
// 그래서 원본은 선생님 PC 폴더에 그대로 두고, 앱은 폴더 핸들과 파일명만 기억한다.
//
//   1) 선생님이 폴더를 한 번 지정 (showDirectoryPicker)
//   2) 핸들을 IndexedDB에 저장 → 다음 접속에도 재사용 (재승인 클릭 1회)
//   3) 이후에는 파일명만으로 열기·인쇄·AI 정답 추출
//
// 브라우저는 보안상 임의 경로(C:\...)를 읽을 수 없어서 이 방식이 유일하다.
// file:// 링크는 Chrome이 차단한다.

const DB_NAME = 'inlevmath'
const STORE = 'handles'
const KEY = 'worksheetFolder'

export type WorksheetFile = {
  name: string
  size: number
  lastModified: number
  handle: FileSystemFileHandle
}

/** 이 브라우저가 폴더 연결을 지원하는지 */
export function supportsFolderAccess() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

// ── IndexedDB: 폴더 핸들 보관 ────────────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
    tx.onsuccess = () => resolve((tx.result as T) ?? null)
    tx.onerror = () => reject(tx.error)
  })
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key)
    tx.onsuccess = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(key)
    tx.onsuccess = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ── 폴더 연결 ────────────────────────────────────────────────────────────────

/** 폴더 선택 대화상자를 띄우고 핸들을 저장한다 */
export async function pickWorksheetFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsFolderAccess()) {
    throw new Error('이 브라우저는 폴더 연결을 지원하지 않습니다. Chrome에서 사용해주세요.')
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' })
    await idbSet(KEY, handle)
    return handle
  } catch (e) {
    // 사용자가 취소한 경우
    if (e instanceof DOMException && e.name === 'AbortError') return null
    throw e
  }
}

/** 저장해 둔 폴더 핸들. 권한이 없으면 null (다시 연결 필요) */
export async function getSavedFolder(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await idbGet<FileSystemDirectoryHandle>(KEY)
  if (!handle) return null

  const opts = { mode: 'read' as const }
  if ((await handle.queryPermission(opts)) === 'granted') return handle
  return null
}

/** 저장된 폴더에 대해 권한을 다시 요청한다 (사용자 클릭 안에서 호출해야 함) */
export async function requestSavedFolder(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await idbGet<FileSystemDirectoryHandle>(KEY)
  if (!handle) return null

  const opts = { mode: 'read' as const }
  if ((await handle.queryPermission(opts)) === 'granted') return handle
  if ((await handle.requestPermission(opts)) === 'granted') return handle
  return null
}

export async function forgetWorksheetFolder() {
  await idbDelete(KEY)
}

// ── 파일 목록 ────────────────────────────────────────────────────────────────

const PRINTABLE = /\.(pdf|png|jpe?g|webp)$/i

/**
 * 폴더 안의 학습지 파일 목록. 하위 폴더까지 훑되 경로를 이름에 포함한다.
 * (교재/학년별로 폴더를 나눠 두는 경우가 많다)
 */
export async function listWorksheetFiles(
  dir: FileSystemDirectoryHandle,
  prefix = '',
  depth = 0
): Promise<WorksheetFile[]> {
  const out: WorksheetFile[] = []
  // 폴더가 깊게 중첩되면 탐색이 오래 걸려 3단계까지만 본다
  if (depth > 3) return out

  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'directory') {
      out.push(...await listWorksheetFiles(handle, `${prefix}${name}/`, depth + 1))
      continue
    }
    if (!PRINTABLE.test(name)) continue
    const file = await handle.getFile()
    out.push({
      name: prefix + name,
      size: file.size,
      lastModified: file.lastModified,
      handle,
    })
  }

  return out.sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }))
}

/** 파일 핸들에서 실제 File 객체를 읽는다 */
export async function readFile(f: WorksheetFile): Promise<File> {
  return f.handle.getFile()
}

export const formatSize = (n: number) =>
  n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`
// ── 인쇄 ────────────────────────────────────────────────────────────────────
//
// 브라우저는 프린터 목록을 읽거나 특정 프린터를 지정할 수 없다(그런 JS API가 없다).
// 프린터 선택·매수·페이지 범위·양면 설정은 모두 브라우저 인쇄 대화상자에서 한다.
// 앱은 파일을 열고 그 대화상자를 띄워주는 역할만 한다.

/**
 * 학습지를 새 탭에서 열고 인쇄 대화상자를 띄운다.
 * @param pageFrom PDF 뷰어를 해당 쪽부터 열어 준다 (인쇄 범위는 대화상자에서 지정)
 */
export async function printWorksheetFile(f: WorksheetFile, pageFrom?: number) {
  const file = await readFile(f)
  const url = URL.createObjectURL(file)
  const href = pageFrom && pageFrom > 0 ? `${url}#page=${pageFrom}` : url

  const win = window.open(href, '_blank')
  if (!win) {
    URL.revokeObjectURL(url)
    throw new Error('팝업이 차단되었습니다. 주소창 오른쪽의 팝업 차단을 해제해주세요.')
  }

  // 뷰어가 뜬 뒤 인쇄 대화상자를 연다. 자동 호출이 막히면 사용자가 Ctrl+P로 열면 된다.
  win.addEventListener('load', () => {
    try { win.print() } catch { /* 뷰어가 막으면 Ctrl+P 안내로 대체 */ }
  })

  // 탭이 파일을 다 읽을 때까지 유지했다가 정리한다
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
