import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { backupDir } from '@/lib/backupDir'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// GET /api/backup/core — 대용량 코어 데이터 청크 스트리밍 백업 (OOM 방지)
export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const backupsDir = backupDir()
    fs.mkdirSync(backupsDir, { recursive: true })

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `inlevmath_backup_${timestamp}.json`
    const filepath = path.join(backupsDir, filename)

    // 로컬 보관용 파일 스트림
    const fileStream = fs.createWriteStream(filepath, { encoding: 'utf8' })
    const encoder = new TextEncoder()

    // ✅ ReadableStream 스트리밍 응답으로 메모리 사용량을 극소화 (OOM 방지)
    const stream = new ReadableStream({
      async start(controller) {
        const pushChunk = (text: string) => {
          fileStream.write(text)
          controller.enqueue(encoder.encode(text))
        }

        try {
          // 1. 헤더 청크
          pushChunk('{\n"version": "1.0",\n"exportedAt": "' + new Date().toISOString() + '",\n')

          // 2. 교사 및 학생 데이터 청크 스트림
          pushChunk('"teachers": ')
          const teachers = await prisma.teacher.findMany({
            include: {
              user: { select: { id: true, name: true, phone: true, role: true } },
              students: {
                include: {
                  user: { select: { id: true, name: true, phone: true, role: true } },
                },
              },
              rewardItems: true,
              schedules: true,
            },
          })
          pushChunk(JSON.stringify(teachers) + ',\n')

          // 3. 학습지 데이터 청크 스트림
          pushChunk('"worksheets": ')
          const worksheets = await prisma.worksheet.findMany({
            include: { teacher: { select: { id: true, userId: true } } },
          })
          pushChunk(JSON.stringify(worksheets) + ',\n')

          // 4. 교재 및 문항 데이터 청크 스트림
          pushChunk('"textbooks": ')
          const textbooks = await prisma.textbook.findMany({
            include: { teacher: { select: { id: true, userId: true } } },
          })
          pushChunk(JSON.stringify(textbooks) + ',\n')

          pushChunk('"textbookProblems": ')
          const textbookProblems = await prisma.textbookProblem.findMany()
          pushChunk(JSON.stringify(textbookProblems) + ',\n')

          // 5. 배포 및 채점 결과 청크 스트림
          pushChunk('"worksheetDistributions": ')
          const worksheetDistributions = await prisma.worksheetDistribution.findMany({
            include: {
              worksheet: { select: { id: true, title: true, step: true } },
              student: { include: { user: { select: { name: true } } } },
              result: true,
            },
          })
          pushChunk(JSON.stringify(worksheetDistributions) + ',\n')

          pushChunk('"worksheetResults": ')
          const worksheetResults = await prisma.worksheetResult.findMany()
          pushChunk(JSON.stringify(worksheetResults) + ',\n')

          // 6. 미션 결과 청크 스트림
          pushChunk('"missionResults": ')
          const missionResults = await prisma.missionResult.findMany()
          pushChunk(JSON.stringify(missionResults) + '\n}')

          fileStream.end()
          controller.close()
        } catch (err) {
          fileStream.destroy()
          controller.error(err)
        }
      },
    })

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Backup-Path': encodeURIComponent(filepath),
        'Access-Control-Expose-Headers': 'X-Backup-Path',
      },
    })
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: '주요 데이터 백업에 실패했습니다.', detail }, { status: 500 })
  }
}
