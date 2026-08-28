import type { NextConfig } from "next";

// PDPA (個資法) 第20-1條 non-government security-safeguard obligation is a general
// duty, not a specific technical checklist — these are the standard, low-risk headers
// that address it.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// Report-Only for now — logs violations to each visitor's own browser console without
// blocking anything, so this can ship without risk while we watch for surprises over a
// few days before switching to a real (enforcing) Content-Security-Policy header.
// 'unsafe-inline' on script-src/style-src is broader than ideal, but matches two real,
// already-in-use spots rather than pretending they don't exist:
//   - app/api/payments/ecpay/checkout/[registrationId]/route.ts hand-renders a plain
//     HTML page with an inline <script> that auto-submits ECPay's payment form (ECPay's
//     AIO Checkout has no GET-redirect API, so this is the standard integration shape).
//   - inline style="" attributes are used throughout (TipTap's text-color marks, the
//     admin dashboard's per-session accent colors, etc.).
// Tightening these to nonces/hashes is a real follow-up, just not this pass's scope.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co",
  "frame-src https://www.google.com",
  "form-action 'self' https://payment.ecpay.com.tw https://payment-stage.ecpay.com.tw",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

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
        headers: [
          ...securityHeaders,
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
      {
        // Both pages read security-relevant state from the URL client-side (the
        // session-timeout reason banner; the one-time invite token) after a static
        // HTML shell loads — a CDN-cached shell is otherwise indistinguishable from a
        // fresh one until hydration runs, so force revalidation on every request.
        source: "/admin/(login|accept-invite)",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
