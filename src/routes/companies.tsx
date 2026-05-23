import { createFileRoute } from "@tanstack/react-router";
import { companies, services } from "@/lib/companies";
import { Reveal } from "@/components/Reveal";

export const Route = createFileRoute("/companies")({
  head: () => ({
    meta: [
      { title: "Companies & Services — Ather Group" },
      { name: "description", content: "The four operating companies of Ather Group — Golden Bridge, Izirova, Treeway and ViceCity — and the additional business services we provide." },
      { property: "og:title", content: "Ather Group Companies & Services" },
      { property: "og:description", content: "Explore the four operating companies and additional business services of Ather Group." },
    ],
    links: [{ rel: "canonical", href: "/companies" }],
  }),
  component: CompaniesPage,
});

function CompaniesPage() {
  return (
    <>
      <section className="mx-auto max-w-7xl px-6 lg:px-10 pt-24 pb-24">
        <Reveal>
          <p className="text-xs tracking-[0.4em] uppercase text-ember mb-8">Portfolio</p>
        </Reveal>
        <Reveal delay={120}>
          <h1 className="font-display font-black text-[clamp(2.5rem,7vw,7rem)] leading-[0.95] tracking-[-0.03em] max-w-5xl text-balance">
            Four companies. <br />
            <span className="italic font-light text-ember">One operating</span> standard.
          </h1>
        </Reveal>
        <Reveal delay={220}>
          <p className="mt-10 max-w-2xl text-lg text-muted-foreground leading-relaxed">
            Ather Group is built around four operating companies. Alongside them, we run a
            set of complementary business services that extend the reach of the Group across
            additional sectors and markets.
          </p>
        </Reveal>
      </section>

      {/* COMPANIES */}
      <div className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 lg:px-10 pt-20 pb-4">
          <Reveal>
            <p className="text-xs tracking-[0.3em] uppercase text-ember mb-4">— Our Companies</p>
            <h2 className="font-display font-black text-4xl md:text-5xl tracking-tight max-w-3xl">
              The four operating companies of Ather Group.
            </h2>
          </Reveal>
        </div>
      </div>

      <div className="space-y-0">
        {companies.map((c, i) => {
          const reverse = i % 2 === 1;
          return (
            <section
              key={c.id}
              id={c.id}
              className={`border-t border-border ${reverse ? "bg-surface/40" : ""} scroll-mt-24`}
            >
              <div className="mx-auto max-w-7xl px-6 lg:px-10 py-24 md:py-32">
                <div className={`grid md:grid-cols-12 gap-12 items-center ${reverse ? "md:[&>*:first-child]:order-2" : ""}`}>
                  <Reveal className="md:col-span-7">
                    <div className="relative overflow-hidden aspect-[4/3] grain group">
                      <img
                        src={c.image}
                        alt={c.name}
                        loading="lazy"
                        width={1280}
                        height={960}
                        className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
                      />
                      <div className="absolute top-6 left-6 text-xs tracking-[0.3em] text-ember bg-background/80 backdrop-blur px-3 py-2">
                        Company {c.tag}
                      </div>
                    </div>
                  </Reveal>

                  <Reveal delay={150} className="md:col-span-5">
                    <p className="text-xs tracking-[0.3em] uppercase text-ember mb-5">{c.sector}</p>
                    <h2 className="font-display font-black text-5xl md:text-6xl tracking-tight leading-[0.95] mb-8">
                      {c.name}
                    </h2>
                    <p className="text-lg text-muted-foreground leading-relaxed mb-10">
                      {c.description}
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {["Operations", "Trusted Partners", "Global Reach"].map((tag) => (
                        <span key={tag} className="text-[10px] tracking-[0.25em] uppercase border border-border px-3 py-2 text-muted-foreground">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </Reveal>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {/* SERVICES */}
      <section id="services" className="border-t border-border bg-surface/20 scroll-mt-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-10 py-24 md:py-32">
          <Reveal>
            <p className="text-xs tracking-[0.3em] uppercase text-ember mb-6">— Additional Business Services</p>
            <h2 className="font-display font-black text-4xl md:text-6xl tracking-tight max-w-3xl leading-[1]">
              Beyond our companies, <br />
              <span className="italic font-light text-ember">we also do</span> business in:
            </h2>
            <p className="mt-8 max-w-2xl text-lg text-muted-foreground leading-relaxed">
              Complementary activities run by the Group alongside our four core companies —
              extending the same operating standard into adjacent sectors.
            </p>
          </Reveal>

          <div className="mt-20 grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-border">
            {services.map((s, i) => (
              <Reveal key={s.id} delay={i * 80}>
                <article id={s.id} className="bg-background h-full flex flex-col scroll-mt-24">
                  <div className="relative overflow-hidden aspect-[4/3] grain group">
                    <img
                      src={s.image}
                      alt={s.name}
                      loading="lazy"
                      width={800}
                      height={600}
                      className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
                    />
                    <div className="absolute top-4 left-4 text-[10px] tracking-[0.3em] text-ember bg-background/80 backdrop-blur px-2 py-1.5">
                      Service {s.tag}
                    </div>
                  </div>
                  <div className="p-8 flex-1 flex flex-col">
                    <p className="text-[10px] tracking-[0.3em] uppercase text-ember mb-3">{s.sector}</p>
                    <h3 className="font-display font-bold text-2xl tracking-tight mb-4">{s.name}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{s.description}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
