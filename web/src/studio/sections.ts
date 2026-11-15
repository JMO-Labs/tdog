export type Field = { id: string; label: string };
export type Section = { id: string; label: string; fields: Field[] };

const f = (label: string): Field => ({
  id: label.toLowerCase().replace(/\W+/g, "-"),
  label,
});

export const SECTIONS: Section[] = [
  {
    id: "terminal",
    label: "Terminal design",
    fields: ["Font size", "Cursor style", "Theme", "Pane backdrop"].map(f),
  },
  {
    id: "scene",
    label: "Scene design",
    fields: ["Layout", "Gap between panes", "Terminal per slot"].map(f),
  },
  {
    id: "themes",
    label: "Themes",
    fields: ["Palette", "Accent colour", "Cursor colour"].map(f),
  },
  {
    id: "backgrounds",
    label: "Backgrounds",
    fields: ["Pattern", "Tint", "Glyph rain"].map(f),
  },
  {
    id: "fonts",
    label: "Fonts",
    fields: ["Font family", "Font size", "Ligatures"].map(f),
  },
];

const has = (text: string, q: string) => text.toLowerCase().includes(q);

/** VS Code-style filter: a section stays when its label or any field matches. */
export function filterSections(query: string): {
  section: Section;
  fields: Field[];
}[] {
  const q = query.trim().toLowerCase();
  return SECTIONS.flatMap((section) => {
    const fields = section.fields.filter((x) => has(x.label, q));
    return !q || has(section.label, q) || fields.length
      ? [{ section, fields: q ? fields : [] }]
      : [];
  });
}

export const hashFor = (id: string) => `#studio/${id}`;
export function sectionFromHash(hash: string): string | null {
  const m = /^#studio(?:\/([\w-]+))?$/.exec(hash);
  if (!m) return null;
  return SECTIONS.some((s) => s.id === m[1]) ? m[1] : SECTIONS[0].id;
}
