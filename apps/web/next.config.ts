import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@inlevmath/shared"],
  serverExternalPackages: ["pdfjs-dist", "canvas"],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
  turbopack: {
    resolveAlias: {
      canvas: './src/lib/empty-module.ts',
    },
  },
};

export default nextConfig;
