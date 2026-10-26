import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/product/empty-state";
import { Button } from "@/components/ui/button";

export default function AdminNotFound() {
  return (
    <EmptyState
      icon={SearchX}
      title="We couldn't find that page"
      description="It may have been removed, or it belongs to another institution."
      action={
        <Button asChild variant="secondary">
          <Link href="/admin">Go to overview</Link>
        </Button>
      }
    />
  );
}
