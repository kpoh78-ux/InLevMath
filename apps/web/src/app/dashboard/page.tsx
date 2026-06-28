import Link from 'next/link'

const STATS = [
  { label: '등록 학생', value: '4', unit: '명', color: 'text-indigo-600', sub: '/ 300명' },
  { label: '오늘 활동', value: '2', unit: '명', color: 'text-emerald-600', sub: '미션 제출' },
  { label: '이번 주 클리어', value: '3', unit: '건', color: 'text-amber-600', sub: '레벨업' },
  { label: '최상위 달성', value: '1', unit: '명', color: 'text-rose-600', sub: '최상위문제' },
]

const RECENT = [
  { name: '홍길동', school: '오성중', grade: '중2', mission: '기본문제', rate: 93, cleared: true,  time: '10분 전' },
  { name: '이영희', school: '오성중', grade: '중3', mission: '최상위문제', rate: 78, cleared: false, time: '1시간 전' },
  { name: '박지민', school: '한빛중', grade: '중2', mission: '개념확인문제', rate: 65, cleared: false, time: '2시간 전' },
]

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">대시보드</h1>
        <Link
          href="/dashboard/students"
          className="text-sm text-indigo-600 hover:underline font-medium"
        >
          학생 관리 →
        </Link>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-4 gap-4">
        {STATS.map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-1">{s.label}</p>
            <p className={`text-3xl font-black ${s.color}`}>
              {s.value}<span className="text-lg font-bold ml-1">{s.unit}</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* 최근 활동 */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">최근 미션 제출</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 border-b border-gray-100">
              <th className="px-5 py-3 text-left font-medium">학생</th>
              <th className="px-5 py-3 text-left font-medium">학교·학년</th>
              <th className="px-5 py-3 text-left font-medium">미션</th>
              <th className="px-5 py-3 text-left font-medium">정답률</th>
              <th className="px-5 py-3 text-left font-medium">결과</th>
              <th className="px-5 py-3 text-left font-medium">시간</th>
            </tr>
          </thead>
          <tbody>
            {RECENT.map((r, i) => (
              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3 font-medium text-gray-900">{r.name}</td>
                <td className="px-5 py-3 text-gray-500">{r.school} · {r.grade}</td>
                <td className="px-5 py-3 text-gray-700">{r.mission}</td>
                <td className="px-5 py-3">
                  <span className={`font-bold ${r.rate >= 80 ? 'text-emerald-600' : r.rate >= 70 ? 'text-amber-600' : 'text-red-500'}`}>
                    {r.rate}%
                  </span>
                </td>
                <td className="px-5 py-3">
                  {r.cleared
                    ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">🏆 클리어</span>
                    : <span className="inline-flex items-center text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">진행중</span>
                  }
                </td>
                <td className="px-5 py-3 text-gray-400 text-xs">{r.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
