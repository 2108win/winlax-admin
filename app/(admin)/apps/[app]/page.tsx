import { notFound } from "next/navigation";

import { AppPanel } from "@/components/app-panel";
import { getApp } from "@/lib/server/apps";

export default async function AppPage({ params }: { params: Promise<{ app: string }> }) {
  const app = await getApp((await params).app);
  if (!app) notFound();
  return <AppPanel key={app.name} app={app.name} />;
}
