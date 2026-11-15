import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Modal } from "../overlays/Modal";
import { Cassette } from "./Cassette";
import { ThemeGallery } from "./ThemeGallery";
import { SECTIONS, filterSections, hashFor, sectionFromHash } from "./sections";
import "./studio.css";

type Props = { open: boolean; onClose: () => void };

/** Full-screen Studio: nav + settings search (sections are placeholders). */
export function Studio({ open, onClose }: Props) {
  const [current, setCurrent] = useState(
    () => sectionFromHash(location.hash) ?? SECTIONS[0].id,
  );
  const [query, setQuery] = useState("");
  const navRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const fromHash = sectionFromHash(location.hash);
    if (fromHash) setCurrent(fromHash);
    else history.replaceState(null, "", hashFor(current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    const onHash = () => {
      const id = sectionFromHash(location.hash);
      if (id) setCurrent(id);
    };
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);

  const close = () => {
    setQuery("");
    if (sectionFromHash(location.hash))
      history.replaceState(null, "", location.pathname + location.search);
    onClose();
  };
  const pick = (id: string) => {
    setCurrent(id);
    setQuery("");
    history.replaceState(null, "", hashFor(id));
  };

  const shown = filterSections(query);
  const section = SECTIONS.find((s) => s.id === current) ?? SECTIONS[0];
  const navButtons = () =>
    Array.from(navRef.current?.querySelectorAll("button") ?? []);

  const onNavKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const btns = navButtons();
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    const next = i + (e.key === "ArrowDown" ? 1 : -1);
    if (next < 0) searchRef.current?.focus();
    else btns[Math.min(next, btns.length - 1)]?.focus();
  };
  const onSearchKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      navButtons()[0]?.focus();
    } else if (e.key === "Enter" && shown[0]) {
      e.preventDefault();
      pick(shown[0].section.id);
    }
  };

  return (
    <Modal
      open={open}
      title="Studio"
      onClose={close}
      className="studio"
      hideTitle
    >
      <header className="studio-head">
        <Button onClick={close}>Back to workspace</Button>
        <h2 className="studio-title">Studio</h2>
        <Input
          ref={searchRef}
          type="search"
          aria-label="Search settings"
          placeholder="Search settings"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKey}
        />
      </header>
      <div className="studio-body">
        <nav
          ref={navRef}
          aria-label="Studio"
          className="studio-nav"
          onKeyDown={onNavKey}
        >
          {shown.map(({ section: s }) => (
            <button
              key={s.id}
              type="button"
              className="studio-nav-item"
              aria-current={s.id === current ? "page" : undefined}
              onClick={() => pick(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <main className="studio-main">
          {query.trim() ? (
            shown.length ? (
              <ul aria-label="Matching settings" className="studio-results">
                {shown.flatMap(({ section: s, fields }) =>
                  (fields.length ? fields : [{ id: "", label: s.label }]).map(
                    (x) => (
                      <li key={`${s.id}/${x.id}`}>
                        <button type="button" onClick={() => pick(s.id)}>
                          {x.id ? `${s.label}: ${x.label}` : x.label}
                        </button>
                      </li>
                    ),
                  ),
                )}
              </ul>
            ) : (
              <p className="studio-none">No settings match “{query.trim()}”.</p>
            )
          ) : section.id === "themes" ? (
            <>
              <h3 className="studio-h">{section.label}</h3>
              <ThemeGallery />
            </>
          ) : (
            <section className="studio-empty">
              <h3>{section.label}</h3>
              <Cassette />
              <p className="studio-empty-big">Coming in v0.4</p>
              <p className="muted">This section is still being built.</p>
            </section>
          )}
        </main>
      </div>
    </Modal>
  );
}
