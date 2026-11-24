/**
 * Calm night-arena backdrop for data-dense broadcast screens: deep navy, floodlight
 * glow from the top corners, cool blue/purple side light and the outfield under lights.
 * Static CSS only (no animation, no image downloads).
 */
export function ArenaBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[#03050b]" aria-hidden="true">
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,#14213f_0%,#0a1224_45%,#04060d_100%)]" />
      <div className="absolute top-[18%] -left-[18%] h-[70%] w-[55%] rounded-full bg-[radial-gradient(closest-side,rgb(59_130_246/0.11),transparent)] blur-3xl" />
      <div className="absolute top-[8%] -right-[18%] h-[70%] w-[55%] rounded-full bg-[radial-gradient(closest-side,rgb(139_92_246/0.10),transparent)] blur-3xl" />
      <div className="absolute -top-[16vmax] -left-[10vmax] size-[36vmax] rounded-full bg-[radial-gradient(circle,rgb(255_248_225/0.20),rgb(245_217_138/0.06)_35%,transparent_65%)]" />
      <div className="absolute -top-[16vmax] -right-[10vmax] size-[36vmax] rounded-full bg-[radial-gradient(circle,rgb(255_248_225/0.20),rgb(245_217_138/0.06)_35%,transparent_65%)]" />
      <div className="absolute inset-x-[-15%] bottom-[-58%] h-[85%] rounded-[50%] bg-[radial-gradient(50%_50%_at_50%_38%,rgb(22_101_52/0.38),rgb(8_36_26/0.25)_55%,transparent_75%)]" />
      <div className="absolute inset-x-[-5%] bottom-[-62%] h-[85%] rounded-[50%] border-t border-white/[0.07]" />
      <div className="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgb(255_255_255)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:radial-gradient(70%_60%_at_50%_40%,#000,transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(140%_110%_at_50%_45%,transparent_55%,rgb(0_0_0/0.7)_100%)]" />
    </div>
  );
}
