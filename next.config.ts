import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  // Keep development startup from generating repository instruction files.
  agentRules: false,
  allowedDevOrigins: ["127.0.0.1"],
};
export default nextConfig;
