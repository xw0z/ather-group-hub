import { Outlet, createRootRouteWithContext, HeadContent, Scripts, useRouter, useRouterState } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { PurityLanguageProvider } from "@/lib/purity-i18n";


function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="text-xs tracking-[0.3em] text-ember uppercase mb-4">Error 404</p>
        <h1 className="text-7xl font-display font-black">Not found</h1>
        <p className="mt-4 text-muted-foreground">This page doesn't exist or has been moved.</p>
        <Link to="/" className="mt-8 inline-flex items-center gap-2 px-6 py-3 text-xs tracking-[0.2em] uppercase border border-ember text-ember hover:bg-ember hover:text-ember-foreground transition-all">
          Return home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-display font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">Please try again or return home.</p>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={() => { router.invalidate(); reset(); }} className="px-5 py-2.5 text-xs tracking-[0.2em] uppercase bg-ember text-ember-foreground">Try again</button>
          <a href="/" className="px-5 py-2.5 text-xs tracking-[0.2em] uppercase border border-border">Go home</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Ather Group — Diversified Holdings in Gold, Trade & Mobility" },
      { name: "description", content: "Ather Group is a diversified holding company spanning precious metals, jewellery, general trading, currency exchange and premium mobility." },
      { name: "author", content: "Ather Group" },
      { property: "og:site_name", content: "Ather Group" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:title", content: "Ather Group — Diversified Holdings in Gold, Trade & Mobility" },
      { name: "twitter:title", content: "Ather Group — Diversified Holdings in Gold, Trade & Mobility" },
      { property: "og:description", content: "Ather Group is a diversified holding company spanning precious metals, jewellery, general trading, currency exchange and premium mobility." },
      { name: "twitter:description", content: "Ather Group is a diversified holding company spanning precious metals, jewellery, general trading, currency exchange and premium mobility." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/496fbe00-c4f9-4dae-b560-d128f8d52e01/id-preview-214a32b3--d62dca07-39e3-48a0-80eb-775b71cdaf49.lovable.app-1779558168810.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/496fbe00-c4f9-4dae-b560-d128f8d52e01/id-preview-214a32b3--d62dca07-39e3-48a0-80eb-775b71cdaf49.lovable.app-1779558168810.png" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Urbanist:wght@300;400;500;600;700;800;900&family=Epilogue:wght@300;400;500;600;700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isPurity = pathname.startsWith("/purity");
  const isSwap = pathname.startsWith("/swap");
  const isDesk = pathname.startsWith("/desk") || pathname === "/login" || pathname === "/app" || pathname === "/margin" || pathname === "/unauthorized";
  const hideChrome = isPurity || isSwap || isDesk;
  return (
    <QueryClientProvider client={queryClient}>
      {!hideChrome && <SiteHeader />}
      <main className={hideChrome ? "" : "pt-20"}>
        {isPurity ? (
          <PurityLanguageProvider>
            <Outlet />
          </PurityLanguageProvider>
        ) : (
          <Outlet />
        )}
      </main>
      {!hideChrome && <SiteFooter />}
      {!hideChrome && <WhatsAppButton />}
    </QueryClientProvider>
  );
}
