import Link from "next/link";

/**
 * Public marketing/landing page — static content, no data fetching.
 *
 * Layout note: both sections below intentionally break out of the shared
 * `layout.tsx` shell (`mx-auto max-w-5xl px-4 py-8`) using the
 * `left-1/2 w-screen -translate-x-1/2` full-bleed trick, so the hero image
 * and the white band can each span the full viewport width while every
 * other route's layout stays untouched. `-mt-8` cancels the shell's own
 * top padding so the hero starts flush at the very top of the page,
 * directly behind the transparent/fixed NavBar (see NavBar.tsx).
 */
export default function HomePage() {
  return (
    <>
      <section
        className="relative left-1/2 -mt-8 min-h-screen w-screen -translate-x-1/2 overflow-hidden bg-cover bg-center"
        style={{ backgroundImage: "url(/hero-bg.svg)" }}
      >
        <div className="absolute inset-0 bg-black/55" />

        <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-4 pt-20">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-green-400">
            Welcome to FlexStudio
          </p>
          <h1 className="mt-4 text-5xl font-bold tracking-tight text-white sm:text-6xl">
            FlexFit Studio
          </h1>
          <p className="mt-5 max-w-xl text-white/80">
            Book classes, manage your membership, and track your attendance.
            Twelve classes a week across yoga, strength, spin and boxing.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/schedule" className="btn btn-primary">
              View schedule
            </Link>
            <Link
              href="/plans"
              className="btn border-white/30 bg-white/10 text-white backdrop-blur hover:bg-white/20"
            >
              Membership plans
            </Link>
          </div>
        </div>
      </section>

      <section className="relative left-1/2 w-screen -translate-x-1/2 bg-white py-16 text-black">
        <div className="mx-auto max-w-5xl px-4">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-green-500">
            Our spaces
          </p>
          {/* Replaced the literal reuse of the hero's paragraph with its
              own copy — same factual claims (three rooms, weekly class
              count) but written fresh so this section doesn't just repeat
              the hero verbatim. */}
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-black">
            Find your rhythm in every room
          </h2>
         

          {/* Neon-green card treatment: bright accent fill + a soft glow
              shadow for the "neon" look, dot switched to white so it still
              reads as a distinct indicator against the green fill (a green
              dot would disappear into the green card). */}
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {[
              ["Studio A", "Yoga, vinyasa and mobility"],
              ["Studio B", "HIIT, boxing and circuits"],
              ["Spin Room", "20 bikes, two spin formats"],
            ].map(([room, blurb]) => (
              <div
                key={room}
                className="rounded-xl p-5 shadow-[0_0_28px_-6px_rgba(74,222,128,0.55)] transition-shadow hover:shadow-[0_0_36px_-4px_rgba(74,222,128,0.7)]"
                style={{ backgroundColor: "var(--accent)" }}
              >
                <span className="inline-block h-2 w-2 rounded-full bg-white" />
                <h3 className="mt-3 font-medium text-black">{room}</h3>
                <p className="mt-1 text-sm text-black/70">{blurb}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
