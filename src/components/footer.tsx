"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  RiGithubFill,
  RiCodeFill,
  RiExternalLinkFill,
  RiLinksLine,
  RiShieldKeyholeLine,
  RiGlobalLine,
} from "@remixicon/react";
import { cn } from "@/lib/utils";
import { VERSION } from "@/lib/env";

const friendlyLinks = [
  { name: "nazhumi.com", href: "https://www.nazhumi.com" },
  { name: "rdap.org", href: "https://rdap.org" },
  { name: "IANA", href: "https://www.iana.org" },
  { name: "InterNIC", href: "https://www.internic.net" },
];

export function Footer() {
  const currentYear = new Date().getFullYear();
  return (
    <footer className="w-full mt-16 mb-8">
      <div className="max-w-4xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className={cn(
            "relative rounded-2xl border border-muted/60",
            "bg-secondary/20 backdrop-blur-sm p-6 md:p-8",
            "hover:bg-secondary/30 transition-colors duration-300",
          )}
        >
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />

          <div className="relative z-10 grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
            <div className="md:col-span-2">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-accent/20",
                    "border border-muted/60 grid place-items-center",
                  )}
                >
                  <RiCodeFill className="w-4 h-4 text-primary" />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground text-base">
                      94.cx WHOIS
                    </span>
                    <span className="text-[11px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full border border-muted/60">
                      v{VERSION}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Fast domain, IP, and ASN lookup
                  </span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <RiGlobalLine className="w-3.5 h-3.5" />
                  Domain / IP / ASN
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <RiShieldKeyholeLine className="w-3.5 h-3.5" />
                  RDAP + WHOIS
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <RiLinksLine className="w-3.5 h-3.5" />
                  Pricing insights
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 text-sm">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Links
              </span>
              <div className="flex flex-col gap-1.5">
                <Link
                  href="https://github.com/zmh-program/next-whois"
                  target="_blank"
                  className="inline-flex items-center gap-2 text-primary hover:text-primary/80 transition-colors"
                >
                  <RiGithubFill className="w-4 h-4" />
                  Open Source
                  <RiExternalLinkFill className="w-3 h-3 opacity-70" />
                </Link>
                <Link
                  href="https://nextjs.org"
                  target="_blank"
                  className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  Powered by Next.js
                  <RiExternalLinkFill className="w-3 h-3 opacity-70" />
                </Link>
              </div>
            </div>

            <div className="flex flex-col gap-2 text-sm md:items-end">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                友情链接
              </span>
              <div className="flex flex-col gap-1.5 md:text-right">
                {friendlyLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors md:justify-end"
                  >
                    {link.name}
                    <RiExternalLinkFill className="w-3 h-3 opacity-70" />
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="relative z-10 mt-6 pt-4 border-t border-muted/40 flex flex-col sm:flex-row items-start sm:items-center gap-2 text-xs text-muted-foreground">
            <span>© {currentYear} 94.cx</span>
            <span className="hidden sm:inline">•</span>
            <span>Data source: nazhumi.com</span>
          </div>
        </motion.div>
      </div>
    </footer>
  );
}
