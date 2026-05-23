import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Reveal } from "@/components/Reveal";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — Ather Group" },
      { name: "description", content: "Get in touch with Ather Group for partnerships, trading and services across our companies." },
      { property: "og:title", content: "Contact Ather Group" },
      { property: "og:description", content: "Get in touch with Ather Group." },
    ],
    links: [{ rel: "canonical", href: "/contact" }],
  }),
  component: ContactPage,
});

function ContactPage() {
  const [sent, setSent] = useState(false);
  return (
    <section className="mx-auto max-w-7xl px-6 lg:px-10 pt-24 pb-32">
      <Reveal>
        <p className="text-xs tracking-[0.4em] uppercase text-ember mb-8">Get in touch</p>
      </Reveal>
      <Reveal delay={120}>
        <h1 className="font-display font-black text-[clamp(2.5rem,7vw,7rem)] leading-[0.95] tracking-[-0.03em] max-w-4xl text-balance mb-20">
          Start a <span className="italic font-light text-ember">conversation</span>.
        </h1>
      </Reveal>

      <div className="grid md:grid-cols-12 gap-16">
        <Reveal delay={200} className="md:col-span-5 space-y-10">
          <div>
            <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-3">Headquarters</p>
            <p className="text-lg">Dubai, United Arab Emirates</p>
          </div>
          <div>
            <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-3">Email</p>
            <a href="mailto:info@athergroup.com" className="text-lg hover:text-ember transition-colors">
              info@athergroup.com
            </a>
          </div>
          <div>
            <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-3">Phone</p>
            <p className="text-lg">+971 00 000 0000</p>
          </div>
          <div className="pt-10 border-t border-border">
            <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-3">Hours</p>
            <p className="text-muted-foreground">Sun &mdash; Thu &middot; 09:00 &mdash; 18:00 GST</p>
            <p className="text-muted-foreground mt-1">Trading desks operate 24/5</p>
          </div>
        </Reveal>

        <Reveal delay={300} className="md:col-span-7">
          <form
            onSubmit={(e) => { e.preventDefault(); setSent(true); }}
            className="space-y-8 border border-border p-8 md:p-12 bg-surface/40"
          >
            {sent ? (
              <div className="py-20 text-center">
                <p className="text-xs tracking-[0.3em] uppercase text-ember mb-4">Message received</p>
                <p className="text-2xl font-display">Thank you. We'll be in touch shortly.</p>
              </div>
            ) : (
              <>
                <Field label="Full name" name="name" required />
                <Field label="Email" name="email" type="email" required />
                <Field label="Company" name="company" />
                <div>
                  <label className="text-xs tracking-[0.3em] uppercase text-muted-foreground block mb-3">Interest</label>
                  <select className="w-full bg-transparent border-b border-border focus:border-ember outline-none py-3 text-lg">
                    <option className="bg-background">Bullion &amp; precious metals</option>
                    <option className="bg-background">Jewellery</option>
                    <option className="bg-background">General trading</option>
                    <option className="bg-background">Currency exchange</option>
                    <option className="bg-background">Car rental</option>
                    <option className="bg-background">Partnership</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs tracking-[0.3em] uppercase text-muted-foreground block mb-3">Message</label>
                  <textarea rows={4} required className="w-full bg-transparent border-b border-border focus:border-ember outline-none py-3 text-lg resize-none" />
                </div>
                <button type="submit" className="w-full md:w-auto inline-flex items-center justify-center gap-3 px-10 py-5 text-xs font-medium tracking-[0.25em] uppercase bg-ember text-ember-foreground hover:shadow-ember transition-all">
                  Send message &rarr;
                </button>
              </>
            )}
          </form>
        </Reveal>
      </div>
    </section>
  );
}

function Field({ label, name, type = "text", required }: { label: string; name: string; type?: string; required?: boolean }) {
  return (
    <div>
      <label htmlFor={name} className="text-xs tracking-[0.3em] uppercase text-muted-foreground block mb-3">{label}</label>
      <input id={name} name={name} type={type} required={required} className="w-full bg-transparent border-b border-border focus:border-ember outline-none py-3 text-lg" />
    </div>
  );
}
