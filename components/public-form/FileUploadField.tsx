"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } from "@/lib/uploadConstants";

export function FileUploadField({
  sessionId,
  fileType,
  storagePath,
  onUploaded,
  onRemove,
}: {
  sessionId: string;
  fileType: string;
  storagePath: string | null;
  onUploaded: (path: string) => void;
  onRemove: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`檔案大小超過 ${MAX_FILE_SIZE_MB}MB 限制，請重新選擇`);
      e.target.value = "";
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const res = await fetch("/api/storage/signed-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          fileType,
          contentType: file.type,
          fileSize: file.size,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "上傳失敗");
      }

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("registration-files")
        .uploadToSignedUrl(json.path, json.token, file);

      if (uploadError) {
        throw uploadError;
      }

      setFileName(file.name);
      onUploaded(json.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上傳失敗");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="grid gap-1">
      {storagePath ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-foreground">已上傳{fileName ? `：${fileName}` : ""}</span>
          <button
            type="button"
            className="text-destructive underline"
            onClick={() => {
              setFileName(null);
              onRemove();
            }}
          >
            移除重新上傳
          </button>
        </div>
      ) : (
        <>
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            disabled={uploading}
            onChange={handleFileChange}
          />
          <p className="text-muted-foreground text-xs">檔案大小上限 {MAX_FILE_SIZE_MB}MB</p>
        </>
      )}
      {uploading && <p className="text-muted-foreground text-sm">上傳中...</p>}
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
