"use client";

import { Check, Inbox, Mail, Trash2 } from "lucide-react";

import { deleteMessageAction, markMessageReadAction } from "./actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { ContactMessage } from "@/lib/vault/contact/repository";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});

function MessageCard({ message }: { message: ContactMessage }) {
  const isNew = message.status === "new";

  return (
    <Card className="glass-content">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="truncate text-base">{message.name}</CardTitle>
            {isNew ? <Badge>Mới</Badge> : null}
            <Badge variant="outline">{message.locale.toUpperCase()}</Badge>
          </div>
          <CardDescription className="mt-1">
            <a
              className="wrap-anywhere underline underline-offset-4"
              href={`mailto:${message.email}`}
            >
              {message.email}
            </a>
            {" · "}
            <time dateTime={message.createdAt}>
              {dateFormatter.format(new Date(message.createdAt))}
            </time>
          </CardDescription>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              aria-label={`Xóa tin nhắn của ${message.name}`}
              size="icon"
              variant="ghost"
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Xóa tin nhắn của {message.name}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Tin nhắn sẽ bị xóa vĩnh viễn khỏi database. Hành động này không
                thể hoàn tác.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Giữ lại</AlertDialogCancel>
              <form action={deleteMessageAction}>
                <input name="id" type="hidden" value={message.id} />
                <AlertDialogAction asChild>
                  <Button
                    className="w-full"
                    type="submit"
                    variant="destructive"
                  >
                    <Trash2 data-icon="inline-start" />
                    Xóa tin nhắn
                  </Button>
                </AlertDialogAction>
              </form>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* React escapes the text; whitespace-pre-wrap keeps the sender's line breaks. */}
        <p className="text-sm leading-6 wrap-anywhere whitespace-pre-wrap">
          {message.message}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild className="min-h-11" size="sm" variant="outline">
            <a href={`mailto:${message.email}`}>
              <Mail data-icon="inline-start" />
              Trả lời qua email
            </a>
          </Button>
          {isNew ? (
            <form action={markMessageReadAction}>
              <input name="id" type="hidden" value={message.id} />
              <Button
                className="min-h-11"
                size="sm"
                type="submit"
                variant="ghost"
              >
                <Check data-icon="inline-start" />
                Đánh dấu đã đọc
              </Button>
            </form>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function MessagesPanel({
  loadFailed,
  messages,
}: {
  loadFailed: boolean;
  messages: readonly ContactMessage[];
}) {
  const unread = messages.filter(({ status }) => status === "new").length;

  return (
    <section
      aria-labelledby="vault-messages-title"
      className="flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold" id="vault-messages-title">
            Tin nhắn liên hệ từ winlax.id.vn
          </h2>
          <p className="text-sm text-base-content/50">Form liên hệ trên web lưu vào đây.</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline">{messages.length} tin nhắn</Badge>
          {unread > 0 ? <Badge>{unread} mới</Badge> : null}
        </div>
      </div>

      {loadFailed ? (
        <Alert variant="destructive">
          <AlertDescription>
            Chưa tải được tin nhắn. Hãy chắc chắn đã chạy migration
            <code className="mx-1">
              20261017000000_security_events_and_contact.sql
            </code>
            trong database.
          </AlertDescription>
        </Alert>
      ) : messages.length === 0 ? (
        <Empty className="glass-content min-h-48 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Inbox aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Chưa có tin nhắn</EmptyTitle>
            <EmptyDescription>
              Tin nhắn gửi từ form ở trang Dịch vụ sẽ xuất hiện tại đây.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {messages.map((message) => (
            <MessageCard key={message.id} message={message} />
          ))}
        </div>
      )}
    </section>
  );
}
