"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteAssignment } from "@/lib/teacher/actions";

/** Deleting removes submitted work too, so it always asks first. */
export function DeleteAssignment({ courseId, assignment }: { courseId: string; assignment: { id: string; title: string } }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Delete ${assignment.title}`}>
          <Trash2 aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{assignment.title}”?</DialogTitle>
          <DialogDescription>
            Students&apos; submissions for this assignment are deleted too. Their Sage chats stay in their history.
            This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <form action={deleteAssignment}>
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="assignmentId" value={assignment.id} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Keep it
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive">
              Delete assignment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
