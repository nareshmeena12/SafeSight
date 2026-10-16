"use client";

import { MoreHorizontal, Send, Trash2 } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ModeSelect() {
  return (
    <div className="grid gap-2">
      <Label htmlFor="design-mode">AI mode</Label>
      <Select defaultValue="learn">
        <SelectTrigger id="design-mode" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="learn">Learn — hints only</SelectItem>
          <SelectItem value="assist">Assist — explanations allowed</SelectItem>
          <SelectItem value="exam">Exam — AI off</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export function SwitchRow() {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4">
      <Label htmlFor="design-switch" className="leading-snug">
        Let students share a chat with me
      </Label>
      <Switch id="design-switch" defaultChecked />
    </div>
  );
}

export function TabsDemo() {
  return (
    <Tabs defaultValue="week">
      <TabsList>
        <TabsTrigger value="week">This week</TabsTrigger>
        <TabsTrigger value="month">This month</TabsTrigger>
        <TabsTrigger value="term">Term</TabsTrigger>
      </TabsList>
      <TabsContent value="week" className="pt-2 text-small text-muted-foreground">
        212 conversations across 2 courses.
      </TabsContent>
      <TabsContent value="month" className="pt-2 text-small text-muted-foreground">
        846 conversations across 2 courses.
      </TabsContent>
      <TabsContent value="term" className="pt-2 text-small text-muted-foreground">
        Term totals appear after four weeks of use.
      </TabsContent>
    </Tabs>
  );
}

export function LineTabsDemo() {
  return (
    <Tabs defaultValue="summary">
      <TabsList variant="line">
        <TabsTrigger value="summary">Summary</TabsTrigger>
        <TabsTrigger value="replay">Replay</TabsTrigger>
        <TabsTrigger value="chats">Chats</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

export function Overlays() {
  return (
    <div className="flex flex-wrap gap-3">
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="secondary">Open dialog</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve this flag?</DialogTitle>
            <DialogDescription>
              Riya will not be notified. You can reopen it from the Flags page.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button>Resolve</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" aria-label="Student actions">
            <MoreHorizontal strokeWidth={1.5} />
            Menu
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          <DropdownMenuLabel>Arjun Mehta</DropdownMenuLabel>
          <DropdownMenuItem>
            <Send strokeWidth={1.5} />
            Draft a message
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive">
            <Trash2 strokeWidth={1.5} />
            Remove from course
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet>
        <SheetTrigger asChild>
          <Button variant="secondary">Open sheet</Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Thermodynamics problem set 3</SheetTitle>
            <SheetDescription>Due Friday, 6 pm · Learn mode</SheetDescription>
          </SheetHeader>
          <p className="px-4 text-small text-muted-foreground">
            Sheets slide in from the side on phones: the app menu uses one.
          </p>
        </SheetContent>
      </Sheet>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost">Hover for tooltip</Button>
        </TooltipTrigger>
        <TooltipContent>Hint 2 of 5</TooltipContent>
      </Tooltip>
    </div>
  );
}
