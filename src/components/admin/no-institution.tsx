import { Building2 } from "lucide-react";
import { EmptyState } from "@/components/product/empty-state";

/** An admin account that isn't linked to an institution yet. */
export function NoInstitution() {
  return (
    <EmptyState
      icon={Building2}
      title="Your account isn't linked to an institution yet"
      description="Write to the SafeSight team and we'll connect it. Then your departments, teachers and courses show up here."
    />
  );
}
