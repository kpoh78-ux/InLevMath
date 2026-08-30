// 정답 이미지 저장소 (서버 전용)
//
// 정답 스냅샷이 쌓이면 DB가 수십~수백 GB로 커진다. Postgres에 base64로 넣으면
// 용량이 33% 부풀고 백업(pg_dump)도 같이 무거워지므로, 실제 파일은
// 오브젝트 스토리지로 빼고 DB에는 키만 두는 경로를 마련해 둔다.
//
//   ANSWER_IMAGE_STORAGE=db        (기본) base64를 AnswerImage.data에 저장
//   ANSWER_IMAGE_STORAGE=supabase  Supabase Storage 버킷에 업로드, DB에는 objectKey만
//   ANSWER_IMAGE_BUCKET=answer-images
//
// supabase 모드에서는 조회 시 서명 URL을 돌려주므로 이미지 트래픽이
// 앱 서버를 거치지 않는다 (= 서버 메모리/대역폭도 같이 절약된다).

import { prisma } from './db'
import { parseImageDataUrl, toDataUrl } from './answers'

export type AnswerOwner = { worksheetId: string }

type Driver = 'db' | 'supabase'

const driver = (): Driver =>
  process.env.ANSWER_IMAGE_STORAGE === 'supabase' ? 'supabase' : 'db'

const bucket = () => process.env.ANSWER_IMAGE_BUCKET || 'answer-images'

const SIGNED_URL_TTL_SEC = 60 * 60

const ownerWhere = (owner: AnswerOwner) => ({ worksheetId: owner.worksheetId })

const objectPrefix = (owner: AnswerOwner) => `worksheet/${owner.worksheetId}`

const extOf = (mimeType: string) => (mimeType.split('/')[1] || 'webp').replace('jpeg', 'jpg')

async function storage() {
  const { supabaseAdmin } = await import('./supabase')
  return supabaseAdmin.storage.from(bucket())
}

async function removeObjects(keys: string[]) {
  if (keys.length === 0) return
  try {
    const s = await storage()
    await s.remove(keys)
  } catch (e) {
    // 스토리지 정리 실패가 정답 저장 자체를 막지는 않도록 한다 (고아 파일은 나중에 정리)
    console.error('[answerImageStore] 오브젝트 삭제 실패', keys, e)
  }
}

/**
 * 문제 번호 → 이미지 URL 맵.
 * storage='db'면 data URL, storage='object'면 서명 URL을 돌려준다.
 */
export async function listAnswerImages(owner: AnswerOwner): Promise<Record<number, string>> {
  const rows = await prisma.answerImage.findMany({
    where: ownerWhere(owner),
    orderBy: { problemNo: 'asc' },
  })

  const out: Record<number, string> = {}
  const signTargets = rows.filter(r => r.storage === 'object' && r.objectKey)

  if (signTargets.length > 0) {
    const s = await storage()
    const { data } = await s.createSignedUrls(
      signTargets.map(r => r.objectKey!),
      SIGNED_URL_TTL_SEC
    )
    const byPath = new Map((data ?? []).map(d => [d.path, d.signedUrl]))
    for (const r of signTargets) {
      const url = byPath.get(r.objectKey!)
      if (url) out[r.problemNo] = url
    }
  }

  for (const r of rows) {
    if (r.storage === 'db' && r.data) out[r.problemNo] = toDataUrl(r.mimeType, r.data)
  }
  return out
}

export type ImageOp =
  | { problemNo: number; action: 'put'; dataUrl: string }
  | { problemNo: number; action: 'keep' }

/**
 * ops에 없는 문제 번호의 이미지는 삭제한다.
 * @returns 최종적으로 이미지를 가진 문제 번호 집합
 */
export async function syncAnswerImages(owner: AnswerOwner, ops: ImageOp[]): Promise<Set<number>> {
  const where = ownerWhere(owner)
  const existing = await prisma.answerImage.findMany({
    where,
    select: { problemNo: true, storage: true, objectKey: true },
  })
  const existingByNo = new Map(existing.map(e => [e.problemNo, e]))

  // 'keep'인데 실제 행이 없으면 무시
  const effective = ops.filter(op => op.action === 'put' || existingByNo.has(op.problemNo))
  const keepNos = new Set(effective.map(op => op.problemNo))

  // 1) 사라진 이미지 정리
  const stale = existing.filter(e => !keepNos.has(e.problemNo))
  if (stale.length > 0) {
    await prisma.answerImage.deleteMany({
      where: { ...where, problemNo: { in: stale.map(s => s.problemNo) } },
    })
    await removeObjects(stale.filter(s => s.objectKey).map(s => s.objectKey!))
  }

  // 2) 새로 올라온 이미지 저장
  const puts = effective.filter(op => op.action === 'put') as Extract<ImageOp, { action: 'put' }>[]
  const replacedObjectKeys: string[] = []

  for (const op of puts) {
    const parsed = parseImageDataUrl(op.dataUrl)
    if (!parsed) continue

    const prev = existingByNo.get(op.problemNo)
    let row: {
      mimeType: string; storage: string; data: string | null; objectKey: string | null; bytes: number
    }

    if (driver() === 'supabase') {
      const key = `${objectPrefix(owner)}/${op.problemNo}.${extOf(parsed.mimeType)}`
      const buf = Buffer.from(parsed.data, 'base64')
      const s = await storage()
      const { error } = await s.upload(key, buf, { contentType: parsed.mimeType, upsert: true })
      if (error) throw new Error(`이미지 업로드 실패: ${error.message}`)
      row = { mimeType: parsed.mimeType, storage: 'object', data: null, objectKey: key, bytes: buf.length }
      // 확장자가 바뀌어 키가 달라졌으면 이전 파일 정리
      if (prev?.objectKey && prev.objectKey !== key) replacedObjectKeys.push(prev.objectKey)
    } else {
      row = {
        mimeType: parsed.mimeType, storage: 'db', data: parsed.data, objectKey: null,
        bytes: Math.floor((parsed.data.length * 3) / 4),
      }
      // db 모드로 되돌린 경우 남아 있던 오브젝트 정리
      if (prev?.objectKey) replacedObjectKeys.push(prev.objectKey)
    }

    await prisma.answerImage.upsert({
      where: { worksheetId_problemNo: { worksheetId: owner.worksheetId, problemNo: op.problemNo } },
      create: { ...where, problemNo: op.problemNo, ...row },
      update: row,
    })
  }

  await removeObjects(replacedObjectKeys)
  return keepNos
}

/** 학습지 삭제 시 버킷에 남는 파일까지 정리 (DB 행은 FK cascade로 지워짐) */
export async function purgeAnswerImages(owner: AnswerOwner) {
  const rows = await prisma.answerImage.findMany({
    where: ownerWhere(owner),
    select: { objectKey: true },
  })
  await removeObjects(rows.filter(r => r.objectKey).map(r => r.objectKey!))
}

/** 저장 용량 집계 (관리 화면·모니터링용) */
export async function answerImageUsage() {
  const [agg, byStorage] = await Promise.all([
    prisma.answerImage.aggregate({ _sum: { bytes: true }, _count: true }),
    prisma.answerImage.groupBy({ by: ['storage'], _sum: { bytes: true }, _count: true }),
  ])
  return {
    driver: driver(),
    totalCount: agg._count,
    totalBytes: agg._sum.bytes ?? 0,
    byStorage: byStorage.map(b => ({
      storage: b.storage, count: b._count, bytes: b._sum.bytes ?? 0,
    })),
  }
}