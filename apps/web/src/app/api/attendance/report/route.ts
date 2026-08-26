import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { academyTeacher } from '@/lib/academy';
import {
  buildAttendanceReport,
  sendAttendanceReport,
  ReportScope,
} from '@/lib/attendanceReport';
import { isAlimtalkConfigured } from '@/lib/kakaoBizmsg';

export const dynamic = 'force-dynamic';

function parseScope(value: string | null): ReportScope {
  return value === 'MONTHLY' ? 'MONTHLY' : 'DAILY';
}

async function resolveTeacher(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user || user.role !== 'teacher') return null;
  return academyTeacher(user.sub);
}

/** 발송 전 미리보기 — 대상 학생과 문구를 돌려준다 */
export async function GET(req: NextRequest) {
  try {
    const teacher = await resolveTeacher(req);
    if (!teacher) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const { searchParams } = req.nextUrl;
    const scope = parseScope(searchParams.get('scope'));
    const now = new Date();

    const rows = await buildAttendanceReport({
      teacherId: teacher.id,
      scope,
      date: searchParams.get('date') || undefined,
      year: parseInt(searchParams.get('year') || String(now.getFullYear()), 10),
      month: parseInt(searchParams.get('month') || String(now.getMonth() + 1), 10),
    });

    return NextResponse.json({ scope, rows, configured: isAlimtalkConfigured() });
  } catch (error) {
    const message = error instanceof Error ? error.message : '출결 리포트 조회 실패';
    console.error('Attendance report error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** 실제 발송 — 미연동 상태면 전부 미발송으로 기록된다 */
export async function POST(req: NextRequest) {
  try {
    const teacher = await resolveTeacher(req);
    if (!teacher) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const body = await req.json();
    const scope = parseScope(body.scope);
    const studentIds: string[] = Array.isArray(body.studentIds) ? body.studentIds : [];

    const allRows = await buildAttendanceReport({
      teacherId: teacher.id,
      scope,
      date: body.date,
      year: body.year,
      month: body.month,
    });

    const rows = studentIds.length > 0 ? allRows.filter((r) => studentIds.includes(r.studentId)) : allRows;

    if (rows.length === 0) {
      return NextResponse.json({ error: '발송 대상이 없습니다.' }, { status: 400 });
    }

    const results = await sendAttendanceReport(rows, scope);
    const sent = results.filter((r) => r.success).length;

    return NextResponse.json({
      scope,
      total: results.length,
      sent,
      failed: results.length - sent,
      configured: isAlimtalkConfigured(),
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '출결 리포트 발송 실패';
    console.error('Attendance report send error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
