// Adapted presentation conventions from REIBRY ui/primitives.tsx and globals.css.
// Original contributors retain attribution; source commit 76d3494465bab43a5051498e90b9a486a65312b9.
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes } from "react";
export function Container({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={"container " + className} {...props} />;
}
export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={"card " + className} {...props} />;
}
export function Button({ variant = "primary", className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  return <button type={type} className={"button btn-" + variant + " " + className} {...props} />;
}
export function TextField({ id, label, hint, className = "", "aria-describedby": describedBy, ...props }: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; hint?: string }) {
  const description = [describedBy, hint ? id + "-hint" : undefined].filter(Boolean).join(" ") || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className={"input " + className} aria-describedby={description} {...props} />
      {hint && <p className="field-hint" id={id + "-hint"}>{hint}</p>}
    </div>
  );
}
export function Skeleton() { return <span className="skeleton" aria-hidden="true" />; }
