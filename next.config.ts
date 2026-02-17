import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude canvas (optional pdfjs-dist dep) from server bundle
  serverExternalPackages: ["canvas"],
};

export default nextConfig;
