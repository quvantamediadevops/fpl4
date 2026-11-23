/** Lattice floodlight tower: lamp bank on a braced mast. Drawn once, mirrored for the right side. */
function FloodlightTower({ side }: { side: "left" | "right" }) {
  const left = side === "left";
  return (
    <div
      className={`absolute top-[9%] hidden h-[52%] w-[5.4vw] wide:[@media(min-height:600px)]:block ${left ? "left-[0.4vw]" : "right-[0.4vw] scale-x-[-1]"}`}
      aria-hidden="true"
    >
      {/* light beam towards the middle of the ground */}
      <div className="absolute top-[6%] left-[55%] h-[150%] w-[38vw] origin-top-left rotate-[-26deg] bg-[linear-gradient(180deg,rgb(255_244_214/0.16),rgb(255_244_214/0.05)_40%,transparent_75%)] blur-xl [clip-path:polygon(0_0,14%_0,100%_100%,0_100%)]" />
      {/* halo */}
      <div className="absolute top-[-9vw] left-[-6vw] size-[20vw] rounded-full bg-[radial-gradient(circle,rgb(255_250_232/0.75)_0%,rgb(245_217_138/0.28)_18%,rgb(212_167_44/0.07)_45%,transparent_68%)]" />
      <svg viewBox="0 0 100 520" preserveAspectRatio="xMidYMin meet" className="relative h-full w-full overflow-visible">
        {/* mast */}
        <g stroke="#1b2233" strokeWidth="3" fill="none">
          <path d="M38 96 L30 520 M62 96 L70 520" />
          {Array.from({ length: 10 }, (_, i) => {
            const y = 96 + i * 42.4;
            const t = (i * 42.4) / 424;
            const l = 38 - 8 * t;
            const r = 62 + 8 * t;
            const t2 = ((i + 1) * 42.4) / 424;
            return <path key={i} d={`M${l} ${y} L${62 + 8 * t2} ${y + 42.4} M${r} ${y} L${38 - 8 * t2} ${y + 42.4}`} strokeWidth="1.6" />;
          })}
        </g>
        {/* lamp bank, angled towards the ground */}
        <g transform="rotate(12 50 50)" style={{ filter: "drop-shadow(0 0 9px rgb(255 240 200 / 0.9))" }}>
          <rect x="0" y="24" width="100" height="58" rx="4" fill="#0a0e18" stroke="#3b4252" strokeWidth="2" />
          <path d="M-2 24 L102 24 L96 16 L4 16 Z" fill="#161c2a" />
          {Array.from({ length: 3 }, (_, r) =>
            Array.from({ length: 6 }, (_, c) => (
              <circle key={`${r}-${c}`} cx={11 + c * 15.6} cy={36 + r * 16.5} r="5.4" fill="#fffaf0" opacity={0.82 + ((r + c) % 2) * 0.16} />
            )),
          )}
        </g>
        <path d="M44 82 L56 82 L58 96 L42 96 Z" fill="#1b2233" />
      </svg>
    </div>
  );
}

/**
 * Night cricket stadium: floodlight towers, tiered stands with crowd, lit outfield,
 * a gold glow behind the player and gold accents in the lower corners.
 * Pure CSS/SVG, static (no animation cost), no image downloads.
 */
export function StadiumBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[#04060c]" aria-hidden="true">
      {/* night sky */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_75%_at_50%_0%,#13203d_0%,#0a1121_48%,#04060c_100%)]" />

      {/* stands: upper tier, crowd, lower tier, crowd */}
      <div className="absolute inset-x-0 top-[40%] h-[13%] bg-[linear-gradient(180deg,#0d162b,#0a1222)] [clip-path:ellipse(75%_100%_at_50%_100%)]" />
      <div className="absolute inset-x-0 top-[41.5%] h-[11%] opacity-90 [background-image:radial-gradient(ellipse_42%_52%_at_50%_100%,#152039_96%,transparent_100%)] [background-size:11px_9px] [mask-image:linear-gradient(180deg,transparent,#000_25%,#000_80%,transparent)] [clip-path:ellipse(75%_100%_at_50%_100%)]" />
      <div className="absolute inset-x-0 top-[41%] h-[12%] opacity-50 [background-image:radial-gradient(circle,rgb(255_255_255/0.55)_0.7px,transparent_1.3px),radial-gradient(circle,rgb(245_217_138/0.5)_0.7px,transparent_1.3px),radial-gradient(circle,rgb(147_197_253/0.45)_0.7px,transparent_1.3px)] [background-position:0_0,7px_5px,19px_11px] [background-size:37px_23px,53px_31px,71px_19px] [mask-image:linear-gradient(180deg,transparent,#000_30%,#000_75%,transparent)]" />
      <div className="absolute inset-x-0 top-[52.5%] h-[1px] bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.12),transparent)]" />
      <div className="absolute inset-x-0 top-[53%] h-[13%] bg-[linear-gradient(180deg,#0b1324,#070b16)]" />
      <div className="absolute inset-x-0 top-[54%] h-[10%] opacity-80 [background-image:radial-gradient(ellipse_42%_52%_at_50%_100%,#121b31_96%,transparent_100%)] [background-size:13px_11px] [mask-image:linear-gradient(180deg,transparent,#000_30%,#000_70%,transparent)]" />
      <div className="absolute inset-x-0 top-[54%] h-[10%] opacity-35 [background-image:radial-gradient(circle,rgb(255_255_255/0.5)_0.8px,transparent_1.4px),radial-gradient(circle,rgb(245_217_138/0.45)_0.8px,transparent_1.4px)] [background-position:3px_2px,17px_9px] [background-size:43px_27px,61px_17px] [mask-image:linear-gradient(180deg,transparent,#000_30%,#000_70%,transparent)]" />

      {/* outfield under lights, with boundary rope */}
      <div className="absolute inset-x-[-20%] bottom-[-30%] h-[60%] rounded-[50%] bg-[radial-gradient(55%_55%_at_50%_32%,#1b6b3a_0%,#0f4527_38%,#08241a_70%,#04110c_100%)]" />
      <div className="absolute inset-x-[-20%] bottom-[-30%] h-[60%] rounded-[50%] opacity-[0.05] [background-image:repeating-linear-gradient(90deg,#fff_0_4%,transparent_4%_8%)] [mask-image:radial-gradient(55%_60%_at_50%_30%,#000,transparent)]" />
      <div className="absolute inset-x-[-8%] bottom-[-38%] h-[62%] rounded-[50%] border-t-2 border-white/15" />

      <FloodlightTower side="left" />
      <FloodlightTower side="right" />
      {/* corner floodlight glow where the towers are hidden (phones, short screens) */}
      <div className="absolute top-[-14vmax] left-[-10vmax] size-[34vmax] rounded-full bg-[radial-gradient(circle,rgb(255_248_225/0.35),transparent_65%)] wide:[@media(min-height:600px)]:hidden" />
      <div className="absolute top-[-14vmax] right-[-10vmax] size-[34vmax] rounded-full bg-[radial-gradient(circle,rgb(255_248_225/0.35),transparent_65%)] wide:[@media(min-height:600px)]:hidden" />

      {/* light behind the player, gold accents in the lower corners */}
      <div className="absolute inset-0 bg-[radial-gradient(38%_48%_at_50%_40%,rgb(245_217_138/0.13),transparent_70%)] wide:bg-[radial-gradient(30%_50%_at_26%_50%,rgb(245_217_138/0.16),transparent_70%)]" />
      <div className="absolute bottom-[-18vmin] left-[-14vmin] size-[52vmin] rounded-full bg-[radial-gradient(circle,rgb(212_167_44/0.32),transparent_65%)]" />
      <div className="absolute right-[-14vmin] bottom-[-18vmin] size-[52vmin] rounded-full bg-[radial-gradient(circle,rgb(212_167_44/0.32),transparent_65%)]" />

      {/* vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(135%_105%_at_50%_45%,transparent_50%,rgb(0_0_0/0.75)_100%)]" />
    </div>
  );
}
