import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-label whitespace-nowrap transition-[transform,background-color,border-color,color] duration-150 ease-out outline-none select-none active:not-aria-[haspopup]:scale-[.98] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg]:stroke-[1.5]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary:
          "border-border bg-surface text-foreground hover:border-border-strong [&_svg]:text-primary",
        outline:
          "border-border bg-transparent text-foreground hover:bg-hover aria-expanded:bg-hover",
        ghost:
          "text-muted-foreground hover:bg-hover hover:text-foreground aria-expanded:bg-hover aria-expanded:text-foreground",
        // Insight amber: the single most important action on a screen, if any.
        insight: "bg-insight text-on-insight hover:brightness-95",
        destructive:
          "border-destructive/30 bg-surface text-destructive hover:bg-destructive/10",
        link: "h-auto! px-0! text-primary underline-offset-4 hover:underline",
      },
      size: {
        // 44px: the minimum touch target (CLAUDE.md → Design).
        default: "h-11 gap-2 px-4",
        sm: "h-9 gap-1.5 rounded-sm px-3 [&_svg:not([class*='size-'])]:size-3.5",
        xs: "h-7 gap-1 rounded-sm px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        lg: "h-12 gap-2 px-5 text-[15px]",
        icon: "size-11",
        "icon-xs": "size-7 rounded-sm [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9 rounded-sm",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
