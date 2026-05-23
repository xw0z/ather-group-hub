import { createFileRoute } from "@tanstack/react-router";
import { companies } from "@/lib/companies";
import { Reveal } from "@/components/Reveal";

export const Route = createFileRoute("/companies")({
  head: () => ({
    meta: [
      { title: "Companies — Ather Group" },
      { name: "description", content: "The five operating companies of Ather Group: Golden Bridge, Izirova, Treeway, ViceCity and the FX desk." },
      { property: "og:title", content: "Ather Group Companies" },
      { property: "og:description", content: "Explore the operating companies of Ather Group." },
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
            Five companies. <br />
            <span className="italic font-light text-ember">One operating</span> standard.
          </h1>
        </Reveal>
      </section>

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
                        {c.tag}
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
    </>
  );
}
