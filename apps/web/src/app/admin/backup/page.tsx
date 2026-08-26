import { redirect } from 'next/navigation'

// 백업 화면은 학원관리 안으로 옮겼다. 기존 북마크·문서 링크를 위해 리다이렉트만 남긴다.
export default function AdminBackupPage() {
  redirect('/dashboard/manage/backup')
}
