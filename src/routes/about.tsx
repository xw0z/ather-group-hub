import { createFileRoute } from "@tanstack/react-router";
import { Reveal } from "@/components/Reveal";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — Ather Group" },
      { name: "description", content: "The story, principles and leadership behind Ather Group." },
      { property: "og:title", content: "About Ather Group" },
      { property: "og:description", content: "The story, principles and leadership behind Ather Group." },
    ],
    links: [{ rel: "canonical", href: "/about" }],
  }),
  component: AboutPage,
});

const principles = [
  { n: "01", t: "Discipline", d: "Markets reward those who show up every day with the same standard. We don't chase, we compound." },
  { n: "02", t: "Transparency", d: "Whether it's a gram of gold or a five-year contract, our clients see exactly what they're getting." },
  { n: "03", t: "Long horizon", d: "We back ventures that can still be standing in twenty years. Trust is the only real moat." },
  { n: "04", t: "Operational rigour", d: "Each company is run by specialists. The Group provides capital, governance and quiet support." },
];

function AboutPage() {
  return (
    <>
      <section className="mx-auto max-w-7xl px-6 lg:px-10 pt-24 pb-32">
        <Reveal>
          <p className="text-xs tracking-[0.4em] uppercase text-ember mb-8">About the Group</p>
        </Reveal>
        <Reveal delay={120}>
          <h1 className="font-display font-black text-[clamp(2.5rem,7vw,7rem)] leading-[0.95] tracking-[-0.03em] max-w-5xl text-balance">
            A holding company built on <span className="italic font-light text-ember">trust</span>, patience and operational craft.
          </h1>
        </Reveal>
        <Reveal delay={260}>
          <div className="mt-16 grid md:grid-cols-12 gap-12">
            <div className="md:col-span-5 md:col-start-2">
              <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-4">Our story</p>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Ather Group was founded to bring together a portfolio of specialist businesses
                that share a single operating philosophy. What began as a bullion and currency
                desk has grown into a multi-sector group with operations in jewellery, general
                trade and premium mobility.
              </p>
            </div>
            <div className="md:col-span-5">
              <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-4">Today</p>
              <p className="text-lg text-muted-foreground leading-relaxed">
                We are headquartered in the Emirates and serve clients across the Gulf, Asia and
                Africa. Every company under the Ather name is run by its own team of operators,
                supported by shared capital and standards from the Group.
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="bg-surface/40 border-y border-border">
        <div className="mx-auto max-w-7xl px-6 lg:px-10 py-32">
          <Reveal>
            <p className="text-xs tracking-[0.3em] uppercase text-ember mb-6">Operating principles</p>
            <h2 className="font-display font-black text-5xl md:text-6xl tracking-tight mb-20 max-w-3xl">
              How we work, across every venture.
            </h2>
          </Reveal>
          <div className="grid md:grid-cols-2 gap-px bg-border">
            {principles.map((p, i) => (
              <Reveal key={p.n} delay={i * 100}>
                <div className="bg-background p-10 h-full">
                  <div className="flex items-baseline gap-6 mb-6">
                    <span className="font-display font-black text-ember text-2xl">{p.n}</span>
                    <h3 className="font-display font-bold text-2xl tracking-tight">{p.t}</h3>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">{p.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
