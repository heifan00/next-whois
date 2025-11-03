import "@/styles/globals.css";
import type {AppProps} from "next/app";
import Head from "next/head";
import {cn} from "@/lib/utils";
import {Toaster} from "sonner";
import {ThemeProvider} from "@/components/theme-provider";
import {strEnv} from "@/lib/env";
import {inter} from "@/lib/fonts";
import PWAInstaller from "@/components/pwa_installer";
import {Navbar} from "@/components/navbar";
import {Footer} from "@/components/footer";

const siteTitle = strEnv(
    "NEXT_PUBLIC_SITE_TITLE",
    "94.cx Whois - 轻量级且美观的 Whois 查询工具",
);
const siteDescription = strEnv(
    "NEXT_PUBLIC_SITE_DESCRIPTION",
    "🧪 Your Next Generation Of Whois Lookup Tool With Modern UI. Support Domain/IPv4/IPv6/ASN/CIDR Whois Lookup And Powerful Features.",
);
const siteKeywords = strEnv(
    "NEXT_PUBLIC_SITE_KEYWORDS",
    "Whois, Lookup, Tool, 94.cx WHOIS",
);

export default function App({Component, pageProps}: AppProps) {
    return (
        <>
            <Head>
                <title>{siteTitle}</title>
                <meta name="description" content={siteDescription}/>
                <meta name="tags" content={siteKeywords}/>
                <meta name="keywords" content={siteKeywords}/>
                <meta name="viewport" content="width=device-width, initial-scale=1"/>
                <script defer src="https://umami.java.li/script.js"
                        data-website-id="99c74aa9-d7e1-40e2-9768-f856db5a06ef"></script>
            </Head>
            <Toaster/>
            <ThemeProvider
                attribute="class"
                defaultTheme="system"
                enableSystem
                disableTransitionOnChange
            >
                <PWAInstaller
                    manifest-url="/manifest.json"
                    name="94.cx Whois"
                    description="🧪 Your Next Generation Of Whois Lookup Tool With Modern UI. Support Domain/IPv4/IPv6/ASN/CIDR Whois Lookup And Powerful Features."
                />
                <div className="fixed inset-0 -z-10">
                    <div className="absolute inset-0 bg-dot-pattern opacity-10"/>
                    <div
                        className="absolute inset-0 bg-gradient-to-b from-transparent via-background/20 to-background"/>
                </div>
                <div className={cn(`relative w-full min-h-screen flex flex-col`, inter.className)}>
                    <Navbar/>
                    <main className="pt-16 flex-1">
                        <Component {...pageProps} />
                    </main>
                    <Footer/>
                </div>
            </ThemeProvider>
        </>
    );
}
