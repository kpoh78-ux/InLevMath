import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 모노레포의 shared 패키지를 Next.js가 트랜스파일하도록 설정
  transpilePackages: ["@inlevmath/shared"],
};

export default nextConfig;
