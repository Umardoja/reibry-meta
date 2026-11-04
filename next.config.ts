import type { NextConfig } from "next";

// TEMPORARY (Stage 12J-2 private iPhone test over Tailscale Serve). Delete this file to restore the default configuration.
const nextConfig: NextConfig = {
  allowedDevOrigins: ["pc.tail4fe7d4.ts.net"],
  // Hide the development-only Next badge on the private phone-sized test shell; runtime errors still surface normally.
  devIndicators: false,
};

export default nextConfig;
