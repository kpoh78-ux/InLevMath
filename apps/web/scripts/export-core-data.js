const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex <= 0) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnv(path.resolve(__dirname, '../.env'));

const prisma = new PrismaClient();

async function main() {
  const backupDir = path.resolve(__dirname, '../backups');
  fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = path.join(backupDir, `core-data-backup-${timestamp}.json`);

  console.log('주요 데이터 백업을 시작합니다...');

  const teachers = await prisma.teacher.findMany({
    include: {
      user: true,
      students: { include: { user: true } },
      worksheets: true,
      textbooks: true,
      rewardItems: true,
      schedules: true,
    },
  });

  const worksheets = await prisma.worksheet.findMany({
    include: { teacher: { select: { id: true, userId: true } } },
  });

  const textbookProblems = await prisma.textbookProblem.findMany();

  const worksheetDistributions = await prisma.worksheetDistribution.findMany({
    include: {
      worksheet: true,
      student: { include: { user: true } },
      result: true,
    },
  });

  const worksheetResults = await prisma.worksheetResult.findMany();
  const missionResults = await prisma.missionResult.findMany();

  const data = {
    teachers,
    worksheets,
    textbookProblems,
    worksheetDistributions,
    worksheetResults,
    missionResults,
  };

  fs.writeFileSync(filename, JSON.stringify(data, null, 2), 'utf8');

  console.log('주요 데이터 백업이 완료되었습니다.');
  console.log(`백업 파일: ${filename}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
