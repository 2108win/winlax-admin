import { Skeleton } from "@/components/ui/skeleton";

export default function TwoFactorLoading() {
  return (
    <main
      className="flex min-h-[68dvh] items-center justify-center"
      id="main-content"
    >
      <div className="flex w-full max-w-md flex-col gap-4">
        <Skeleton className="mx-auto size-12 rounded-xl" />
        <Skeleton className="mx-auto h-8 w-48" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    </main>
  );
}
