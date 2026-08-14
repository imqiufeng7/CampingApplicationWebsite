// Six dots flying outward from the center, purely decorative, layered behind the
// checkmark circle on success screens. --tx/--ty per dot drive the confetti-pop
// keyframe defined in globals.css.
const DOTS = [
  { color: "var(--primary)", tx: "-38px", ty: "-30px" },
  { color: "var(--poster-blue)", tx: "38px", ty: "-30px" },
  { color: "var(--accent)", tx: "-46px", ty: "6px" },
  { color: "var(--poster-green)", tx: "46px", ty: "6px" },
  { color: "var(--poster-blue)", tx: "-22px", ty: "42px" },
  { color: "var(--accent)", tx: "22px", ty: "42px" },
];

export function ConfettiBurst() {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
      {DOTS.map((d, i) => (
        <span
          key={i}
          className="confetti-dot absolute size-2 rounded-full"
          style={{ backgroundColor: d.color, "--tx": d.tx, "--ty": d.ty } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
