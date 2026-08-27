-- 숙제 지정 시각. null이면 수업 중 푸는 일반 배포다.
-- 배포한 뒤 학생별 학습지 목록에서 체크해 지정한다.
--
-- prisma migrate dev 는 이 DB에서 스키마 리셋을 요구한다 (마이그레이션 이력에 없는
-- 테이블이 db push 로 만들어져 있어 드리프트가 있다). 그래서 손으로 작성해
-- migrate deploy 로만 적용한다.
ALTER TABLE "WorksheetDistribution" ADD COLUMN "homeworkAt" TIMESTAMP(3);
