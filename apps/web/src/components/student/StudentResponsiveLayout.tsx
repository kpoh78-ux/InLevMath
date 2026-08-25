// apps/web/src/components/student/StudentResponsiveLayout.tsx
'use client';

import React, { useState } from 'react';
import { Home, Award, FileText, BookOpen, AlertCircle, Sparkles, Menu, X } from 'lucide-react';
import { useResponsiveViewport } from '@inlevmath/shared';

interface Props {
  studentName: string;
  level: number;
  xp: number;
  streakDays: number;
  children: React.ReactNode;
  activeTab: 'HOME' | 'CAT_DIAGNOSTIC' | 'WORKSHEET' | 'INCORRECT_NOTE' | 'REWARD';
  onTabChange: (tab: 'HOME' | 'CAT_DIAGNOSTIC' | 'WORKSHEET' | 'INCORRECT_NOTE' | 'REWARD') => void;
}

export const StudentResponsiveLayout: React.FC<Props> = ({
  studentName,
  level,
  xp,
  streakDays,
  children,
  activeTab,
  onTabChange
}) => {
  const { isMobile, isTablet } = useResponsiveViewport();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'HOME' as const, label: '학습홈', icon: Home },
    { id: 'CAT_DIAGNOSTIC' as const, label: '진단평가', icon: Sparkles },
    { id: 'WORKSHEET' as const, label: '학습지', icon: FileText },
    { id: 'INCORRECT_NOTE' as const, label: '오답클리닉', icon: AlertCircle },
    { id: 'REWARD' as const, label: '보상소', icon: Award }
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col justify-between selection:bg-purple-500 selection:text-white">
      {/* ── 1. 상단 반응형 헤더 (Safe Area 상단 패딩 대응) ── */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 sm:px-6 py-3 pt-safe">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center font-bold text-sm shadow-md">
              M
            </div>
            <span className="font-extrabold text-base tracking-tight text-white sm:text-lg">
              InLevMath <span className="text-xs font-semibold text-purple-400">Student</span>
            </span>
          </div>

          {/* 학생 레벨 & 연속 학습 배지 (모바일에서도 컴팩트하게 표시) */}
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="bg-slate-800/80 px-2.5 sm:px-3 py-1 rounded-full border border-slate-700 flex items-center gap-1.5 text-xs font-bold">
              <span className="text-amber-400">🔥 {streakDays}일</span>
              <span className="text-slate-600 hidden sm:inline">|</span>
              <span className="text-purple-300">Lv.{level} ({xp} XP)</span>
            </div>
            <span className="text-xs text-slate-300 font-medium hidden md:inline">
              {studentName} 학생
            </span>
          </div>
        </div>
      </header>

      {/* ── 2. 본문 컨텐츠 영역 (하단 탭바 높이 + Safe Area 만큼 하단 패딩 동적 확보) ── */}
      <main
        className="flex-1 w-full max-w-7xl mx-auto p-3 sm:p-6 lg:p-8 pb-28 md:pb-8"
        style={{
          paddingBottom: isMobile
            ? 'max(6rem, calc(4.5rem + env(safe-area-inset-bottom, 16px)))'
            : undefined,
        }}
      >
        {children}
      </main>

      {/* ── 3. 모바일/태블릿 하단 내비게이션 바 (Mobile Bottom Tab Bar) ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 pb-safe shadow-2xl">
        <div className="grid grid-cols-5 h-16 items-center px-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`flex flex-col items-center justify-center h-full w-full gap-1 transition-all active:scale-95 ${
                  isActive
                    ? 'text-purple-400 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className={`p-1 rounded-xl transition-all ${
                  isActive ? 'bg-purple-500/20' : ''
                }`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[10px] tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
