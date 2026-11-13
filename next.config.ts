import { execFileSync } from "node:child_process";
import type { NextConfig } from "next";

// Every instance builds independently, so they must agree on the build ID or
// pages from one instance request /_next/static assets another lacks
// (docs/GROUP_ARCHITECTURE.md, D4). infra/bootstrap.sh exports GIT_COMMIT.
function commitSha() {
  const fromEnv = process.env.GIT_COMMIT?.trim();
  if (fromEnv) return fromEnv;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null; // No git: Next.js generates a random ID.
  }
}

const nextConfig: NextConfig = {
  // Keep development startup from generating repository instruction files.
  agentRules: false,
  allowedDevOrigins: ["127.0.0.1"],
  generateBuildId: async () => commitSha(),
};
export default nextConfig;
