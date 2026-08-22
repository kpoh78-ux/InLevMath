// apps/web/scripts/test-responsive-devices.mjs

function simulateViewport({ width, height, isTouch, maxTouchPoints, hasFinePointer }) {
  const w = width;
  const h = height;
  const hasStylus = isTouch && (hasFinePointer || maxTouchPoints > 1);

  const maxDimension = Math.max(w, h);
  const minDimension = Math.min(w, h);

  let device = 'DESKTOP';
  let isLargeTab = false;

  if (w < 768) {
    device = 'MOBILE';
  } else if (isTouch && (maxDimension >= 1024 && minDimension >= 800)) {
    device = 'LARGE_TABLET_12';
    isLargeTab = true;
  } else if (w < 1024 || (isTouch && maxDimension < 1200)) {
    device = 'COMPACT_TABLET';
  }

  return {
    width: w,
    height: h,
    deviceType: device,
    orientation: w > h ? 'LANDSCAPE' : 'PORTRAIT',
    isMobile: device === 'MOBILE',
    isTablet: device === 'COMPACT_TABLET' || device === 'LARGE_TABLET_12',
    isLargeTablet: isLargeTab,
    isDesktop: device === 'DESKTOP',
    isTouchDevice: isTouch,
    hasStylusSupport: hasStylus,
  };
}

const testMatrix = [
  {
    name: 'iPad Pro 12.9" / 13" (가로 모드)',
    spec: { width: 1366, height: 1024, isTouch: true, maxTouchPoints: 5, hasFinePointer: true },
    expectLargeTab: true,
  },
  {
    name: 'iPad Pro 12.9" (세로 모드)',
    spec: { width: 1024, height: 1366, isTouch: true, maxTouchPoints: 5, hasFinePointer: true },
    expectLargeTab: true,
  },
  {
    name: 'Galaxy Tab S9+ 12.4" (가로 모드)',
    spec: { width: 1752, height: 1130, isTouch: true, maxTouchPoints: 10, hasFinePointer: true },
    expectLargeTab: true,
  },
  {
    name: 'Galaxy Tab S9 Ultra 14.6" (가로 모드)',
    spec: { width: 1848, height: 1160, isTouch: true, maxTouchPoints: 10, hasFinePointer: true },
    expectLargeTab: true,
  },
  {
    name: 'iPad Mini 8.3" (컴팩트 태블릿)',
    spec: { width: 744, height: 1133, isTouch: true, maxTouchPoints: 5, hasFinePointer: true },
    expectLargeTab: false,
  },
  {
    name: 'iPhone 15 Pro / Galaxy S24 (스마트폰)',
    spec: { width: 393, height: 852, isTouch: true, maxTouchPoints: 5, hasFinePointer: false },
    expectLargeTab: false,
  },
  {
    name: 'PC 데스크톱 (27인치 QHD)',
    spec: { width: 2560, height: 1440, isTouch: false, maxTouchPoints: 0, hasFinePointer: true },
    expectLargeTab: false,
  },
];

console.log('📱 [멀티 디바이스 반응형 뷰포트 & 12인치+ 태블릿 감지 테스트]');
console.log('━'.repeat(70));

let allPass = true;

testMatrix.forEach((t, i) => {
  const result = simulateViewport(t.spec);
  const pass = result.isLargeTablet === t.expectLargeTab;
  if (!pass) allPass = false;

  console.log(`${i + 1}. 디바이스: ${t.name}`);
  console.log(`   - 해상도: ${result.width}x${result.height} (${result.orientation})`);
  console.log(`   - 디바이스 타입: ${result.deviceType}`);
  console.log(`   - isLargeTablet: ${result.isLargeTablet ? '✅ TRUE (12인치+ 활성)' : '❌ FALSE'}`);
  console.log(`   - 스타일러스(Apple Pencil/S-Pen) 지원: ${result.hasStylusSupport ? '✍️ 활성화' : '미지원'}`);
  console.log(`   - 판정: ${pass ? '🟢 통과' : '🔴 불일치'}`);
  console.log('─'.repeat(70));
});

console.log(`\n🎉 최종 결과: ${allPass ? '모든 디바이스 뷰포트 감지가 완벽하게 일치합니다!' : '일부 불일치'}`);
