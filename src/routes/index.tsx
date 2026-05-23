import { createFileRoute, Link } from "@tanstack/react-router";
import heroImg from "@/assets/hero-gold.jpg";
import { companies } from "@/lib/companies";
import { Reveal } from "@/components/Reveal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ather Group — Diversified Holdings in Gold, Trade & Mobility" },
      { name: "description", content: "Holding company behind Gold Bridge, Izirova Jewellery, Treeway Trading, ViceCity Car Rental and a global FX desk." },
      { property: "og:title", content: "Ather Group" },
      { property: "og:description", content: "A diversified holding company forging enduring value across gold, jewellery, trade and mobility." },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: HomePage,
});

const stats = [
  { v: "5", l: "Operating Companies" },
  { v: "15+", l: "Years in the Market" },
  { v: "3", l: "Continents Served" },
  { v: "24/7", l: "Trading Desks" },
];

const tickers = [
  "GOLD BULLION", "FINE JEWELLERY", "GENERAL TRADING",
  "LUXURY MOBILITY", "FOREIGN EXCHANGE", "PRECIOUS METALS",
];

function HomePage() {
  return (
    <>
      {/* HERO */}
      <section className="relative min-h-[92vh] flex items-end overflow-hidden grain">
        <img
          src={heroImg}
          alt="Stacked gold and silver bullion lit by ember light"
          width={1920}
          height={1280}
          className="absolute inset-0 w-full h-full object-cover opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30" />
        <div className="absolute top-1/3 right-10 h-64 w-64 rounded-full bg-ember/30 blur-[120px] animate-ember-pulse" />

        <div className="relative mx-auto max-w-7xl px-6 lg:px-10 pb-24 w-full">
          <Reveal>
            <p className="text-xs tracking-[0.4em] uppercase text-ember mb-8">A Diversified Holding Group</p>
          </Reveal>
          <Reveal delay={120}>
            <h1 className="font-display font-black text-[clamp(3rem,9vw,9rem)] leading-[0.9] tracking-[-0.04em] text-balance max-w-5xl">
              Forging value <br />
              <span className="italic font-light text-ember">across</span> markets.
            </h1>
          </Reveal>
          <Reveal delay={260}>
            <div className="mt-12 grid md:grid-cols-[1fr_auto] gap-10 items-end max-w-4xl">
              <p className="text-lg md:text-xl text-muted-foreground max-w-xl leading-relaxed">
                Ather Group operates five companies spanning precious metals, fine jewellery,
                global trade, currency exchange and premium mobility &mdash; built on discipline,
                trust and long-term relationships.
              </p>
              <div className="flex gap-3">
                <Link to="/companies" className="inline-flex items-center gap-2 px-7 py-4 text-xs font-medium tracking-[0.2em] uppercase bg-ember text-ember-foreground hover:shadow-ember transition-all">
                  Our companies
                  <span aria-hidden>&rarr;</span>
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* MARQUEE */}
      <section className="border-y border-border overflow-hidden bg-surface/30 py-6">
        <div className="flex animate-marquee whitespace-nowrap">
          {[...tickers, ...tickers, ...tickers].map((t, i) => (
            <span key={i} className="flex items-center gap-8 mx-8 text-2xl font-display font-light tracking-[0.2em]">
              {t}
              <span className="h-1.5 w-1.5 rounded-full bg-ember" />
            </span>
          ))}
        </div>
      </section>

      {/* STATS */}
      <section className="mx-auto max-w-7xl px-6 lg:px-10 py-32">
        <div className="grid md:grid-cols-12 gap-12 items-start">
          <Reveal className="md:col-span-5">
            <p className="text-xs tracking-[0.3em] uppercase text-ember mb-6">&mdash; 01 / The Group</p>
            <h2 className="font-display font-black text-5xl md:text-6xl leading-[1] tracking-tight">
              One vision. <br /> Many ventures.
            </h2>
          </Reveal>
          <Reveal delay={150} className="md:col-span-7 md:pl-12 md:border-l border-border">
            <p className="text-lg text-muted-foreground leading-relaxed">
              From the trading floor to the workshop, from the showroom to the FX desk, every
              Ather company is built on the same principles &mdash; precision, transparency and an
              unwavering commitment to the people we serve.
            </p>
            <div className="mt-16 grid grid-cols-2 gap-y-12 gap-x-8">
              {stats.map((s) => (
                <div key={s.l}>
                  <div className="font-display font-black text-5xl md:text-6xl text-ember">{s.v}</div>
                  <div className="mt-2 text-xs tracking-[0.2em] uppercase text-muted-foreground">{s.l}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* COMPANIES PREVIEW */}
      <section className="bg-surface/40 border-y border-border">
        <div className="mx-auto max-w-7xl px-6 lg:px-10 py-32">
          <Reveal>
            <div className="flex items-end justify-between mb-16 flex-wrap gap-6">
              <div>
                <p className="text-xs tracking-[0.3em] uppercase text-ember mb-6">&mdash; 02 / Portfolio</p>
                <h2 className="font-display font-black text-5xl md:text-6xl leading-[1] tracking-tight max-w-2xl">
                  Five companies, <br />one standard.
                </h2>
              </div>
              <Link to="/companies" className="text-xs tracking-[0.2em] uppercase border-b border-ember pb-1 text-ember">
                See all &rarr;
              </Link>
            </div>
          </Reveal>

          <div className="space-y-px bg-border">
            {companies.map((c, i) => (
              <Reveal key={c.id} delay={i * 80}>
                <Link
                  to="/companies"
                  hash={c.id}
                  className="group grid md:grid-cols-12 gap-6 items-center bg-background hover:bg-surface transition-colors px-6 md:px-10 py-10"
                >
                  <span className="md:col-span-1 text-xs tracking-[0.3em] text-ember">{c.tag}</span>
                  <h3 className="md:col-span-4 font-display font-bold text-3xl md:text-4xl tracking-tight group-hover:text-ember transition-colors">
                    {c.name}
                  </h3>
                  <span className="md:col-span-3 text-xs tracking-[0.2em] uppercase text-muted-foreground">{c.sector}</span>
                  <p className="md:col-span-3 text-sm text-muted-foreground line-clamp-2">{c.description}</p>
                  <span className="md:col-span-1 text-right text-ember opacity-0 group-hover:opacity-100 transition-opacity">&rarr;</span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 lg:px-10 py-40">
        <Reveal>
          <div className="relative overflow-hidden border border-border p-12 md:p-20 grain">
            <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-ember/20 blur-[100px]" />
            <div className="relative grid md:grid-cols-[1fr_auto] gap-10 items-end">
              <div>
                <p className="text-xs tracking-[0.3em] uppercase text-ember mb-6">&mdash; 03 / Partner with us</p>
                <h2 className="font-display font-black text-5xl md:text-7xl leading-[0.95] tracking-tight max-w-3xl text-balance">
                  Let's build something that lasts.
                </h2>
              </div>
              <Link to="/contact" className="inline-flex items-center gap-3 px-8 py-5 text-xs font-medium tracking-[0.25em] uppercase bg-ember text-ember-foreground hover:shadow-ember transition-all whitespace-nowrap">
                Start a conversation &rarr;
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
