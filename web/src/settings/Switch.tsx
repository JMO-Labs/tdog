export function Switch({
  checked,
  onChange,
  labelledBy,
  disabled,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  labelledBy: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}
