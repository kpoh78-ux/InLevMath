// apps/web/src/components/dashboard/StudentWeaknessRadar.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell 
} from 'recharts';
import { Target, Award, AlertCircle } from 'lucide-react';

export interface SubUnitAccuracy {
  subUnitId: string;
  name: string;
  accuracyRate: number; // 0 ~ 100%
  totalSolved: number;
}

export interface StudentWeaknessRadarProps {
  data?: SubUnitAccuracy[];
  studentName?: string;
  studentId?: string;
}

export const StudentWeaknessRadar: React.FC<StudentWeaknessRadarProps> = ({
  data: initialData,
  studentName = '학생',
  studentId
}) => {
  const [data, setData] = useState<SubUnitAccuracy[]>(initialData || []);
  const [loading, setLoading] = useState<boolean>(!initialData && Boolean(studentId));

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      return;
    }

    if (studentId) {
      let ignore = false;
      setLoading(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

      fetch(`/api/students/${studentId}/unit-stats`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((resJson) => {
          if (!ignore && resJson?.weaknesses) {
            const mapped: SubUnitAccuracy[] = resJson.weaknesses.map((w: any) => ({
              subUnitId: w.subUnitId,
              name: w.subUnitName,
              accuracyRate: w.accuracyRate,
              totalSolved: w.totalSolved,
            }));
            setData(mapped);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!ignore) setLoading(false);
        });

      return () => {
        ignore = true;
      };
    }
  }, [initialData, studentId]);

  const weakUnits = data.filter(d => d.totalSolved >= 3 && d.accuracyRate < 60);
  const strongUnits = data.filter(d => d.accuracyRate >= 85);

  const getBarColor = (rate: number) => {
    if (rate >= 80) return '#10b981'; // 초록 (우수)
    if (rate >= 60) return '#6366f1'; // 남색 (양호)
    return '#f43f5e'; // 빨강 (보완 필요)
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-400 animate-pulse">
        소단원별 성취도 분석 데이터를 집계하고 있습니다...
      </div>
    );
  }

  const avgAccuracy =
    data.length > 0
      ? data.reduce((acc, cur) => acc + cur.accuracyRate, 0) / data.length
      : 0;
  const radarThemeColor = getBarColor(avgAccuracy);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-600" />
            <span>{studentName} 학생의 단원별 수학 성취도 분석</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            소단원별 누적 풀이 데이터를 기반으로 산출된 정답률 백분율(%)입니다.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold border border-emerald-200 flex items-center gap-1">
            <Award className="w-3.5 h-3.5" /> 마스터 단원 {strongUnits.length}개
          </span>
          <span className="px-3 py-1 bg-rose-50 text-rose-700 rounded-full text-xs font-bold border border-rose-200 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" /> 집중 클리닉 {weakUnits.length}개
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <div className="lg:col-span-5 h-72 flex flex-col items-center justify-center">
          {data.length === 0 ? (
            <div className="text-xs text-slate-400">등록된 소단원 풀이 데이터가 없습니다.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={data.slice(0, 6)}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="name" tick={{ fill: '#475569', fontSize: 11 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#cbd5e1" />
                <Radar
                  name="정답률(%)"
                  dataKey="accuracyRate"
                  stroke={radarThemeColor}
                  fill={radarThemeColor}
                  fillOpacity={0.35}
                />
              </RadarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="lg:col-span-7 h-72">
          {data.length === 0 ? (
            <div className="text-xs text-slate-400 flex h-full items-center justify-center">
              풀이 이력이 누적되면 단원별 정답률 막대그래프가 표시됩니다.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11, fill: '#334155' }} />
                <Tooltip formatter={(val: number) => [`${val}%`, '정답률']} />
                <Bar dataKey="accuracyRate" radius={[0, 4, 4, 0]}>
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getBarColor(entry.accuracyRate)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentWeaknessRadar;
