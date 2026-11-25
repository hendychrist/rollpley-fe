import { LoaderCircle } from "lucide-react";
import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; loadingLabel?: ReactNode }>(
  function Button(
    {
      variant = "primary",
      loading = false,
      loadingLabel,
      className = "",
      children,
      disabled,
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        className={`button button--${variant} ${className}`}
        disabled={disabled || loading}
        aria-busy={loading}
        {...props}
      >
        {loading ? <LoaderCircle aria-hidden className="spin" size={17} /> : null}
        {loading && loadingLabel != null ? loadingLabel : children}
      </button>
    );
  },
);
