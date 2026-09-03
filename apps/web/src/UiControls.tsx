import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

type IconName = "add" | "check" | "close" | "delete" | "drag" | "edit" | "more" | "replay";

const paths: Record<IconName, ReactNode> = {
  add: <><path d="M12 5v14M5 12h14" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  delete: <><path d="M5 7h14M9 7V4h6v3M8 7l1 13h6l1-13" /></>,
  drag: <><circle cx="9" cy="7" r="1" /><circle cx="15" cy="7" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="9" cy="17" r="1" /><circle cx="15" cy="17" r="1" /></>,
  edit: <><path d="m4 20 4.2-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" /><path d="m14 7 3 3" /></>,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  replay: <><path d="M4 9V4m0 0h5M4 4l4 4" /><path d="M5.5 15a7 7 0 1 0 1-8" /></>,
};

export function UiIcon({ name }: { name: IconName }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export function IconButton({ icon, label, tone = "quiet", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; tone?: "quiet" | "danger" }) {
  return <button {...props} type={props.type || "button"} className={`ui-icon-button ${tone === "danger" ? "danger" : ""} ${className}`} aria-label={label} title={label}><UiIcon name={icon} /></button>;
}

export function DragHandle({ label, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button {...props} type="button" className={`ui-drag-handle ${props.className || ""}`} aria-label={label} title={label}><UiIcon name="drag" /></button>;
}

export function SelectControl({ children, className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <span className={`ui-select ${className}`}><select {...props}>{children}</select></span>;
}

export function PageActionBar({ status, detail, children }: { status: string; detail?: string; children: ReactNode }) {
  return <footer className="page-action-bar"><div><strong>{status}</strong>{detail ? <span>{detail}</span> : null}</div><div className="page-action-buttons">{children}</div></footer>;
}

export function InlineNotice({ children, actionLabel, onAction, tone = "info" }: { children: ReactNode; actionLabel?: string; onAction?: () => void; tone?: "info" | "warning" | "error" }) {
  return <div className={`ui-inline-notice ${tone}`} role={tone === "error" ? "alert" : "status"}><span>{children}</span>{actionLabel && onAction ? <button type="button" onClick={onAction}>{actionLabel}</button> : null}</div>;
}
