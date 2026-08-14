"use client";

import { useState } from "react";

export function FileViewLink({ fileId, label }: { fileId: string; label: string }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch(`/api/files/${fileId}/signed-url`);
      const json = await res.json();
      if (res.ok && json.url) {
        window.open(json.url, "_blank", "noopener,noreferrer");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="text-primary text-sm underline"
    >
      {loading ? "開啟中..." : label}
    </button>
  );
}
