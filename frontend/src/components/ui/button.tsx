import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

// Tactile feedback: buttons sink 1px on press instead of glowing.
const button = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold select-none " +
    "transition-[background-color,box-shadow,transform,color] duration-[var(--duration-fast)] " +
    "active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[1.15em] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-teal-600 text-white shadow-[var(--shadow-glow-teal)] hover:bg-teal-700 hover:-translate-y-px active:shadow-none",
        slate: "bg-slate-800 text-chalk shadow-[var(--shadow-glow-slate)] hover:bg-slate-700 hover:-translate-y-px active:shadow-none",
        secondary: "bg-card text-ink border border-line-strong hover:bg-chalk-dim hover:border-ink-faint",
        ghost: "text-ink hover:bg-chalk-dim",
        danger: "bg-danger-700 text-white shadow-[0_2px_0_#7a2a1f] hover:brightness-110 active:shadow-none",
        dangerOutline: "border border-danger-700/40 text-danger-700 bg-card hover:bg-danger-100",
        chalk: "bg-chalk/10 text-chalk border border-chalk/25 hover:bg-chalk/20",
        link: "text-teal-700 underline-offset-4 hover:underline px-0 h-auto",
      },
      size: {
        sm: "h-9 px-3 text-sm rounded-[var(--radius-sm)]",
        md: "h-11 px-4 text-[15px] rounded-[var(--radius-md)]",
        lg: "h-13 px-6 text-base rounded-[var(--radius-md)]",
        xl: "min-h-16 px-6 text-lg rounded-[var(--radius-lg)]",
        icon: "size-11 rounded-[var(--radius-md)]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(button({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Loader2 className="animate-spin" aria-hidden />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";
