// apps/web/src/components/teacher/TeacherResponsiveShell.tsx
'use client';

import React, { useState } from 'react';
import { 
  LayoutDashboard, Users, FileSpreadsheet, Send, Settings, Menu, X, BookOpen, 
  ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Smartphone, Tablet, Monitor
} from 'lucide-react';
import { useResponsiveViewport } from '@inlevmath/shared';

interface Props {
  teacherName: string;
  activeMenu: string;
  onSelectMenu: (menu: string) => void;
  children: React.ReactNode;
}

export const TeacherResponsiveShell: React.FC<Props> = ({
  teacherName,
  activeMenu,
  onSelectMenu,
  children
}) => {
  const { isDesktop, isTablet, isLargeTablet, isMobile, orientation, hasStylusSupport } = useResponsiveViewport();
  
  // 모바일 드로어 열림 상태
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  // 태블릿/데스크톱 사이드바 접힘(Compact Rail) 모드 (12인치+ 태블릿 가로모드에서는 기본 확장)
  const [isCollapsed, setIsCollapsed] = useState(isTablet && !isLargeTablet && orientation === 'PORTRAIT');

  const menuItems = [
    { id: 'DASHBOARD', label: '대시보드', icon: LayoutDashboard, badge: '실시간' },
    { id: 'STUDENTS', label: '학생 관리 & 정답률', icon: Users, badge: '32명' },
    { id: 'WORKSHEETS', label: '학습지 & Omni파서', icon: FileSpreadsheet, badge: 'AI' },
    { id: 'ALIMTALK', label: '알림톡 & 문자 발송', icon: Send, badge: '선택' },
    { id: 'CURRICULUM', label: '2022 지식그래프', icon: BookOpen, badge: '1,474개' },
    { id: 'SETTINGS', label: '설정', icon: Settings, badge: '' }
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row text-slate-900 selection:bg-indigo-500 selection:text-white">
      {/* ── 1. 모바일 전용 상단 헤더 (화면 폭 < 768px) ── */}
      <header className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsMobileDrawerOpen(true)}
            className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 active:scale-95 transition-all"
            aria-label="메뉴 열기"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-black text-xs">
              IN
            </div>
            <span className="font-bold text-sm text-slate-900">InLevMath 교사용</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
            {teacherName}
          </span>
        </div>
      </header>

      {/* ── 2. 사이드바 네비게이션 (PC: 256px 확장 / 태블릿: 80px 컴팩트 레일 토글 / 모바일: 슬라이드 드로어) ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 bg-white border-r border-slate-200 p-4 flex flex-col justify-between transition-all duration-300 ease-in-out md:static ${
          isMobileDrawerOpen ? 'translate-x-0 shadow-2xl w-72' : '-translate-x-full md:translate-x-0'
        } ${
          !isMobileDrawerOpen && isCollapsed ? 'md:w-20' : 'md:w-64'
        }`}
      >
        <div className="space-y-5">
          {/* 로고 & 접힘 토글 버튼 */}
          <div className="flex items-center justify-between">
            <div className={`flex items-center gap-2.5 transition-opacity ${isCollapsed ? 'md:justify-center w-full' : ''}`}>
              <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black text-base shadow-sm shrink-0">
                IN
              </div>
              {(!isCollapsed || isMobileDrawerOpen) && (
                <div className="overflow-hidden whitespace-nowrap">
                  <h1 className="font-extrabold text-base text-slate-900 tracking-tight leading-tight">InLevMath</h1>
                  <span className="text-[10px] text-slate-400 font-semibold block">Teacher Management</span>
                </div>
              )}
            </div>

            {/* 모바일 닫기 버튼 */}
            <button
              onClick={() => setIsMobileDrawerOpen(false)}
              className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 태블릿/PC 전용 사이드바 축소/확장 토글러 (iPad 세로 모드에서 작업 공간 극대화) */}
          <div className="hidden md:flex justify-end">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors text-xs flex items-center gap-1"
              title={isCollapsed ? '사이드바 확장' : '사이드바 축소 (태블릿 모드)'}
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>

          {/* 메뉴 아이템 목록 (터치 타깃 최소 44px 보장) */}
          <nav className="space-y-1.5">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeMenu === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelectMenu(item.id);
                    setIsMobileDrawerOpen(false);
                  }}
                  className={`w-full min-h-[44px] flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all group relative ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  } ${isCollapsed && !isMobileDrawerOpen ? 'justify-center px-0' : ''}`}
                  title={item.label}
                >
                  <Icon className={`w-5 h-5 shrink-0 transition-transform group-hover:scale-110 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                  
                  {(!isCollapsed || isMobileDrawerOpen) && (
                    <div className="flex-1 flex items-center justify-between overflow-hidden text-left">
                      <span className="truncate">{item.label}</span>
                      {item.badge && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${
                          isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {item.badge}
                        </span>
                      )}
                    </div>
                  )}

                  {/* 축소 모드일 때 마우스 호버 툴팁 */}
                  {isCollapsed && !isMobileDrawerOpen && (
                    <div className="absolute left-full ml-2 px-2.5 py-1 bg-slate-900 text-white text-[11px] rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-lg">
                      {item.label}
                    </div>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* 하단 현재 디바이스 상태 & 교사 프로필 */}
        <div className="pt-4 border-t border-slate-100 space-y-3">
          {(!isCollapsed || isMobileDrawerOpen) ? (
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800">{teacherName} 선생님</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                {isLargeTablet ? <Tablet className="w-3 h-3 text-purple-600" /> : isTablet ? <Tablet className="w-3 h-3 text-indigo-500" /> : isDesktop ? <Monitor className="w-3 h-3 text-slate-500" /> : <Smartphone className="w-3 h-3 text-slate-500" />}
                <span>{isLargeTablet ? '12인치+ 태블릿 (iPad Pro/Galaxy Tab Ultra)' : isTablet ? '태블릿 모드' : isDesktop ? 'PC 데스크톱' : '모바일 웹'} ({orientation})</span>
              </div>
            </div>
          ) : (
            <div className="flex justify-center">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100" />
            </div>
          )}
        </div>
      </aside>

      {/* 모바일 백드롭 배경 */}
      {isMobileDrawerOpen && (
        <div
          onClick={() => setIsMobileDrawerOpen(false)}
          className="md:hidden fixed inset-0 z-30 bg-black/50 backdrop-blur-xs transition-opacity"
        />
      )}

      {/* ── 3. 반응형 메인 컨텐츠 뷰포트 (12인치+ 대화면 태블릿 & PC 최적화 마스터-디테일 분할 그리드) ── */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1700px] w-full mx-auto overflow-x-hidden relative">
        {/* 12인치 이상 대화면 태블릿 전용 스타일러스(Apple Pencil/S-Pen) 플로팅 퀵 채점 툴바 */}
        {isLargeTablet && (
          <div className="sticky top-2 z-20 mb-4 bg-slate-900/90 backdrop-blur-md text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center justify-between border border-slate-700/60">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
              <span className="font-bold text-purple-300">12인치+ 스타일러스 채점 모드</span>
              <span className="text-[10px] text-slate-400 hidden sm:inline">| Apple Pencil / S-Pen 터치 제스처 활성화됨</span>
            </div>
            <div className="flex items-center gap-2">
              <button className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-bold transition-all shadow-sm">
                ✓ 정답(O)
              </button>
              <button className="px-3 py-1 bg-rose-600 hover:bg-rose-500 rounded-lg text-xs font-bold transition-all shadow-sm">
                ✕ 오답(X)
              </button>
              <button className="px-3 py-1 bg-purple-600 hover:bg-purple-500 rounded-lg text-xs font-bold transition-all shadow-sm">
                ✍️ 풀이 첨삭
              </button>
            </div>
          </div>
        )}

        {/* 태블릿/PC 상단 퀵 스테이터스 바 (12인치 태블릿 가로모드에서 4열 완전 밀착 배치) */}
        <div className="hidden sm:grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-slate-500">금일 출석 학생</div>
              <div className="text-lg font-black text-slate-900 mt-0.5">28 / 32명</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs">
              87%
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-slate-500">결손 진단 알림</div>
              <div className="text-lg font-black text-rose-600 mt-0.5">3건 발생</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-xs">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-slate-500">오늘 숙제 제출률</div>
              <div className="text-lg font-black text-indigo-600 mt-0.5">93.8%</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-slate-500">알림톡 발송 대기</div>
              <div className="text-lg font-black text-amber-600 mt-0.5">4명</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-xs">
              <Send className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* 전달받은 실제 페이지 화면 렌더링 */}
        <div className="w-full">
          {children}
        </div>
      </main>
    </div>
  );
};
