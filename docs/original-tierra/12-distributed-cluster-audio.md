# Networked / Distributed Tierra, Beagle Monitoring, and Audio

> **Scope & status.** This document catalogs the *optional* distributed layer of Tom Ray's Tierra
> v6.02 (`reference/tierra-v6.02/`). Everything here is gated behind the **`NET`** compile-time
> macro (Beagle behind `BGL`, audio behind `TIEAUDIO`). A single-machine Tierra soup is fully
> functional without any of it — this layer is **separable and additive**. The intent is a *light*
> "what & why", not an exhaustive protocol dump; Pass 1 already enumerated the message codes.

---

## Overview: the distributed vision

Networked Tierra turns a single soup into one node of a **cluster of soups running on many hosts**
across the Internet. Creatures are no longer confined to one machine: a creature can **migrate
("surf")** to a remote node, where it resumes replicating in that node's soup. The evolutionary
motivation is to add *geography and heterogeneity* as selective forces — different machines have
different speeds, populations, and network latencies, so creatures that learn to sense the network
and preferentially surf toward fast, under-populated, or high-fecundity nodes gain a reproductive
edge. The network essentially becomes a new, exploitable dimension of the environment.

The layer has three loosely-coupled pieces, each independently compilable:

1. **Cluster / migration** — the soup nodes plus a **cluster server** (`clstrsrvr`) that maintains
   topology and telemetry. This is the core "distributed Tierra".
2. **Beagle** (`Bglclnt` / `Bglserv` / `Bglcom`) — a remote **monitoring & control GUI protocol**
   over TCP. Purely observational/operational; independent of the migration layer.
3. **Audio** (`tieaudsrv` / `tieaudcl`) — sonification of population data for human listening.

---

## Cluster & migration

**Topology.** Each running soup is a *node*. A **cluster server** (`clstrsrvr/clstrsrvr.c`) tracks
the membership of a local cluster and exchanges data with peer cluster servers, forming a two-level
hierarchy:

- **`IPMapC`** — the *local cluster* node map (peers a creature can surf to directly).
- **`IPMapS`** — the *cluster-server* map (other clusters, reached via `sval3=1` remote migration).

Nodes join/leave via the map file (`MapFileC` / `MapFileS`) and address broadcasts (`Addr_send`,
`SENDADDRTAG`). The server can **auto-add/auto-remove** nodes (`AutoAddIPMap`, `AutoRemIPMap`) and
prunes nodes that go silent (`SpdZeroTime`, `PendReqTime`). Each node advertises its own state via
`UpdateOwnMapNode`. `OnLineStat` gates whether a node participates at all.

**The `surf` / `surff` instructions.** In the opcode maps (`opcode.map`, `gb-Netcluster/`) both
`surf` and `surff` are aliases bound to the C function **`migrate()`** in `instruct.c`. Operands:
`is.sval` = target IP, `is.sval2` = target port, `is.sval3` = 0 for local-cluster / 1 for
remote-cluster migration. `migrate()`:

- refuses if population is at `NumCellsMin` or the cell has zero `fecundity` (don't drain a dying
  soup);
- picks a destination with `ChooseIP` (creatures usually supply a target sensed via `getipp`);
- checks subnet policy with `EmigSubNetChk` (see below);
- calls **`NEject()`** to serialize the genome (XDR) into an `EMIGRATETAG` message and hand it to
  `TieCommSend`, then reaps the local copy with `REAP_SURF`.

**`NEject()`** (`instruct.c`) is the ejection primitive: for the NET build it *sends* the genome to
the target node; for the non-NET build the same call simply *kills* the cell. It respects a
**bandwidth cap** — `TieCommSend` returns a "sufficient remaining bandwidth capacity" flag
(`sufrembndcap`); if the link is saturated the genome is **not** erased and the surf silently fails,
throttling migration to configured limits (`MaxOutBandWidth`, `SrvrOutBndFrac`, `TieMinOutBndFrac`,
`IntrvlOutBndCap`).

**Immigration.** Incoming `EMIGRATETAG` messages are decoded in `netfunc.c` (`mesg_xdr.c` handles
the wire form) and the genome is instantiated as a new cell in the local soup. A **remote divide**
variant lets a *daughter* be born directly on a remote node (`REAP_DIVIDE`; the divide path in
`instruct.c` sets `is.onodetype` / target node+port and `NEject`s the daughter). `EjectToSelf`
handles the degenerate "target is me" case.

**Network reap codes** (`tierra.h`) distinguish why a cell left a soup — used by analysis/telemetry:

| Code | Value | Meaning |
|------|-------|---------|
| `REAP_APOCALYPSE` | 101 | killed by a network-wide apocalypse |
| `REAP_SUBNET`     | 102 | tried to surf to a disallowed subnet (died in transit) |
| `REAP_SURF`       | 103 | normal successful migration |
| `REAP_DIVIDE`     | 104 | daughter born on a remote node |

---

## Apocalypse & subnets

**Apocalypse** is a *network-wide extinction event*. `Apocalypse()` (`tierra.c`) reaps the entire
local population down to `NumCellsMin` with `REAP_APOCALYPSE`. It is triggered on a schedule counted
in millions of instructions: `ApocalypseFreq` sets the base period, with `ApocFixFrac` (fixed) and
`ApocRanFrac` (random) fractions producing a partly-randomized next-fire time so nodes don't all die
in lockstep. The **cluster server can also broadcast** an apocalypse across the cluster
(`clstrsrvr.c`: `ApocalypseNow` → `IPMapTPing_send`, with `SrvrApocSleep` / `FirstSrvrApocWait`
pacing). `MigrApocalypseMesg` notifies Beagle when tracked cells die.

*Evolutionary purpose:* mass extinctions periodically clear dominant lineages and open the soup to
recolonization (by immigrants and survivors), preventing monoculture stagnation and rewarding
creatures that spread across many nodes so that no single apocalypse wipes out the whole species.

**Subnets** partition the cluster into groups that are semi-isolated for migration. `SubNetCnt`
(number of subnets) and `TieSubNet` (this node's subnet) define membership. **`EmigSubNetChk()`**
(`netfunc.c`) is the emigration gatekeeper: with more than one subnet it permits a surf only if the
destination subnet is under-populated (`subnetpop <= NumCellsMin * nodecount`) *or* is the source's
own subnet — otherwise the migrant dies with `REAP_SUBNET`. Subnet membership can itself **drift over
time** (`BasSubNetChgFrq`, `SubNetChgFrqRanFrac/FixFrac`, `TieCommChgSubNet`), and a subnet change can
probabilistically trigger an apocalypse (`SubNetChgApocProb`). Subnets thus create allopatric
("island") population structure — a classic driver of diversification.

---

## TPing telemetry

Nodes continuously exchange **TPing** ("Tierra ping") messages so both the cluster server and the
*creatures themselves* can make informed migration decisions. The payload is **`TPingData`**
(`instruct.c` COMMENT block documents the wire layout); key fields:

- `FecundityAvg` — average fecundity at death over the last million instructions,
- `Speed` — average instructions/second (host speed / current load),
- `NumCells`, `SoupSize`, `AgeAvg`, `InstExec` — population and activity,
- `TransitTime` — round-trip latency in ms,
- `Fresh` / `Time` — freshness/clock, `OS` — platform tag.

Flow: `tpingsnd` / `tpingrec` instructions let a creature ping a node and read the reply; **`getipp`**
writes a chosen node's `TPingData` into the soup so the creature can *read the network's state* and
target its surf (e.g. toward high `Speed` / low `NumCells` / high `FecundityAvg`). `getip` returns
just an address. The server aggregates TPingData (`IPMapTPing_send`, `WriteTPingDat` → `ping.dat`
when `PingDatLog`) to drive node selection, staleness pruning, and the monitoring displays. In short:
**TPing is the sensory substrate** that makes intelligent, fitness-directed migration possible.

---

## Beagle monitoring protocol

**Beagle** is a separate **remote GUI for observing and controlling a running soup** — a debugger /
inspector, *not* part of the migration machinery. Architecture:

- **`Bglcom`** — shared wire layer: message definitions (`bgl.h`, `bgl_define.h`), **XDR**
  encode/decode (`bgl_dat_xdr.{x,c}`), and TCP transport (`bgltcp.c`). Privilege levels live here:
  `BGL_PRIV_S` = `'s'` (super / full control), `BGL_PRIV_N` = `'n'` (normal / read-mostly),
  `BGL_PRIV_F` = `'f'`.
- **`Bglserv`** (`tbgl_*`) — the server side *embedded in the Tierra process*. It runs a
  **finite-state machine** (`tbgl_fsm.h`: state × message-category → action) that turns remote
  commands into front-end menu operations, cell inspection, breakpoints, injection, etc., enforcing
  privilege per command (`tbgl_com.c`).
- **`Bglclnt`** (`beagle*` + `clnt_*`) — the client, organized as **managers** (Socket, Migration,
  Overview) and a family of **message modules** grouped by category: Connect, Debug, File, Info,
  Migr, Misc, Overview (Ov), TPingC, TPingS, Var. It has its own decode FSM (`clnt_fsm.h`).
- **UIs** — `Bgl-GUI_X11` (Motif/X11 windows) and `Bgl-UI_stdio` (text) render what the client
  receives.

Message categories span connection/auth, live **stats/plan**, histograms (size/gen/mem/efficiency),
**overview (OV)** memory maps, per-cell **debug** (micro-step, breakpoints, register/memory exam &
alter), **migration tracking** (follow a tagged creature as it surfs — `BGL_MIGRATION`, ports below),
**TPing** views (`TPING_S`/`TPING_C`), and **variable** get/set. Beagle talks TCP on
**17501** (default GUI connection) with a short-connection **migration control port 17503**.

---

## Transports & authentication

**Transports** are selected at compile time by `NETTYPE` (`tiecomm.h`):

- `UDP` (0), `UDPASM` (1, UDP with assembly/reliability layer — "UDP tunnel"), `TCP` (2).

The migration/cluster layer uses these via `TieCommSend` / `TieRcvIncMsg*`; UDP variants carry an MTU
(`TieMTU`) and packet pacing (`PktSndDelay`), while TCP has select-timeout knobs. All creature/genome
and TPing payloads are encoded with **XDR** (`mesg_xdr.c`, `xdr_mem.c`) for cross-architecture
portability (nodes may be different OSes/endianness — hence the `OS` tag in TPingData). Message
backlog and age are bounded (`TieMsgBkLog`, `TieMsgMaxAge`); XDR buffers cap at `XDRBufMaxSize`.

**Ports** (defaults):

| Port | Role | Defined in |
|------|------|-----------|
| 17501 | Beagle monitor / GUI connection | `soup_in.h` (`MonPort`), `clnt_global.h` |
| 17503 | Beagle migration-control short connection | `soup_in.h` (`MigrCtrlPort`) |
| 18001 | Local Tierra node (cluster migration/TPing) | `soup_in.h` / `clstrsetup.h` (`LocalPort`) |

**Authentication.** Beagle access is guarded by a password file managed by **`tbglpasswd`**
(`tierra/tbglpasswd.c`) — a small utility that stores user + `crypt()`-salted password entries. On
connect, the server assigns the session a **privilege** (`'s'`/`'n'`/`'f'`) that limits which control
commands are honored (`tbgl_com.c`). This protects a live, network-reachable soup from unauthorized
control.

---

## Audio (sonification)

Compiled with `TIEAUDIO`, **`tieaudsrv`** turns the soup into sound. When the gene-banker is active,
`SndTieAudDat()` streams simple `"size N;pop M;\n"` records (size class + population, thresholded by
`AudioPopThresh`) over a TCP socket (`AudioPort`) to a connected client (`tieaudcl`), which maps
population dynamics per size-class to audio. `TIEAUDMP` optionally logs the same stream to
`audio.log`. It is purely a human-perception aid — an ambient, real-time sonification of the
evolving population — and is wholly independent of migration, Beagle, and the cluster server.

---

## Key files

- **Migration / instructions:** `tierra/instruct.c` (`migrate`, `NEject`, `tpingsnd/rec`, `getipp`,
  `getip`), `tierra/netfunc.c` (immigration, `EmigSubNetChk`, `CalcSubNetPop`), `tierra/tierra.c`
  (`Apocalypse`), `tierra/tierra.h` (reap codes).
- **Cluster server:** `clstrsrvr/clstrsrvr.c`, `clstrsrvr/clstrsetup.{c,h}` (all cluster params).
- **Transport / wire:** `tierra/tiecomm.{c,h}`, `tierra/mesg_xdr.c`, `tierra/xdr_mem.c`,
  `tierra/soup_in.h` (ports).
- **Beagle:** `Bglcom/` (wire + XDR + `bgl_define.h` privileges), `Bglserv/tbgl_*`, `Bglclnt/`,
  `Bgl-GUI_X11/`, `Bgl-UI_stdio/`; auth in `tierra/tbglpasswd.c`.
- **Audio:** `tierra/tieaudsrv.{c,h}`, `tierra/tieaudcl.c`.
