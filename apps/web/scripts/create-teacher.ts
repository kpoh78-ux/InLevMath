import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const phone = '01086200158'
  const password = 'math2358'
  const name = '오근표'

  const existing = await prisma.user.findUnique({ where: { phone } })
  if (existing) {
    console.log(`⚠️  이미 존재하는 계정: ${phone}`)
    console.log(`   name: ${existing.name}, role: ${existing.role}`)
    return
  }

  const hashed = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({
    data: {
      name,
      phone,
      password: hashed,
      role: 'teacher',
      teacher: { create: {} },
    },
    include: { teacher: true },
  })

  console.log('✅ 선생님 계정 생성 완료')
  console.log(`   이름: ${user.name}`)
  console.log(`   전화: ${user.phone}`)
  console.log(`   비번: ${password}`)
  console.log(`   역할: ${user.role}`)
  console.log(`   teacherId: ${user.teacher?.id}`)
}

main()
  .catch(e => { console.error('❌ 오류:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
