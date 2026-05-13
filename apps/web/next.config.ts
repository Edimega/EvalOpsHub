import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@evalops/core", "@evalops/db"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb"
    }
  }
};

export default nextConfig;
