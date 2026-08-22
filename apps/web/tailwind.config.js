/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './apps/**/*.{js,ts,jsx,tsx}',
    './packages/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    screens: {
      'xs': '360px',  // 컴팩트 스마트폰 (Galaxy S / iPhone SE)
      'sm': '640px',  // 대화면 스마트폰
      'md': '768px',  // 컴팩트 태블릿 세로 (iPad Mini / 10.2")
      'lg': '1024px', // 12인치 태블릿 세로 및 일반 태블릿 가로 (iPad Pro 11"/12.9" Portrait)
      'tab-12': '1130px', // 12.4인치 태블릿 (Galaxy Tab S9+ 12.4")
      'xl': '1280px', // 표준 랩탑 및 데스크톱
      'tab-pro': '1366px', // 12.9/13인치 대화면 태블릿 가로 (iPad Pro 12.9"/13" Landscape)
      'tab-ultra': '1440px', // 14.6인치 초대형 태블릿 (Galaxy Tab S9 Ultra 14.6")
      '2xl': '1536px' // 대화면 모니터
    },
    extend: {
      padding: {
        'safe': 'env(safe-area-inset-bottom, 16px)',
        'safe-top': 'env(safe-area-inset-top, 0px)'
      },
      minHeight: {
        'screen-safe': 'calc(100vh - env(safe-area-inset-bottom, 0px) - env(safe-area-inset-top, 0px))'
      }
    }
  },
  plugins: []
};
