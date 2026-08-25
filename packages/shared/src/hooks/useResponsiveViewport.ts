'use client';

/**
 * packages/shared/src/hooks/useResponsiveViewport.ts
 * 멀티 디바이스 반응형 뷰포트 감지 훅 (Web & Mobile WebView 공용)
 */
import { useState, useEffect } from 'react';

export type DeviceType = 'MOBILE' | 'COMPACT_TABLET' | 'LARGE_TABLET_12' | 'DESKTOP';
export type ScreenOrientation = 'PORTRAIT' | 'LANDSCAPE';

export interface ViewportState {
  width: number;
  height: number;
  deviceType: DeviceType;
  orientation: ScreenOrientation;
  isMobile: boolean;
  isTablet: boolean;
  isLargeTablet: boolean; // 12인치 이상 대화면 태블릿 (iPad Pro 12.9/13, Galaxy Tab S9+/Ultra 12.4/14.6)
  isDesktop: boolean;
  isTouchDevice: boolean;
  hasStylusSupport: boolean;
  safeAreaBottom: number;
  safeAreaTop: number;
}

export function useResponsiveViewport(): ViewportState {
  const [viewport, setViewport] = useState<ViewportState>({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
    deviceType: 'DESKTOP',
    orientation: 'LANDSCAPE',
    isMobile: false,
    isTablet: false,
    isLargeTablet: false,
    isDesktop: true,
    isTouchDevice: false,
    hasStylusSupport: false,
    safeAreaBottom: 0,
    safeAreaTop: 0,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const isTouch = 'ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
      // 스타일러스/애플펜슬/S펜 터치 포인트 감지 (pointer: fine 또는 멀티 터치)
      const hasStylus = isTouch && (window.matchMedia('(pointer: fine)').matches || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1));
      
      const maxDimension = Math.max(w, h);
      const minDimension = Math.min(w, h);

      let device: DeviceType = 'DESKTOP';
      let isLargeTab = false;

      if (w < 768) {
        device = 'MOBILE';
      } else if (isTouch && (maxDimension >= 1024 && minDimension >= 800)) {
        // 12인치 이상 태블릿: iPad Pro 12.9/13(1024x1366 pt), Galaxy Tab S9+ 12.4(1130x1752), Tab Ultra 14.6
        device = 'LARGE_TABLET_12';
        isLargeTab = true;
      } else if (w < 1024 || (isTouch && maxDimension < 1200)) {
        device = 'COMPACT_TABLET';
      }

      const rootStyle = getComputedStyle(document.documentElement);
      const safeBottom = parseInt(rootStyle.getPropertyValue('--sat-bottom') || '0', 10);
      const safeTop = parseInt(rootStyle.getPropertyValue('--sat-top') || '0', 10);

      setViewport({
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
        safeAreaBottom: safeBottom,
        safeAreaTop: safeTop,
      });
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return viewport;
}
