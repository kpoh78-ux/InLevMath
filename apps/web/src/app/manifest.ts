import type { MetadataRoute } from 'next'

// PWA 매니페스트 — 태블릿 홈 화면에 아이콘으로 설치하기 위한 설정.
//
// 선생님용은 APK로 만들지 않는다. 화면 21개 + API 69개짜리 Next.js 웹이라
// 네이티브로 옮길 것이 아니고, Railway가 master를 자동 배포하므로 웹으로 두면
// 고친 내용이 새로고침만으로 반영된다. 대신 이 매니페스트로 홈 화면 아이콘과
// 전체화면(주소창 없음)을 얻는다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'InLevMath 선생님',
    short_name: 'InLevMath',
    description: '오근표 수학학원 학습지·교재·출결 관리',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#1A1A2E',
    theme_color: '#4F46E5',
    lang: 'ko',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        // 안드로이드가 원형·스퀘어클 마스크를 씌우므로 로고를 안전영역 안에 둔 별도 이미지
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
