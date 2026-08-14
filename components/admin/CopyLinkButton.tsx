"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-sm">{url}</span>
      <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
        {copied ? "已複製" : "複製連結"}
      </Button>
    </div>
  );
}
