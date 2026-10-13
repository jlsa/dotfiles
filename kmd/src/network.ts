import type { KnownNetwork } from "./store"

/** What identifies the network this Mac is on right now, without needing the (redacted) SSID. */
export interface NetworkFingerprint {
  interface: string
  router: string
  routerMac?: string
  dhcpServer?: string
  domain?: string
}

export type CommandRunner = (args: string[]) => string

/** Runs a command and returns its stdout, or an empty string when it fails. */
export function runCommand(args: string[]): string {
  try {
    const result = Bun.spawnSync(args, { stdout: "pipe", stderr: "pipe" })
    return result.exitCode === 0 ? result.stdout.toString() : ""
  } catch {
    return ""
  }
}

/** Output of `route -n get default`. */
export function parseRoute(output: string): { gateway?: string; interface?: string } {
  const field = (name: string) => new RegExp(`^\\s*${name}:\\s*(\\S+)`, "m").exec(output)?.[1]
  return { gateway: field("gateway"), interface: field("interface") }
}

/** Output of `arp -n <ip>`, as a zero-padded lower-case MAC. */
export function parseArp(output: string): string | undefined {
  const match = /\bat ((?:[0-9a-fA-F]{1,2}:){5}[0-9a-fA-F]{1,2})\b/.exec(output)
  if (!match) return undefined
  return match[1]
    .split(":")
    .map((octet) => octet.toLowerCase().padStart(2, "0"))
    .join(":")
}

/** Output of `ipconfig getoption <if> <option>`. */
export function parseOption(output: string): string | undefined {
  const value = output.trim()
  return value || undefined
}

export function currentNetwork(run: CommandRunner = runCommand): NetworkFingerprint | undefined {
  const route = parseRoute(run(["route", "-n", "get", "default"]))
  if (!route.gateway || !route.interface) return undefined
  const fingerprint: NetworkFingerprint = { interface: route.interface, router: route.gateway }
  const routerMac = parseArp(run(["arp", "-n", route.gateway]))
  if (routerMac) fingerprint.routerMac = routerMac
  const dhcpServer = parseOption(run(["ipconfig", "getoption", route.interface, "server_identifier"]))
  if (dhcpServer) fingerprint.dhcpServer = dhcpServer
  const domain = parseOption(run(["ipconfig", "getoption", route.interface, "domain_name"]))
  if (domain) fingerprint.domain = domain
  return fingerprint
}

/** A known network matches on the router's MAC, or on DHCP server plus domain. */
export function matchNetwork(fingerprint: NetworkFingerprint | undefined, known: KnownNetwork[]): KnownNetwork | undefined {
  if (!fingerprint) return undefined
  return known.find((network) => {
    if (fingerprint.routerMac && network.routerMac && fingerprint.routerMac === network.routerMac) return true
    return Boolean(fingerprint.dhcpServer && fingerprint.domain && network.dhcpServer === fingerprint.dhcpServer && network.domain === fingerprint.domain)
  })
}

export function toKnownNetwork(fingerprint: NetworkFingerprint, label: string, now = new Date()): KnownNetwork {
  return {
    label,
    router: fingerprint.router,
    ...(fingerprint.routerMac ? { routerMac: fingerprint.routerMac } : {}),
    ...(fingerprint.dhcpServer ? { dhcpServer: fingerprint.dhcpServer } : {}),
    ...(fingerprint.domain ? { domain: fingerprint.domain } : {}),
    learnedAt: now.toISOString(),
  }
}

export function describeNetwork(network: NetworkFingerprint | KnownNetwork): string {
  const parts = [`router ${network.router}`]
  if (network.routerMac) parts.push(`mac ${network.routerMac}`)
  if (network.dhcpServer) parts.push(`dhcp ${network.dhcpServer}`)
  if (network.domain) parts.push(`domain ${network.domain}`)
  if ("interface" in network) parts.push(`via ${network.interface}`)
  return parts.join("  ")
}
