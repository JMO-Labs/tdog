import { useState } from "react";
import { Button, IconButton } from "../components/ui/button";
import { Field } from "../components/ui/field";
import { Input } from "../components/ui/input";
import { SegmentedControl } from "../components/ui/segmented";
import { Select } from "../components/ui/select";
import { Slider } from "../components/ui/slider";
import { Switch } from "../components/ui/switch";

const X = (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path
      d="M5 5l10 10M15 5L5 15"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
    />
  </svg>
);

function Panel({ theme }: { theme: "light" | "dark" }) {
  const [on, setOn] = useState(true);
  const [off, setOff] = useState(false);
  const [size, setSize] = useState(14);
  const [seg, setSeg] = useState("dark");
  return (
    <section
      data-theme={theme}
      style={{
        background: "var(--bg)",
        color: "var(--fg)",
        padding: 24,
        display: "grid",
        gap: 20,
        alignContent: "start",
      }}
    >
      <h2 style={{ font: "400 26px var(--display)", margin: 0 }}>{theme}</h2>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <Button>Default</Button>
        <Button variant="primary">Primary</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="ghost">Ghost</Button>
        <Button size="sm">Small</Button>
        <Button disabled>Disabled</Button>
      </div>
      <div style={{ display: "flex", gap: 14 }}>
        <IconButton label="Close">{X}</IconButton>
        <IconButton label="Delete" variant="danger">
          {X}
        </IconButton>
        <IconButton label="Close small" size="sm">
          {X}
        </IconButton>
      </div>
      <Field label="Host" hint="Where tdog runs">
        <Input placeholder="localhost" />
      </Field>
      <Field label="Password" error="Wrong password">
        <Input type="password" defaultValue="nope" />
      </Field>
      <div style={{ display: "flex", gap: 14 }}>
        <Switch checked={on} onCheckedChange={setOn} aria-label="On" />
        <Switch checked={off} onCheckedChange={setOff} aria-label="Off" />
      </div>
      <Field label="Font">
        <Select defaultValue="jb">
          <option value="jb">JetBrains Mono</option>
          <option value="lil">Lilita One</option>
        </Select>
      </Field>
      <Field label={`Size ${size}`}>
        <Slider min={10} max={24} value={size} onValueChange={setSize} />
      </Field>
      <SegmentedControl
        aria-label={`Theme (${theme})`}
        options={[
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
          { value: "system", label: "System" },
        ]}
        value={seg}
        onValueChange={setSeg}
      />
    </section>
  );
}

export function KitPage() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
        minHeight: "100vh",
      }}
    >
      <Panel theme="light" />
      <Panel theme="dark" />
    </div>
  );
}
