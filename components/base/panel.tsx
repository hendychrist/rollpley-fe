import type { HTMLAttributes, ReactNode } from "react";

export function Panel({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <section className={`panel ${className}`} {...props} />;
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="page-header">
      <div><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>
      {action ? <div className="page-header__action">{action}</div> : null}
    </header>
  );
}
