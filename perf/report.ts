import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from '@playwright/test';

/** Reports are written next to the other project reports (the README links to docs/reports). */
export const REPORT_DIR = path.resolve(process.cwd(), 'docs', 'reports', 'performance');

export const fmt = (n: number, digits = 1): string => (Number.isFinite(n) ? n.toFixed(digits) : 'n/a');

export interface Environment {
  date: string;
  browser: string;
  os: string;
  cpu: string;
  cores: number;
  ramGB: number;
  node: string;
  target: string;
  /** WebGL renderer reported by the browser (tells GPU from software rendering). */
  gpu: string;
  softwareRendering: boolean;
}

/** Asks the browser which WebGL renderer it really uses (a GPU, or a software rasterizer such as SwiftShader). */
async function readGpu(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return 'WebGL unavailable';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  });
}

export async function readEnvironment(page: Page): Promise<Environment> {
  const cpus = os.cpus();
  const gpu = await readGpu(page);
  return {
    date: new Date().toISOString(),
    browser: `Chromium ${page.context().browser()?.version() ?? 'unknown'} (${process.env.PERF_HEADED ? 'headed' : 'headless, new mode'})`,
    os: `${os.platform()} ${os.release()}`,
    cpu: cpus.length > 0 ? cpus[0].model.trim() : 'unknown',
    cores: cpus.length,
    ramGB: Math.round(os.totalmem() / 2 ** 30),
    node: process.version,
    target: process.env.E2E_BASE_URL ? `external URL: ${process.env.E2E_BASE_URL}` : 'production build (vite build + vite preview)',
    gpu,
    softwareRendering: /swiftshader|llvmpipe|software|microsoft basic render/i.test(gpu),
  };
}

export function environmentMarkdown(env: Environment): string {
  return [
    '| Item | Value |',
    '|---|---|',
    `| Date | ${env.date} |`,
    `| Target | ${env.target} |`,
    `| Browser | ${env.browser} |`,
    `| OS | ${env.os} |`,
    `| CPU | ${env.cpu} (${env.cores} threads) |`,
    `| WebGL renderer | ${env.gpu} |`,
    `| RAM | ${env.ramGB} GB |`,
    `| Node | ${env.node} |`,
  ].join('\n') + (env.softwareRendering
    ? '\n\n> **Warning: the browser is rendering WebGL in software (on the CPU).** FPS and frame times below describe that rasterizer, not the game on a real GPU. Re-run with a GPU-backed browser (see docs/PERFORMANCE.md).'
    : '');
}

export function writeReport(name: string, data: unknown, markdown: string): string {
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(path.join(REPORT_DIR, `${name}.json`), JSON.stringify(data, null, 2));
  const mdPath = path.join(REPORT_DIR, `${name}.md`);
  writeFileSync(mdPath, markdown);
  return mdPath;
}

/** Numeric environment override with a default (e.g. PERF_MIN_FPS=45). */
export function limit(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw === undefined || raw.trim() === '' ? NaN : Number(raw);
  return Number.isFinite(value) ? value : fallback;
}
