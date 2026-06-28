import Link from 'next/link'

const STATS = [
  { label: '등록 학생', value: '4', unit: '명', color: 'text-indigo-600', sub: '/ 300명', href: '/dashboard/students' },
  { label: '오늘 활동', value: '2', unit: '명', color: 'text-emerald-600', sub: '미션 제출', href: '/dashboard/students' },
  { label: '이번 주 클리어', value: '3', unit: '건', color: 'text-amber-600', sub: '레벨업', href: '/dashboard/students' },
  { label: '최상위 달성', value: '1', unit: '명', color: 'text-rose-600', sub: '최상위문제', href: '/dashboard/students' },
]

const RECENT = [
  { id: 's1', name: '홍길동', school: '오성중', grade: '중2', mission: '기본문제',    rate: 93, cleared: true,  time: '10분 전' },
  { id: 's3', name: '이영희', school: '오성중', grade: '중3', mission: '최상위문제', rate: 78, cleared: false, time: '1시간 전' },
  { id: 's4', name: '박지민', school: '한빛중', grade: '중2', mission: '개념확인문제', rate: 65, cleared: false, time: '2시간 전' },
]

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">대시보드</h1>
        <p className="text-xs text-gray-400">{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}</p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-4 gap-4">
        {STATS.map(s => (
          <Link key={s.label} href={s.href}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:border-indigo-200 hover:shadow-sm transition-all block">
            <p className="text-sm text-gray-500 mb-1">{s.label}</p>
            <p className={`text-3xl font-black ${s.color}`}>
              {s.value}<span className="text-lg font-bold ml-1">{s.unit}</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">{s.sub}</p>
          </Link>
        ))}
      </div>

      {/* 빠른 이동 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { href: '/dashboard/worksheets', label: '학습지 채점', desc: '학습지 정답 입력 및 O/X 채점', color: 'text-teal-600', bg: 'bg-teal-50 hover:bg-teal-100 border-teal-200' },
          { href: '/dashboard/textbooks',  label: '교재 채점',   desc: '교재별 정답 입력 및 O/X 채점', color: 'text-indigo-600', bg: 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200' },
          { href: '/dashboard/students',   label: '학생 관리',   desc: '학생 등록·조회·학습내역 확인',  color: 'text-gray-700',   bg: 'bg-gray-50 hover:bg-gray-100 border-gray-200' },
        ].map(m => (
          <Link key={m.href} href={m.href}
            className={`${m.bg} border rounded-xl px-5 py-4 flex items-center justify-between transition-colors`}>
            <div>
              <p className={`font-semibold text-sm ${m.color}`}>{m.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{m.desc}</p>
            </div>
            <span className="text-gray-300 text-lg">→</span>
          </Link>
        ))}
      </div>

      {/* 최근 미션 제출 */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">최근 미션 제출</h2>
          <Link href="/dashboard/students" className="text-xs text-indigo-500 hover:underline">전체보기 →</Link>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 border-b border-gray-100">
              <th className="px-5 py-3 text-left font-medium">학생</th>
              <th className="px-5 py-3 text-left font-medium">학교 · 학년</th>
              <th className="px-5 py-3 text-left font-medium">미션</th>
              <th className="px-5 py-3 text-left font-medium">정답률</th>
              <th className="px-5 py-3 text-left font-medium">결과</th>
              <th className="px-5 py-3 text-left font-medium">시간</th>
            </tr>
          </thead>
          <tbody>
            {RECENT.map(r => (
              <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3">
                  <Link href={`/dashboard/students/${r.id}`}
                    className="font-semibold text-indigo-600 hover:underline">
                    {r.name}
                  </Link>
                </td>
                <td className="px-5 py-3 text-gray-500">{r.school} · {r.grade}</td>
                <td className="px-5 py-3 text-gray-700">{r.mission}</td>
                <td className="px-5 py-3">
                  <span className={`font-bold ${r.rate >= 80 ? 'text-emerald-600' : r.rate >= 70 ? 'text-amber-600' : 'text-red-500'}`}>
                    {r.rate}%
                  </span>
                </td>
                <td className="px-5 py-3">
                  {r.cleared
                    ? <span className="inline-flex items-center text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">클리어</span>
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
