import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Workspace package — needed so Next can transpile @udtl/db from packages/
  transpilePackages: ["@udtl/db"],
};

export default config;
