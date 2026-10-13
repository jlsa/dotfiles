import { describe, expect, test } from "bun:test"
import { currentNetwork, describeNetwork, matchNetwork, parseArp, parseOption, parseRoute, toKnownNetwork } from "./network"

const routeOutput = `   route to: default
destination: default
       mask: default
    gateway: 192.168.0.1
  interface: en0
      flags: <UP,GATEWAY,DONE,STATIC,PRCLONING,GLOBAL>
`

describe("parsers", () => {
  test("reads the gateway and interface from route", () => {
    expect(parseRoute(routeOutput)).toEqual({ gateway: "192.168.0.1", interface: "en0" })
    expect(parseRoute("route: writing to routing socket: not in table\n")).toEqual({ gateway: undefined, interface: undefined })
  })

  test("reads and zero-pads the MAC from arp", () => {
    expect(parseArp("? (192.168.0.1) at b0:19:21:fa:70:f0 on en0 ifscope [ethernet]\n")).toBe("b0:19:21:fa:70:f0")
    expect(parseArp("? (10.0.0.1) at 0:1C:42:0:0:18 on en0 ifscope [ethernet]\n")).toBe("00:1c:42:00:00:18")
    expect(parseArp("? (10.0.0.1) at (incomplete) on en0 ifscope [ethernet]\n")).toBeUndefined()
    expect(parseArp("")).toBeUndefined()
  })

  test("reads an ipconfig option", () => {
    expect(parseOption("corp.example\n")).toBe("corp.example")
    expect(parseOption("\n")).toBeUndefined()
  })
})

describe("currentNetwork", () => {
  test("combines the commands into a fingerprint", () => {
    const calls: string[][] = []
    const run = (args: string[]) => {
      calls.push(args)
      if (args[0] === "route") return routeOutput
      if (args[0] === "arp") return "? (192.168.0.1) at b0:19:21:fa:70:f0 on en0 ifscope [ethernet]\n"
      if (args[3] === "server_identifier") return "192.168.0.1\n"
      if (args[3] === "domain_name") return "lan\n"
      return ""
    }
    expect(currentNetwork(run)).toEqual({ interface: "en0", router: "192.168.0.1", routerMac: "b0:19:21:fa:70:f0", dhcpServer: "192.168.0.1", domain: "lan" })
    expect(calls).toEqual([
      ["route", "-n", "get", "default"],
      ["arp", "-n", "192.168.0.1"],
      ["ipconfig", "getoption", "en0", "server_identifier"],
      ["ipconfig", "getoption", "en0", "domain_name"],
    ])
  })

  test("leaves out what is unknown and gives up without a default route", () => {
    expect(currentNetwork((args) => (args[0] === "route" ? routeOutput : ""))).toEqual({ interface: "en0", router: "192.168.0.1" })
    expect(currentNetwork(() => "")).toBeUndefined()
  })
})

describe("matchNetwork", () => {
  const work = toKnownNetwork({ interface: "en0", router: "10.1.0.1", routerMac: "aa:bb:cc:dd:ee:ff", dhcpServer: "10.1.0.2", domain: "corp.example" }, "work", new Date("2026-10-13T08:00:00Z"))
  const home = toKnownNetwork({ interface: "en0", router: "192.168.0.1", routerMac: "b0:19:21:fa:70:f0" }, "home")

  test("matches on the router MAC", () => {
    expect(matchNetwork({ interface: "en1", router: "10.1.5.1", routerMac: "aa:bb:cc:dd:ee:ff" }, [home, work])?.label).toBe("work")
  })

  test("matches on DHCP server plus domain when the MAC differs", () => {
    expect(matchNetwork({ interface: "en0", router: "10.1.7.1", routerMac: "11:22:33:44:55:66", dhcpServer: "10.1.0.2", domain: "corp.example" }, [work])?.label).toBe("work")
    expect(matchNetwork({ interface: "en0", router: "10.1.7.1", dhcpServer: "10.1.0.2", domain: "other.example" }, [work])).toBeUndefined()
    expect(matchNetwork({ interface: "en0", router: "10.1.7.1", dhcpServer: "10.1.0.2" }, [work])).toBeUndefined()
  })

  test("never matches on the router IP alone, or without a fingerprint", () => {
    expect(matchNetwork({ interface: "en0", router: "10.1.0.1" }, [work])).toBeUndefined()
    expect(matchNetwork(undefined, [work])).toBeUndefined()
  })

  test("toKnownNetwork keeps only what is known", () => {
    expect(work).toEqual({ label: "work", router: "10.1.0.1", routerMac: "aa:bb:cc:dd:ee:ff", dhcpServer: "10.1.0.2", domain: "corp.example", learnedAt: "2026-10-13T08:00:00.000Z" })
    expect(Object.keys(home)).toEqual(["label", "router", "routerMac", "learnedAt"])
  })

  test("describes a network on one line", () => {
    expect(describeNetwork(work)).toBe("router 10.1.0.1  mac aa:bb:cc:dd:ee:ff  dhcp 10.1.0.2  domain corp.example")
    expect(describeNetwork({ interface: "en0", router: "192.168.0.1" })).toBe("router 192.168.0.1  via en0")
  })
})
