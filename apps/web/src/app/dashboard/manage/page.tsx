import { redirect } from 'next/navigation'

// /dashboard/manage 는 학생 관리로 넘긴다.
// 상단 메뉴에서 넘어온 ?student= 를 잃지 않도록 그대로 붙여서 보낸다.
export default async function ManagePage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>
}) {
  const { student } = await searchParams
  redirect(student
    ? `/dashboard/manage/students?student=${student}`
    : '/dashboard/manage/students')
}