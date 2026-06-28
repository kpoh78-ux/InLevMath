import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const phone = '01086200158'
  const password = 'math2358'
  const name = '오근표'

  const hashed = await bcrypt.hash(password, 12)

  // 기존 계정이 있으면 업데이트, 없으면 생성
  const user = await prisma.user.upsert({
    where: { phone },
    update: { password: hashed, name },
    create: {
      phone,
      password: hashed,
      name,
      role: 'teacher',
      teacher: { create: {} },
    },
    include: { teacher: true },
  })

  console.log(`✅ 선생님 계정 완료: ${user.name} / ${user.phone}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
