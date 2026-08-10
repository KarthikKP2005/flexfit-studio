import Link from "next/link";

/** Public marketing/landing page — static content, no data fetching. */
export default function HomePage() {
  return (
    <div className="space-y-16 py-8">
      {/* Hero Section */}
      <section className="flex flex-col items-center text-center space-y-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-green-400">
          Welcome to FlexFit
        </p>
        <h1 className="text-5xl font-extrabold tracking-tight max-w-3xl leading-tight">
          Elevate Your Performance with <span style={{ color: "var(--accent)" }}>FlexFit Studio</span>
        </h1>
        <p className="muted max-w-2xl text-lg leading-relaxed">
          Book classes, manage your membership, and track your attendance in real-time. 
          Experience twelve world-class formats a week across yoga, strength, spin, and boxing.
        </p>
        <div className="flex gap-4 pt-4">
          <Link href="/schedule" className="btn btn-primary text-base px-6 py-3 shadow-lg shadow-green-500/20">
            View Schedule
          </Link>
          <Link href="/plans" className="btn text-base px-6 py-3">
            Explore Memberships
          </Link>
        </div>
      </section>

      {/* Feature Highlights Grid */}
      <section className="grid gap-6 sm:grid-cols-3">
        {[
          { title: "Personalized Training", desc: "Flexible credit system tailored for all class levels." },
          { title: "Corporate Wellness", desc: "Seamless shared credit pools for entire company teams." },
          { title: "Real-time Access", desc: "Instant booking, waitlist promotion, and walk-in entry." },
        ].map((feature) => (
          <div key={feature.title} className="panel p-6 border-t-2 border-t-green-500/50 hover:border-t-green-500 transition-colors">
            <h3 className="font-semibold text-lg">{feature.title}</h3>
            <p className="muted mt-2 text-sm">{feature.desc}</p>
          </div>
        ))}
      </section>

      {/* Studio Spaces Showcase */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold tracking-tight text-center">Our Spaces</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { room: "Studio A", tags: "Yoga • Mobility", blurb: "A serene space designed for vinyasa and deep mobility work." },
            { room: "Studio B", tags: "HIIT • Boxing", blurb: "High-energy environment equipped for circuits and heavy bags." },
            { room: "Spin Room", tags: "Endurance • Speed", blurb: "20 premium bikes featuring two intense spin formats." },
          ].map(({ room, tags, blurb }) => (
            <div key={room} className="panel p-6 flex flex-col items-start gap-3 bg-gradient-to-br from-[#171a21] to-[#12141a]">
              <div className="px-2 py-1 bg-green-500/10 text-green-400 text-xs font-medium rounded">
                {tags}
              </div>
              <div>
                <h3 className="font-medium text-lg">{room}</h3>
                <p className="muted mt-1 text-sm">{blurb}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
