import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full border border-transparent px-2.5 text-eyebrow whitespace-nowrap transition-colors [&>svg]:pointer-events-none [&>svg]:size-3! [&>svg]:stroke-[1.5]",
  {
    variants: {
      variant: {
        default: "bg-primary-soft text-primary",
        solid: "bg-primary text-primary-foreground",
        secondary: "border-border bg-surface text-muted-foreground",
        outline: "border-border text-foreground",
        // Insight amber: once per screen.
        insight: "bg-insight text-on-insight",
        // States carry their colour in a dot and always have a text label, so
        // the text stays at AA contrast in both themes.
        good: "border-border bg-surface text-foreground before:size-1.5 before:rounded-full before:bg-good",
        warning:
          "border-border bg-surface text-foreground before:size-1.5 before:rounded-full before:bg-warning",
        critical:
          "border-border bg-surface text-foreground before:size-1.5 before:rounded-full before:bg-critical",
        destructive: "bg-destructive/10 text-destructive",
        ghost: "hover:bg-hover",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
