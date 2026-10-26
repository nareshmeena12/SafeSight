"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteDepartment } from "@/lib/admin/actions";

/** Asks first: teachers and courses stay, but lose the department and its policy. */
export function DeleteDepartment({ department }: { department: { id: string; name: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Trash2 aria-hidden="true" />
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {department.name}?</DialogTitle>
          <DialogDescription>
            Its teachers and courses stay as they are, without a department, and follow the college default policy from now on.
            Its own AI policy is removed.
          </DialogDescription>
        </DialogHeader>
        <form action={deleteDepartment}>
          <input type="hidden" name="departmentId" value={department.id} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Keep it
            </Button>
            <Button type="submit" variant="destructive">
              Delete department
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
