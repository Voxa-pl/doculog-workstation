#!/usr/bin/env python3
"""
DocuLog API Yük Testi ve Kararlılık Benchmark Betiği
Eşzamanlı istek (concurrency) altında P50, P95, P99 gecikme sürelerini ve RPS değerlerini ölçer.
Hem Python httpx (worker-pool modeli) hem de Apache Bench (ab) motorlarını destekler.
"""

import sys
import os
import time
import asyncio
import argparse
import json
import subprocess
import re
from typing import List, Dict, Any, Optional
import httpx

def calculate_percentiles(latencies: List[float]) -> Dict[str, float]:
    """Latencies milisaniye cinsinden liste olarak verilir."""
    if not latencies:
        return {"min": 0, "avg": 0, "p50": 0, "p90": 0, "p95": 0, "p99": 0, "max": 0}
    sorted_l = sorted(latencies)
    n = len(sorted_l)
    
    def get_pct(pct: float) -> float:
        k = (n - 1) * (pct / 100.0)
        f = int(k)
        c = f + 1
        if c < n:
            d0 = sorted_l[f] * (c - k)
            d1 = sorted_l[c] * (k - f)
            return round(d0 + d1, 2)
        else:
            return round(sorted_l[f], 2)

    return {
        "min": round(sorted_l[0], 2),
        "avg": round(sum(sorted_l) / n, 2),
        "p50": get_pct(50.0),
        "p90": get_pct(90.0),
        "p95": get_pct(95.0),
        "p99": get_pct(99.0),
        "max": round(sorted_l[-1], 2),
    }

async def worker(
    client: httpx.AsyncClient,
    url: str,
    queue: asyncio.Queue,
    latencies: List[float],
    status_codes: Dict[int, int],
    errors: List[str]
):
    while True:
        try:
            item = queue.get_nowait()
        except asyncio.QueueEmpty:
            break

        t0 = time.perf_counter()
        try:
            resp = await client.get(url, timeout=30.0)
            lat_ms = (time.perf_counter() - t0) * 1000.0
            latencies.append(lat_ms)
            status_codes[resp.status_code] = status_codes.get(resp.status_code, 0) + 1
        except Exception as e:
            lat_ms = (time.perf_counter() - t0) * 1000.0
            latencies.append(lat_ms)
            errors.append(type(e).__name__)
            status_codes[0] = status_codes.get(0, 0) + 1
        finally:
            queue.task_done()

async def benchmark_httpx(
    base_url: str,
    path: str,
    concurrency: int,
    total_requests: int
) -> Dict[str, Any]:
    url = f"{base_url.rstrip('/')}{path}"
    queue = asyncio.Queue()
    for _ in range(total_requests):
        queue.put_nowait(1)

    latencies: List[float] = []
    status_codes: Dict[int, int] = {}
    errors: List[str] = []

    timeout = httpx.Timeout(connect=15.0, read=45.0, write=15.0, pool=45.0)
    limits = httpx.Limits(
        max_keepalive_connections=concurrency,
        max_connections=concurrency * 2,
        keepalive_expiry=30.0
    )

    # Warmup
    try:
        async with httpx.AsyncClient(timeout=10.0) as warmup_client:
            await warmup_client.get(url)
    except Exception:
        pass

    async with httpx.AsyncClient(limits=limits, timeout=timeout) as client:
        start_time = time.perf_counter()
        workers = [
            asyncio.create_task(worker(client, url, queue, latencies, status_codes, errors))
            for _ in range(concurrency)
        ]
        await asyncio.gather(*workers)
        total_time = time.perf_counter() - start_time

    pct = calculate_percentiles(latencies)
    succeeded = sum(count for code, count in status_codes.items() if 200 <= code < 400)
    failed = total_requests - succeeded
    rps = round(total_requests / total_time, 2) if total_time > 0 else 0

    return {
        "engine": "httpx",
        "endpoint": path,
        "concurrency": concurrency,
        "total_requests": total_requests,
        "total_time_sec": round(total_time, 3),
        "rps": rps,
        "succeeded": succeeded,
        "failed": failed,
        "status_codes": status_codes,
        "errors_count": len(errors),
        "latencies": pct
    }

def benchmark_ab(
    base_url: str,
    path: str,
    concurrency: int,
    total_requests: int
) -> Dict[str, Any]:
    url = f"{base_url.rstrip('/')}{path}"
    cmd = ["ab", "-n", str(total_requests), "-c", str(concurrency), "-k", url]
    
    # Warmup
    try:
        subprocess.run(["curl", "-s", "-o", "/dev/null", url], timeout=5)
    except Exception:
        pass

    start = time.perf_counter()
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    duration = time.perf_counter() - start
    output = proc.stdout

    # Parse ab output
    rps_match = re.search(r"Requests per second:\s+([0-9.]+)", output)
    rps = float(rps_match.group(1)) if rps_match else 0.0

    failed_match = re.search(r"Failed requests:\s+([0-9]+)", output)
    failed = int(failed_match.group(1)) if failed_match else 0
    succeeded = total_requests - failed

    def extract_pct(p: int) -> float:
        m = re.search(rf"\s+{p}%\s+([0-9]+)", output)
        return float(m.group(1)) if m else 0.0

    p50 = extract_pct(50)
    p90 = extract_pct(90)
    p95 = extract_pct(95)
    p99 = extract_pct(99)
    p100 = extract_pct(100)

    mean_m = re.search(r"Time per request:\s+([0-9.]+)\s+\[ms\]\s+\(mean\)", output)
    avg_latency = float(mean_m.group(1)) if mean_m else p50

    pct = {
        "min": 0,
        "avg": avg_latency,
        "p50": p50,
        "p90": p90,
        "p95": p95,
        "p99": p99,
        "max": p100,
    }

    status_codes = {200: succeeded}
    if failed > 0:
        status_codes[500] = failed

    return {
        "engine": "ab",
        "endpoint": path,
        "concurrency": concurrency,
        "total_requests": total_requests,
        "total_time_sec": round(duration, 3),
        "rps": rps,
        "succeeded": succeeded,
        "failed": failed,
        "status_codes": status_codes,
        "errors_count": failed,
        "latencies": pct
    }

def print_markdown_table(results: List[Dict[str, Any]]):
    print("\n### Yük Testi Benchmark Sonuçları\n")
    headers = [
        "Motor",
        "Uç Nokta (Endpoint)",
        "Eşzamanlılık (C)",
        "İstek Sayısı",
        "RPS",
        "Ort. (ms)",
        "P50 (ms)",
        "P95 (ms)",
        "P99 (ms)",
        "Maks (ms)",
        "Başarı / Hata"
    ]
    print("| " + " | ".join(headers) + " |")
    print("|" + "|".join(["---" for _ in headers]) + "|")
    for r in results:
        eng = r.get("engine", "httpx")
        ep = r["endpoint"]
        c = r["concurrency"]
        tot = r["total_requests"]
        rps = r["rps"]
        lat = r["latencies"]
        suc_fail = f"{r['succeeded']} / {r['failed']}"
        print(f"| {eng} | `{ep}` | {c} | {tot} | **{rps}** | {lat['avg']} | {lat['p50']} | {lat['p95']} | {lat['p99']} | {lat['max']} | {suc_fail} |")
    print("\n")

async def main():
    parser = argparse.ArgumentParser(description="DocuLog API Benchmark Runner")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="Base URL of DocuLog API")
    parser.add_argument("--concurrency", nargs="+", type=int, default=[50, 100, 200], help="Concurrency levels (e.g. 50 100 200)")
    parser.add_argument("--requests-per-c", type=int, default=10, help="Multiplier for total requests = concurrency * multiplier")
    parser.add_argument("--endpoints", nargs="+", default=["/api/documents", "/api/documents/summary", "/api/system/status", "/"], help="Endpoints to test")
    parser.add_argument("--engine", choices=["httpx", "ab", "both"], default="httpx", help="Benchmark engine")
    parser.add_argument("--output-json", help="Path to save JSON benchmark results")
    args = parser.parse_args()

    print(f"============================================================")
    print(f"  DocuLog API Benchmark & Load Test")
    print(f"  Hedef: {args.base_url}")
    print(f"  Motor: {args.engine}")
    print(f"  Eşzamanlılık Seviyeleri: {args.concurrency}")
    print(f"  Uç Noktalar: {args.endpoints}")
    print(f"============================================================")

    all_results = []
    engines = ["httpx", "ab"] if args.engine == "both" else [args.engine]

    for eng in engines:
        for c in args.concurrency:
            req_count = max(c * args.requests_per_c, 200)
            for ep in args.endpoints:
                print(f"[*] [{eng}] Test ediliyor: {ep} (C={c}, N={req_count})...", end="", flush=True)
                if eng == "httpx":
                    res = await benchmark_httpx(args.base_url, ep, c, req_count)
                else:
                    res = benchmark_ab(args.base_url, ep, c, req_count)
                all_results.append(res)
                print(f" Tamamlandı! RPS: {res['rps']}, P50: {res['latencies']['p50']}ms, P95: {res['latencies']['p95']}ms, P99: {res['latencies']['p99']}ms")
                await asyncio.sleep(0.2)

    print_markdown_table(all_results)

    if args.output_json:
        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump(all_results, f, indent=2, ensure_ascii=False)
        print(f"Sonuçlar kaydedildi: {args.output_json}")

if __name__ == "__main__":
    asyncio.run(main())
