import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // isomorphic-dompurify pulls in jsdom for server-side HTML sanitization
  // (lib/sanitizeHtml.ts) — jsdom's own dependency chain (html-encoding-sniffer ->
  // @exodus/bytes) ships an ESM file that Turbopack's bundler can't require() when
  // bundled inline. Marking both packages external makes Next.js load them via
  // native Node require at runtime instead of bundling them, which avoids the
  // ERR_REQUIRE_ESM crash entirely (this was crashing every public form page that
  // renders vendor-authored rich text: 場次介紹/規則/成功頁文字 etc via RichContent).
  serverExternalPackages: ["isomorphic-dompurify", "jsdom"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
