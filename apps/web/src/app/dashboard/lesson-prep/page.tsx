'use client'

import Link from 'next/link'
import { useState } from 'react'

type Item = {
  id: string; type: 'worksheet' | 'textbook'
  title: string; grade: string; problemCount: number
  assignedTo: string[]
}

const ATTENDING_STUDENTS = [
  { id: 's1', name: '홍길동', grade: '중2' },
  { id: 's2', name: '김철수', grade: '중1' },
  { id: 's4', name: '박지민', grade: '중2' },
  { id: 's6', name: '정수진', grade: '중3' },
  { id: 's8', name: '이하늘', grade: '고1' },
  { id: 's9', name: '박서준', grade: '중1' },
]

const INITIAL_ITEMS: Item[] = [
  { id: 'w1', type: 'worksheet', title: '수완하나중 1-1 기말 모의고사_03회', grade: '중1', problemCount: 24, assignedTo: ['s2', 's9'] },
  { id: 'w2', type: 'worksheet', title: '수완하나중 1-1 기말 모의고사_04회', grade: '중1', problemCount: 24, assignedTo: [] },
  { id: 't1', type: 'textbook',  title: '일품 - 중등수학1(상)', grade: '중2', problemCount: 120, assignedTo: ['s1'] },
]

export default function LessonPrepPage() {
  const [items, setItems] = useState<Item[]>(INITIAL_ITEMS)

  const toggleAssign = (itemId: string, studentId: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item
      const already = item.assignedTo.includes(studentId)
      return {
        ...item,
        assignedTo: already
          ? item.assignedTo.filter(id => id !== studentId)
          : [...item.assignedTo, studentId],
      }
    }))
  }

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">수업 준비</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            오늘 출석 학생에게 학습지·교재를 배정합니다
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/worksheets"
            className="flex items-center gap-1.5 text-sm text-teal-600 border border-teal-200
              hover:bg-teal-50 px-3 py-2 rounded-lg transition-colors font-medium">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            학습지 추가
          </Link>
          <Link href="/dashboard/textbooks"
            className="flex items-center gap-1.5 text-sm text-indigo-600 border border-indigo-200
              hover:bg-indigo-50 px-3 py-2 rounded-lg transition-colors font-medium">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            교재 추가
          </Link>
        </div>
      </div>

      {/* 오늘 출석 학생 현황 */}
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 flex items-center gap-4">
        <span className="text-sm font-semibold text-gray-700">오늘 출석</span>
        <div className="flex gap-2 flex-wrap">
          {ATTENDING_STUDENTS.map(s => (
            <span key={s.id}
              className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              {s.name} <span className="text-emerald-400 font-normal">{s.grade}</span>
            </span>
          ))}
        </div>
      </div>

      {/* 학습지·교재 배정 목록 */}
      <div className="space-y-3">
        {items.map(item => (
          <div key={item.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {/* 아이템 헤더 */}
            <div className="flex items-center px-5 py-3.5 border-b border-gray-50">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded mr-3 ${
                item.type === 'worksheet'
                  ? 'bg-teal-50 text-teal-600'
                  : 'bg-indigo-50 text-indigo-600'
              }`}>
                {item.type === 'worksheet' ? '학습지' : '교재'}
              </span>
              <div className="flex-1">
                <Link
                  href={`/dashboard/${item.type === 'worksheet' ? 'worksheets' : 'textbooks'}/${item.id}`}
                  className="text-sm font-semibold text-gray-800 hover:text-indigo-600 hover:underline"
                >
                  {item.title}
                </Link>
                <span className="ml-2 text-xs text-gray-400">{item.grade} · {item.problemCount}문제</span>
              </div>
              <span className="text-xs text-gray-400">
                {item.assignedTo.length > 0
                  ? `${item.assignedTo.length}명 배정됨`
                  : '미배정'}
              </span>
            </div>

            {/* 학생별 배정 */}
            <div className="px-5 py-3 flex gap-2 flex-wrap">
              {ATTENDING_STUDENTS.map(s => {
                const assigned = item.assignedTo.includes(s.id)
                return (
                  <button
                    key={s.id}
                    onClick={() => toggleAssign(item.id, s.id)}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all font-medium ${
                      assigned
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600'
                    }`}
                  >
                    {assigned && (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                      </svg>
                    )}
                    {s.name}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {items.length === 0 && (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl py-16 text-center">
          <p className="text-gray-400 text-sm">오늘 준비된 학습지·교재가 없습니다.</p>
          <div className="flex justify-center gap-3 mt-4">
            <Link href="/dashboard/worksheets"
              className="text-sm text-teal-600 hover:underline">학습지 등록 →</Link>
            <Link href="/dashboard/textbooks"
              className="text-sm text-indigo-600 hover:underline">교재 등록 →</Link>
          </div>
        </div>
      )}
    </div>
  )
}
