import { LRUCache } from 'lru-cache'

// 학습지 목록 인메모리 캐시 (선생님 id -> 가공된 학습지 목록)
// 60초 TTL, 등록/수정/삭제 시 즉시 무효화
const worksheetsCache = new LRUCache<string, any[]>({
  max: 100,
  ttl: 1000 * 60, // 60초
})

export function getCachedWorksheets(teacherId: string): any[] | undefined {
  return worksheetsCache.get(teacherId)
}

export function setCachedWorksheets(teacherId: string, data: any[]): void {
  worksheetsCache.set(teacherId, data)
}

export function invalidateWorksheetsCache(teacherId?: string): void {
  if (teacherId) {
    worksheetsCache.delete(teacherId)
  } else {
    worksheetsCache.clear()
  }
}
