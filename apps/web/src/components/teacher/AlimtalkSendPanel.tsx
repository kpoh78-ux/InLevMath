'use client';

import React, { useState, useMemo } from 'react';
import { 
  Send, CheckSquare, Square, Smartphone, BookOpen, Calculator, FileCheck, Award, MessageSquare, Sparkles, MessageCircle, Mail, Clock, UserCheck
} from 'lucide-react';

export type SendChannel = 'ALIMTALK' | 'SMS_LMS';

export interface ReportData {
  studentName: string;
  parentPhone: string;
  senderPhone?: string; // 발신자(회신) 번호
  reportDate: string;
  // 자동 집계 데이터
  homeworkCompletion: number;   // 숙제 완성도 (%)
  calcBookCompletion: number;   // 연산교재 완성도 (%)
  progressBookScore: number;    // 진도교재 점수 (%)
  worksheetScore: number;       // 학습지 점수 (%)
  unitExamScore?: number;       // 단원평가/모의고사 점수 (%)
  targetGoalRate: number;       // 일일 진도목표 완성률 (%)
  studyTimeAchieveRate: number; // 학습시간 달성률 (%)
  // 교사 입력 데이터
  attendance: 'ON_TIME' | 'LATE' | 'ABSENT' | 'MAKEUP';
  lateMinutes: number;
  concentrationGrade: 'EXCELLENT' | 'GOOD' | 'NORMAL' | 'NEEDS_CARE';
  teacherComment: string;
}

export interface SendPayload {
  channel: SendChannel;
  parentPhone: string;
  senderPhone?: string;
  studentName: string;
  message: string;
  reportData: ReportData;
  options: {
    includeHomework: boolean;
    includeCalcBook: boolean;
    includeProgressBook: boolean;
    includeWorksheet: boolean;
    includeUnitExam: boolean;
    includeAttendance: boolean;
    includeAttitude: boolean;
    includeGoalRate: boolean;
    includeComment: boolean;
  };
}

export const AlimtalkSendPanel: React.FC<{
  initialData: ReportData;
  onSend?: (payload: SendPayload) => Promise<void>;
}> = ({
  initialData,
  onSend
}) => {
  const [data, setData] = useState<ReportData>(initialData);
  const [channel, setChannel] = useState<SendChannel>('ALIMTALK');
  const [isSending, setIsSending] = useState(false);

  const [checkedOptions, setCheckedOptions] = useState({
    includeHomework: true,
    includeCalcBook: true,
    includeProgressBook: true,
    includeWorksheet: true,
    includeUnitExam: typeof initialData.unitExamScore === 'number',
    includeAttendance: true,
    includeAttitude: true,
    includeGoalRate: true,
    includeComment: true,
  });

  const toggleOption = (key: keyof typeof checkedOptions) => {
    setCheckedOptions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getAttendanceLabel = () => {
    switch (data.attendance) {
      case 'ON_TIME': return '정시 출석 (100% 출석)';
      case 'LATE': return `지각 (${data.lateMinutes}분 지각)`;
      case 'ABSENT': return '결석';
      case 'MAKEUP': return '보강 수업 참석';
      default: return '정시 출석';
    }
  };

  const getAttitudeLabel = () => {
    switch (data.concentrationGrade) {
      case 'EXCELLENT': return '매우 우수 (집중력 최고)';
      case 'GOOD': return '양호 (성실히 참여)';
      case 'NORMAL': return '보통';
      case 'NEEDS_CARE': return '집중력 보강 필요';
      default: return '보통';
    }
  };

  const generateMessageBody = () => {
    const headerPrefix = channel === 'ALIMTALK' 
      ? '[InLevMath 알림톡]' 
      : '[InLevMath 수학학원 문자안내]';
    
    let msg = `${headerPrefix} ${data.studentName} 학생 일일 학습 리포트\n`;
    msg += `학부모님 안녕하세요. 금일(${data.reportDate}) 수업 결과입니다.\n\n`;

    if (checkedOptions.includeAttendance) {
      msg += `📌 [출결 현황] : ${getAttendanceLabel()}\n`;
    }
    if (checkedOptions.includeAttitude) {
      msg += `🧠 [수업 집중도] : ${getAttitudeLabel()}\n`;
      msg += `⏱️ [학습시간 달성률] : ${data.studyTimeAchieveRate}%\n`;
    }
    if (checkedOptions.includeGoalRate) {
      msg += `🎯 [일일 목표 완성률] : ${data.targetGoalRate}%\n`;
    }

    msg += `\n📊 [학습 성취도 세부 결과]\n`;
    if (checkedOptions.includeHomework) {
      msg += `▪️ 숙제 완성도 : ${data.homeworkCompletion}%\n`;
    }
    if (checkedOptions.includeCalcBook) {
      msg += `▪️ 연산교재 숙제 완성도 : ${data.calcBookCompletion}%\n`;
    }
    if (checkedOptions.includeProgressBook) {
      msg += `▪️ 진도교재 채점결과 : ${data.progressBookScore}점\n`;
    }
    if (checkedOptions.includeWorksheet) {
      msg += `▪️ 학습지 풀이 채점결과 : ${data.worksheetScore}점\n`;
    }
    if (checkedOptions.includeUnitExam && data.unitExamScore !== undefined) {
      msg += `▪️ 단원평가/모의고사 : ${data.unitExamScore}점\n`;
    }

    if (checkedOptions.includeComment && data.teacherComment) {
      msg += `\n💬 [선생님 코멘트]\n${data.teacherComment}\n`;
    }

    msg += `\n상세한 취약 단원 분석 및 오답노트는 모바일 리포트 링크에서 확인 가능합니다.`;
    return msg;
  };

  const messageText = useMemo(() => generateMessageBody(), [data, channel, checkedOptions]);
  
  // 한글/영문 바이트 계산 (EUC-KR 기준 한글 2byte, 영문/기호 1byte)
  const byteCount = useMemo(() => {
    if (typeof window === 'undefined') return messageText.length * 2;
    let bytes = 0;
    for (let i = 0; i < messageText.length; i++) {
      const code = messageText.charCodeAt(i);
      bytes += code > 127 ? 2 : 1;
    }
    return bytes;
  }, [messageText]);

  const isLms = byteCount > 90;

  const handleSend = async () => {
    setIsSending(true);
    try {
      const payload: SendPayload = {
        channel,
        parentPhone: data.parentPhone,
        senderPhone: data.senderPhone,
        studentName: data.studentName,
        message: messageText,
        reportData: data,
        options: checkedOptions
      };

      if (onSend) {
        await onSend(payload);
      } else {
        const token = localStorage.getItem('access_token') || localStorage.getItem('token');
        const res = await fetch('/api/alimtalk/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            channel,
            parentPhone: data.parentPhone,
            senderPhone: data.senderPhone,
            studentName: data.studentName,
            message: messageText,
            reportData: data,
            options: checkedOptions
          })
        });

        const resData = await res.json().catch(() => ({ success: false, error: '' }));
        // 미연동(503)·비즈엠 오류(502)면 실제로 발송되지 않았으므로 성공 안내를 띄우지 않는다
        if (!res.ok || !resData?.success) {
          throw new Error(resData?.error || '발송 요청에 실패했습니다.');
        }
      }

      alert(
        channel === 'ALIMTALK' 
          ? '학부모님께 카카오 알림톡이 성공적으로 발송되었습니다. (미수신 시 LMS 자동 대체)'
          : `학부모님께 ${isLms ? 'LMS 장문 문자' : 'SMS 단문 문자'}가 성공적으로 발송되었습니다.`
      );
    } catch (e: any) {
      alert(e?.message || '발송 실패: 설정을 확인하세요.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-50 p-6 rounded-3xl border border-slate-200 shadow-sm">
      <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 space-y-5 shadow-xs">
        {/* 발송 채널 선택 탭 */}
        <div className="bg-slate-100 p-1.5 rounded-2xl flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setChannel('ALIMTALK')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              channel === 'ALIMTALK'
                ? 'bg-amber-400 text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <MessageCircle className="w-4 h-4 fill-slate-900" />
            <span>카카오 알림톡 발송</span>
            <span className="text-[10px] bg-slate-900/10 px-2 py-0.5 rounded-full font-semibold">
              실패 시 LMS 대체
            </span>
          </button>

          <button
            type="button"
            onClick={() => setChannel('SMS_LMS')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              channel === 'SMS_LMS'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Mail className="w-4 h-4" />
            <span>일반 문자메시지 (SMS/LMS)</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
              channel === 'SMS_LMS' ? 'bg-white/20 text-white' : 'bg-slate-300 text-slate-700'
            }`}>
              {isLms ? 'LMS 장문' : 'SMS 단문'}
            </span>
          </button>
        </div>

        <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-indigo-600" />
              <span>포함 항목 선택 (체크박스)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              전송할 항목을 체크하면 우측 {channel === 'ALIMTALK' ? '카카오톡' : '문자메시지'} 미리보기에 실시간 반영됩니다.
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full font-bold inline-block">
              {data.studentName} 학생
            </span>
            <span className="text-[11px] text-slate-400 block mt-0.5 font-mono">
              {data.parentPhone || '연락처 미등록'}
            </span>
          </div>
        </div>

        {/* 자동 집계 체크박스 */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
            1. 자동 집계 학습 성취도 (Auto-Calculated Stats)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { key: 'includeHomework', label: '숙제 해온 완성도', val: `${data.homeworkCompletion}%`, icon: BookOpen },
              { key: 'includeCalcBook', label: '연산교재 숙제 완성도', val: `${data.calcBookCompletion}%`, icon: Calculator },
              { key: 'includeProgressBook', label: '진도교재 채점결과', val: `${data.progressBookScore}점`, icon: FileCheck },
              { key: 'includeWorksheet', label: '학습지 풀이 결과', val: `${data.worksheetScore}점`, icon: FileCheck },
              { key: 'includeUnitExam', label: '단원평가/모의고사', val: `${data.unitExamScore ?? '-'}점`, icon: Award },
              { key: 'includeGoalRate', label: '일일 목표 완성률', val: `${data.targetGoalRate}%`, icon: Sparkles },
            ].map(({ key, label, val, icon: Icon }) => {
              const isChecked = (checkedOptions as any)[key];
              return (
                <div
                  key={key}
                  onClick={() => toggleOption(key as any)}
                  className={`flex items-center justify-between p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                    isChecked
                      ? 'bg-indigo-50/70 border-indigo-300 text-indigo-950 font-semibold'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isChecked ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4 text-slate-300" />}
                    <Icon className="w-3.5 h-3.5" />
                    <span>{label}</span>
                  </div>
                  <span className="font-mono">{val}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 교사 입력 데이터 (출결 & 수업 태도) */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
            2. 출결 및 수업 태도 체크
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                  <span>출결 상태</span>
                </span>
                <button
                  type="button"
                  onClick={() => toggleOption('includeAttendance')}
                  className="text-[10px] text-indigo-600 font-semibold flex items-center gap-0.5 cursor-pointer"
                >
                  {checkedOptions.includeAttendance ? <CheckSquare className="w-3 h-3 text-indigo-600" /> : <Square className="w-3 h-3 text-slate-300" />}
                  <span>포함</span>
                </button>
              </div>
              <select
                value={data.attendance}
                onChange={(e) => setData({ ...data, attendance: e.target.value as any })}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-slate-50 font-semibold focus:bg-white focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ON_TIME">정시 출석</option>
                <option value="LATE">지각</option>
                <option value="ABSENT">결석</option>
                <option value="MAKEUP">보강 참석</option>
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>수업 집중력</span>
                </span>
                <button
                  type="button"
                  onClick={() => toggleOption('includeAttitude')}
                  className="text-[10px] text-indigo-600 font-semibold flex items-center gap-0.5 cursor-pointer"
                >
                  {checkedOptions.includeAttitude ? <CheckSquare className="w-3 h-3 text-indigo-600" /> : <Square className="w-3 h-3 text-slate-300" />}
                  <span>포함</span>
                </button>
              </div>
              <select
                value={data.concentrationGrade}
                onChange={(e) => setData({ ...data, concentrationGrade: e.target.value as any })}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-slate-50 font-semibold focus:bg-white focus:ring-2 focus:ring-indigo-500"
              >
                <option value="EXCELLENT">매우 우수</option>
                <option value="GOOD">양호</option>
                <option value="NORMAL">보통</option>
                <option value="NEEDS_CARE">주의 필요</option>
              </select>
            </div>
          </div>
          {data.attendance === 'LATE' && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-amber-700 font-medium">지각 시간(분):</span>
              <input
                type="number"
                min={1}
                max={180}
                value={data.lateMinutes}
                onChange={(e) => setData({ ...data, lateMinutes: parseInt(e.target.value, 10) || 0 })}
                className="w-20 p-1.5 text-xs rounded-lg border border-amber-300 bg-amber-50 font-mono text-center font-bold"
              />
              <span className="text-xs text-slate-500">분</span>
            </div>
          )}
        </div>

        {/* 선생님 코멘트 */}
        <div className="space-y-1.5 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">선생님 피드백 코멘트</span>
            <button
              type="button"
              onClick={() => toggleOption('includeComment')}
              className="text-[11px] text-indigo-600 font-semibold flex items-center gap-1 cursor-pointer"
            >
              {checkedOptions.includeComment ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
              <span>메시지에 포함</span>
            </button>
          </div>
          <textarea
            rows={3}
            value={data.teacherComment}
            onChange={(e) => setData({ ...data, teacherComment: e.target.value })}
            placeholder="오늘 학생의 학습 상태, 칭찬할 점, 보완할 점을 적어주세요."
            className="w-full p-3 rounded-xl border border-slate-200 text-xs text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>

        {/* 발신자(회신) 번호 설정 */}
        <div className="space-y-1 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">발신(회신) 번호 설정</span>
            <span className="text-[10px] text-slate-400">통신사 사전등록 발신번호</span>
          </div>
          <input
            type="tel"
            value={data.senderPhone || ''}
            onChange={(e) => setData({ ...data, senderPhone: e.target.value })}
            placeholder="학원 대표번호 (미입력 시 기본 등록번호 발송)"
            className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-mono text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
      </div>

      {/* 스마트폰 프리뷰 (알림톡 vs 문자메시지 동적 테마 전환) */}
      <div className="lg:col-span-5 flex flex-col items-center justify-start space-y-4">
        <div className="w-full max-w-[340px] bg-slate-900 p-4 rounded-[40px] shadow-2xl border-4 border-slate-800 text-slate-900 relative">
          <div className="w-28 h-4 bg-slate-800 rounded-full mx-auto mb-3" />
          
          {/* 채널별 스마트폰 상단바 헤더 */}
          {channel === 'ALIMTALK' ? (
            <div className="bg-[#fee500] rounded-t-2xl p-3 flex items-center justify-between border-b border-amber-300">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-900" />
                <span className="text-xs font-bold text-slate-900">카카오톡 알림톡 (InLevMath)</span>
              </div>
              <Smartphone className="w-4 h-4 text-slate-800" />
            </div>
          ) : (
            <div className="bg-blue-600 text-white rounded-t-2xl p-3 flex items-center justify-between border-b border-blue-700">
              <div className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" />
                <span className="text-xs font-bold">문자메시지 ({isLms ? 'LMS 장문' : 'SMS 단문'})</span>
              </div>
              <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-mono">
                {byteCount} / 2,000 Byte
              </span>
            </div>
          )}

          {/* 메시지 본문 말풍선 */}
          <div className={`p-4 rounded-b-2xl shadow-inner min-h-[380px] max-h-[440px] overflow-y-auto font-sans text-xs space-y-2 ${
            channel === 'ALIMTALK' ? 'bg-[#f7f7f7]' : 'bg-slate-100'
          }`}>
            <div className={`p-3.5 rounded-2xl shadow-xs border text-xs leading-relaxed ${
              channel === 'ALIMTALK' 
                ? 'bg-white border-slate-200 text-slate-800' 
                : 'bg-blue-50 border-blue-200 text-slate-900'
            }`}>
              <pre className="whitespace-pre-wrap font-sans text-[11px] text-slate-800 leading-relaxed break-keep">
                {messageText}
              </pre>
            </div>
          </div>
        </div>

        {/* 발송 버튼 */}
        <button
          onClick={handleSend}
          disabled={isSending}
          className={`w-full max-w-[340px] py-3.5 px-6 rounded-2xl text-sm font-bold shadow-lg flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
            channel === 'ALIMTALK'
              ? 'bg-amber-400 hover:bg-amber-500 text-slate-900 shadow-amber-500/20'
              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20'
          }`}
        >
          {channel === 'ALIMTALK' ? <MessageCircle className="w-4 h-4 fill-slate-900" /> : <Send className="w-4 h-4" />}
          <span>
            {isSending 
              ? '메시지 발송 처리 중...' 
              : channel === 'ALIMTALK' 
                ? '학부모 카카오 알림톡 발송하기' 
                : '학부모 일반 문자메시지(SMS/LMS) 발송하기'}
          </span>
        </button>
      </div>
    </div>
  );
};
