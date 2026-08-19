import type { NextConfig } from "next";

// PDPA (個資法) 第20-1條 non-government security-safeguard obligation is a general
// duty, not a specific technical checklist — these are the standard, low-risk headers
// that address it without needing a full Content-Security-Policy (which would need
// careful allowlisting for the ECPay auto-submit form's inline <script> and the Google
// Maps embed, and is a separate follow-up rather than something to bolt on here).
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
