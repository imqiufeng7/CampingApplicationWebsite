"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { updateSessionBanner } from "@/app/admin/(protected)/series/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function bannerUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl}/storage/v1/object/public/session-assets/${path}`;
}

export function BannerUploadField({
  seriesId,
  sessionId,
  bannerImagePath,
}: {
  seriesId: string;
  sessionId: string;
  bannerImagePath: string | null;
}) {
  const [uploading, setUploading] = useState(false);
  const router = useRouter();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = EXTENSION_BY_TYPE[file.type];
    if (!extension) {
      toast.error("僅支援 JPG / PNG / WebP 圖片");
      e.target.value = "";
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const path = `${sessionId}/banner.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("session-assets")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) {
        toast.error(uploadError.message);
        return;
      }

      const result = await updateSessionBanner(seriesId, sessionId, path);
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Banner 已更新");
      router.refresh();
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleRemove() {
    const result = await updateSessionBanner(seriesId, sessionId, null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor="banner">活動視覺 Banner</Label>
      {bannerImagePath && (
        <div className="grid gap-2">
          <div className="relative h-40 w-full max-w-md overflow-hidden rounded-lg border">
            <Image
              src={bannerUrl(supabaseUrl, bannerImagePath)}
              alt="活動 banner"
              fill
              sizes="448px"
              className="object-cover"
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleRemove} className="w-fit">
            移除 Banner
          </Button>
        </div>
      )}
      <Input
        id="banner"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={uploading}
        onChange={handleFileChange}
      />
      {uploading && <p className="text-muted-foreground text-sm">上傳中...</p>}
    </div>
  );
}
