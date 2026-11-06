"use client";

import { Download } from "lucide-react";
import { useState, useTransition } from "react";

import { exportVaultBackupAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type Notice = Readonly<{ message: string; status: "error" | "success" }>;

export function BackupButton() {
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Notice | null>(null);

  const download = () => {
    startTransition(async () => {
      const result = await exportVaultBackupAction();
      if (result.status === "success" && result.backup) {
        const url = URL.createObjectURL(
          new Blob([result.backup.content], { type: "application/json" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = result.backup.filename;
        link.click();
        URL.revokeObjectURL(url);
      }
      setNotice({ message: result.message, status: result.status });
    });
  };

  return (
    <div className="flex flex-col items-start gap-1 md:items-end">
      <Button
        disabled={isPending}
        onClick={download}
        type="button"
        variant="outline"
      >
        {isPending ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <Download data-icon="inline-start" />
        )}
        Sao lưu
      </Button>
      {notice ? (
        <p
          className={
            notice.status === "error"
              ? "text-destructive text-xs"
              : "text-muted-foreground text-xs"
          }
          role="status"
        >
          {notice.message}
        </p>
      ) : null}
    </div>
  );
}
