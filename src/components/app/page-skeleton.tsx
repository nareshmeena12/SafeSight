import { Skeleton } from "@/components/ui/skeleton";

/** Loading state for an app page: header, stat row and a panel. */
export function PageSkeleton() {
  return (
    <div className="grid gap-8" aria-busy="true" aria-label="Loading">
      <div className="grid gap-3">
        <Skeleton className="h-10 w-72 max-w-full" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}
