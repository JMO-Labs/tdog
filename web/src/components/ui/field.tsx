import { cloneElement, useId, type ReactElement, type ReactNode } from "react";

type Props = {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactElement<Record<string, unknown>>;
};

/** Label above the control; error (role=alert) replaces the hint. */
export function Field({ label, hint, error, children }: Props) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;
  const control = cloneElement(children, {
    id,
    "aria-describedby": note ? noteId : undefined,
    "aria-invalid": error ? true : undefined,
  });
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {control}
      {note && (
        <span
          id={noteId}
          role={error ? "alert" : undefined}
          className={error ? "field-error" : "field-hint"}
        >
          {note}
        </span>
      )}
    </div>
  );
}
