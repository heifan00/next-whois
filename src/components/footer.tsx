"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  RiGithubFill,
  RiHeartFill,
  RiCodeFill,
  RiGlobalLine,
  RiMailFill,
  RiExternalLinkFill,
} from "@remixicon/react";
import { cn } from "@/lib/utils";
import { VERSION } from "@/lib/env";

export function Footer() {
  const currentYear = new Date().getFullYear();
  return (
    <footer className="w-full mt-16 mb-8">
      <div className="max-w-4xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className={cn(
            "relative rounded-2xl border border-dashed border-muted/50",
            "bg-secondary/25 backdrop-blur-sm p-6",
            "hover:border-solid hover:bg-secondary/40 transition-all duration-300"
          )}
        >
          {/* 背景装饰 */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
          
          <div className="relative z-10 flex flex-col items-center justify-center space-y-4">
            {/* 主要内容区域 - 居中布局 */}
            <motion.div
              className="flex flex-col items-center gap-3 text-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              {/* Logo 和品牌信息 */}
              <div className="flex items-center gap-3">
                <motion.div
                  className={cn(
                    "w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-accent/20",
                    "border-2 border-dashed border-primary/30 grid place-items-center",
                    "hover:border-solid transition-all duration-300"
                  )}
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                >
                  <RiCodeFill className="w-4 h-4 text-primary" />
                </motion.div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground text-lg">94.cx WHOIS</h3>
                  <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-full border border-dashed border-muted/50">
                    v{VERSION}
                  </span>
                </div>
              </div>
              
              {/* 描述文字 */}
              <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                轻量级且美观的 Whois 查询工具
              </p>
            </motion.div>

            {/* 分割线 */}
            <motion.div 
              className="w-24 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ duration: 0.8, delay: 0.4 }}
            />

            {/* 底部信息 - 居中布局 */}
            <motion.div
              className="flex flex-col items-center gap-3 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.6 }}
            >
              {/* 项目信息 */}
              <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
                <motion.span 
                  className="px-3 py-1.5 rounded-full border border-dashed border-muted/50 bg-background/50 hover:border-solid hover:bg-background/80 transition-all duration-300"
                  whileHover={{ scale: 1.05 }}
                >
                  <a 
                    href="https://github.com/zmh-program/next-whois" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:text-primary/80 transition-colors duration-300 flex items-center gap-1.5"
                  >
                    <RiGithubFill className="w-3.5 h-3.5" />
                    基于 Next Whois
                    <RiExternalLinkFill className="w-3 h-3 opacity-60" />
                  </a>
                </motion.span>
                
                <span className="text-muted-foreground/40">•</span>
                
                <motion.span 
                  className="flex items-center gap-1.5 text-muted-foreground/80"
                  whileHover={{ scale: 1.05 }}
                >
                  感谢开源
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <RiHeartFill className="w-3.5 h-3.5 text-red-500/80" />
                  </motion.div>
                </motion.span>
              </div>
              
              {/* 版权信息 */}
              <div className="text-xs text-muted-foreground/60">
                © {currentYear} • Made with passion
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </footer>
  );
}