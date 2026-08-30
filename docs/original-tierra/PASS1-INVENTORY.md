# Tierra v6.02 — Pass 1 Inventory (enumeration + derived taxonomy)

**Source:** `reference/tierra-v6.02/` (acisternino pristine mirror, all code © Tom Ray).
**Purpose:** a flat, faithful enumeration of *every named thing* in original Tierra,
grouped into categories that emerged from the material. This is the **master checklist**
that drives Pass 2 (deep-dive each item) and ultimately the reverse-engineered spec/PRD.
This is **not** the spec and makes **no** comparison to the current `tierra26` reimplementation.

> Counts here are as-reported by the Pass-1 sweep and include some to-be-reconciled
> discrepancies (flagged in **Open Questions** at the end) — that reconciliation is Pass-2 work.

---

## Derived taxonomy (18 categories)

A. Virtual CPU / machine model · B. Instruction set (ISA) · C. Memory / soup ·
D. Scheduler / slicer · E. Reaper / death · F. Reproduction / life cycle ·
G. Genetics / variation operators · H. Genebank / genotype tracking · I. Disturbance ·
J. Multi-cellularity / threads / tissue · K. Randomness · L. Statistics / bookkeeping / output ·
M. Persistence / file formats · N. Tools / utilities · O. User interfaces ·
P. Networked / distributed Tierra · Q. Configuration / build · R. Observed evolutionary phenomena

---

## A. Virtual CPU / machine model
*(tierra.h, globals.h, instruct.c, Inst)*

- [ ] `cell` struct — the organism: `Dem` demographics, `Que` queue links, `Mem mm` main + `Mem md` daughter memory, `CpuA c` CPU array, `ld` alive flag, thread-analysis data
- [ ] `Cpu` struct — one virtual CPU: register array `re[ALOC_REG]`, `ip`, `sp`, stack `st[STACK_SIZE]`, `fl` flags, `cf` CRflags, sync, thread ids, call-level tracking
- [ ] `CpuA` — array of CPUs per cell (`MaxCpuPerCell`), active-CPU index, thread count, signal buffer, sync groups, IO buffer
- [ ] Registers: general regs (NUMREG=6: a,b,c,d,e,f), IP, SP
- [ ] `Flags` — E (error), S (sign), Z (zero), B (bit-mode), D (direction)
- [ ] `CRflags` — CPU register toggles (source/dest/segment enable)
- [ ] Stack — `STACK_SIZE` = 10
- [ ] Multiple CPUs per cell + sync groups (`Sync`, `SyncA`, `CSync`) — parallelism within an organism
- [ ] Shadow registers (compile-time `SHADOW`: ALOC_REG 6→12)
- [ ] Fetch/decode/execute pipeline: `FetchDecode()`, per-instruction `execute`/`decode` function pointers, `PInst` decode→execute parameter struct
- [ ] Bit-mode vs word addressing (B flag; Hamming-distance IP mapping when `StrictIP=0`)

## B. Instruction set (ISA)
*(instruct.c, decode.c, opcode.map, soup_in.h idt[], Inst)*

- [ ] **`InstDef idt[]` master table** — reported ~123–134 entries incl. conditionals (NET/IO/PLOIDY/SHADOW)
- [ ] **`opcode.map`** runtime-loadable set — 64 instructions (fields: opcode, mnemonic, execute fn, decode fn, register-assignment string, IDflags)
- [ ] Documented **Sets 0 / 1–3 / 8** (doc §8) — reconcile against idt[]/opcode.map
- [ ] `use_port_opcode.map` — alternate port-specific set (67 lines)
- [ ] `change` file — mnemonic aliases (e.g. `dec_c`→`decC`, `jmp`→`jmpo`, `movab`→`movBA`)

Instruction groups (bare mnemonics, union across sources — dedupe/verify in Pass 2):
- [ ] **Templates / nop:** nop0, nop1
- [ ] **Arithmetic:** add, add2, sub, sub2, subAAC, subBAC, subCAB, subCBA, subCCD, mul, mul2, div, div2, idiv, inc, incA, incB, incC, dec, dec2, dec4, decC, zero, zeroD, rand
- [ ] **Bitwise/logic:** and, and2, ior, ior2, xor, xor2, not, not0, notl, shl, shr
- [ ] **Stack:** push(A–F), pop(A–F), stup, stdn, rollu, rolld, exch, enter, join, getregs
- [ ] **Register move:** movBA, movDC, movdd, movdi(/2/4), movid(/2/4), movii(/2/4)
- [ ] **Address find:** adrb, adrf, adro, decadr
- [ ] **Jumps/flow:** jmpb, jmpf, jmpo, decjmp, call, tcall, ret, halt, slicexit, ttime
- [ ] **Conditionals/skip:** ifE, ifS, ifZ, ifequal, ifgrtr, ifless, ifsig, ifz, skip
- [ ] **Reg-flag toggles:** clrf, clrfi, clrrf, togsr, togdr, toger, togbf, togdf, offset, offAACD, offBBCD
- [ ] **Reproduction:** mal, divide
- [ ] **Sync/signal:** csync
- [ ] **I/O (compile `IO`):** get, put, puticc
- [ ] **Ploidy tracks (compile `PLOIDY>1`):** trso, trde, trex
- [ ] **Shadow (compile `SHADOW`):** A, B, C, D
- [ ] **Network/migration (compile `NET`):** surf, surff, tpings, tpingr, getip, getipp, getippf
- [ ] Template addressing mechanism — complementary nop-template matching, forward/backward/outward search
- [ ] Addressing/decode modes — the decode function family (pnop, dec1d2s, decadr, ptcall, …)

## C. Memory / soup
*(memalloc.c, memtree.c, rambank.c, diskbank.c)*

- [ ] `soup` — the shared address space (`HpInst`), `SoupBot`/`SoupTop`, `MinSoupSize`/`MaxSoupSize`
- [ ] `MemAlloc()` with **6 `MalMode` strategies**: 0 first-fit, 1 better-fit, 2 random, 3 near-mother, 4 near-dx, 5 near-sp
- [ ] Allocation tuning: `MalTol`, `MalReapTol`, `MalSamSiz`, `MaxMalMult`, `MaxFreeBlocks`
- [ ] Free-memory structure: `MemFr` Cartesian tree (l/r/p sons, address, size), `FreeMemry[]`, `FreeBlocks`
- [ ] `WhichCell()` — address→cell lookup
- [ ] **Protection:** WRITEPROT / READPROT / EXECPROT modes; `IsPriv`, `IsBitPriv`, `PrivWrite/Read/Exec`; unix-chmod-style `MemModeFree/Mine/Prot`
- [ ] `DeadMemInit` — on-free behavior (0 no-change, 1 zero, 2 randomize)

## D. Scheduler / slicer
*(slicers.c)*

- [ ] `SlicerQueue` — round-robin time-slice queue
- [ ] `RanSlicerQueue` — randomized queue order
- [ ] `SlicerPhoton` — photon/energy-based slice allocation (`PhotonPow`, `PhotonWidth`, `PhotonWord`)
- [ ] `TimeSlice` — central scheduling loop
- [ ] Slice sizing: `SliceSize`, `SizDepSlice` (size-dependent), `SlicePow`, `SliceStyle`, `SlicFixFrac`, `SlicRanFrac`
- [ ] Slicer queue ops: EntBotSlicer, IncrSliceQueue, DecrSliceQueue, RmvFrmSlicer (links `Que.n_time`/`p_time`)

## E. Reaper / death
*(bookeep.c, queues.c)*

- [ ] Reaper queue — age-ordered, `TopReap`/`BottomReap` sentinels (links `Que.n_reap`/`p_reap`)
- [ ] `reaper()`, `ReapCell()`, `ReapBookeep()`, `ReapCheck()`, `reaped` flag
- [ ] Queue movement — `UpReaper()`/`DownReaper()` by error/fecundity
- [ ] Reap tuning: `LazyTol`, `ReapRndProp`, `EjectRate`, `DropDead`
- [ ] **Termination codes:** REAP_LAZY(1), REAP_DISTURB(2), REAP_HALT(3), REAP_NON_NET_EJECT(4), REAP_SOUP_FULL(5), REAP_APOCALYPSE(101), REAP_SUBNET(102), REAP_SURF(103), REAP_DIVIDE(104)

## F. Reproduction / life cycle
*(instruct.c mal/divide, bookeep.c)*

- [ ] Life cycle: `mal` (allocate daughter) → copy loop (`movii`) → `divide` (release)
- [ ] `DivideBookeep()`, `MovPropThrDiv` (min proportion of daughter written by mov before divide legal)
- [ ] `DivSameSiz`, `DivSameGen`, `MateSizeEp`, `MaxCpuPerCell`
- [ ] Fecundity queue — sorted by reproduction rate (`Que.h_fecu`/`l_fecu`)
- [ ] `Metabolism` struct — inst, instP, flags, mov_daughter, `BreedTrue`
- [ ] `LifeCycFrct` — life-cycle fraction for gene execution

## G. Genetics / variation operators
*(bookeep.c, genio.c)*

- [ ] Background mutation `mutate()` — `GenPerBkgMut`, `RateMut`, `CountMutRate`
- [ ] Flaw / "cosmic ray" `flaw()` — `GenPerFlaw`, `RateFlaw`, `CountFlaw`
- [ ] Copy/move mutation — `GenPerMovMut`
- [ ] Divide mutation — `GenPerDivMut`
- [ ] Instruction-level operators: `InsertionInst`, `DeletionInst`, `CrossoverInst`, `CrossoverInstSamSiz` — rates `GenPerInsIns`, `GenPerDelIns`, `GenPerCroIns`, `GenPerCroInsSamSiz`
- [ ] Segment-level operators: `InsertionSeg`, `DeletionSeg`, `CrossoverSeg` — rates `GenPerInsSeg`, `GenPerDelSeg`, `GenPerCroSeg`; `CountSegments`, `FindStartSegN`, `FindEndSegN`
- [ ] `MutBitProp` — proportion of mutations that are bit-flips
- [ ] `GeneticOps()` / `MutationOps()` dispatch

## H. Genebank / genotype tracking
*(genio.c, genebank.h, genebank.x, arg.c)*

- [ ] Genotype naming — size + 3-char label (e.g. `0080aaa`); `Genotype`, `GList`, `GenDef`
- [ ] In-memory genebank: `CheckGenotype`, `NewGenotype`, `DivGenBook`, `ReapGenBook`, `IsInGenBank`, `IsInGenQueue`, `GBGarbageCollect`, `VerifyGB`
- [ ] On-disk genebank (`DiskBank`, `GeneBnker`): StartGeneBanker/Stop/Open/Close, `GenebankPath`
- [ ] Save policy: `CumGeneBnk` (cumulative vs overwrite), `SavMinNum`, `SavThrPop`, `SavThrMem`, `SaveFreq`, `SavRenewMem`, `TierraLog`
- [ ] Size-class lists `SList` (per-size genotype tables, hash lookup, avg reproductive efficiency)
- [ ] `GBGenome`, archive index `indx_t` (genotype/parent/size/hash/bits/origin/metabolism/ploidy/track/cpu-count)

## I. Disturbance
*(bookeep.c)*

- [ ] Periodic mass extinction — `DistFreq` (× recovery time), `DistProp` (fraction killed), `DistNext` (next event)

## J. Multi-cellularity / threads / tissue
*(thrdana.c, threadtree.c, configur.h PLOIDY)*

- [ ] Multi-track (polyploid) genomes — `PLOIDY>1`, `Instruction = Inst[PLOIDY]`, track-switch instrs (trso/trde/trex), `JmpSouTra`, `JumpTrackProb`
- [ ] Thread analysis — `ThreadAnalysis`, `ThrdAnaCollTst`, `ThrdAnaDatColl/Save`, `ThrdAnaMaxFec`, `ThrdAnaStop`, `ThrdAnaTrmCode`, `ThrdAnaPartSave`
- [ ] Call-level tracking — `CallLvlIntrv` tree, call/return instrumentation, promotions
- [ ] Tissue model — `TissueDef`, `BodyDef`, `SplitTissueAna`, `ThdTis`, `ofst_thd`, `MinComSizRat` (narrow-tissue comm)
- [ ] Multi-cellular model (doc §12)
- [ ] Soup-update tracing — `SouUpdTrk`, `SoupUpdEvent`, soupupdtrc tool

## K. Randomness
*(trand.c)*

- [ ] Custom RNG — `tdrand()` (double), seeded `tsrand()`, `TrandArray[98]` state, indices RandIx1/2/3; typed variants (tuintrand, tlrand, tcrand, …); `seed` param (0 = time-based)

## L. Statistics / bookkeeping / output
*(bookeep.c, operator.c, ttools.c)*

- [ ] `plan()` / `stats()` — main metrics loop
- [ ] Averages/maxes — `CalcAverages`, `CalcSoupStats`, `CalcSoupMaxes`, `CalcGBStats`, `CalcGBMaxes` (AvgPop, FecundityAvg, AgeAvg, MaxPop, …)
- [ ] Birth/death accounting — BirthNum/DeathNum/BirthLocal/BirthInject/BirthEject, RepNum/RepInst/RepInstEff, fecundity sums
- [ ] Speed/time — `Speed`, `FESpeed`, `TimeGenIndiv`, `Generations`, `SpeedUpdate`, `MinSpeed`
- [ ] Disk output — `OutDisk()`, `DiskOut`, `break.n` files (`BrkupSiz`), `core_out`, `soup_out`
- [ ] CPU-load governor — `CpuLoadLimitPeriod`, `CpuLoadLimitProp`, `TierraNice`, `TierraSleep`
- [ ] Histograms — size / gene / memory / efficiency(size) / efficiency(gene)

## M. Persistence / file formats
*(genio.c, arg.c, reseq.c, data files)*

- [ ] `.tie` — creature/genome file (header: version, genotype id, coords, parent, ploidy, track; CODE section; track sections)
- [ ] `.gdf` — gene-definition file (gene name, start/end offset, track; e.g. sel, dif, repS, copL, dev, senX, pad)
- [ ] `.gen` — genebank archive (XDR-encoded genome + metadata)
- [ ] `opcode.map` — instruction-set map file (`IMapFile`)
- [ ] `soup_in` — parameter file (+ `soup_in.h` schema)
- [ ] `core_out` / `soup_out` — saved system/soup state; restart support
- [ ] `tierra.log` — activity log
- [ ] `MapFile` / `MapFile-Net` — network node registry
- [ ] Assembler/disassembler (doc §5.2) — `.tie` ↔ machine code (arg / reseq)

## N. Tools / utilities
*(standalone programs in tierra/)*

- [ ] `arg` — genome assembler / genebank archive (extract/create/list/validate)
- [ ] `probe` — query genebank on disk by genotype/time
- [ ] `decode` — instruction operand/addressing-mode decode
- [ ] `reseq` — re-sequence genome from `.tie`, offset widths
- [ ] `thrdana` — thread execution analysis
- [ ] `threadtree` — X11 thread-execution tree visualization
- [ ] `stralign` — Smith-Waterman string alignment
- [ ] `genalign` — genome alignment / comparison with scoring matrix
- [ ] `diffscan` — scan genome for execution-marked differences
- [ ] `micromon` — micro-debug monitor (breakpoints, stepping)
- [ ] `frontend` — sim↔UI interface layer
- [ ] `ttools` — histogram/statistics tools
- [ ] `tsetup` — parameter reading/modification, environment config
- [ ] `log2ipmap` — ping-log → IP stats map
- [ ] `soupupdtrc` — soup-update event trace scanner
- [ ] `tie2pd` — TCP relay bridge (Tierra→PD server)
- [ ] `tbglpasswd` — Beagle password/user management (crypt auth)

## O. User interfaces
*(Bgl-UI_stdio/, Bgl-GUI_X11/, operator.c)*

- [ ] **Basic/stdio interface** (doc §5.6.1–5.6.3) — interrupt handler, single-key commands, standard output, `tierra.log`
- [ ] **Bgl-UI_stdio menu tree** — File(save/quit), Info(plan/size/gene/mem/size-query/repro-efficiency), Var(alter/examine), Misc(histo-log/inject/micro-debug/tping/migration), Overview(start/quit/genome), Option(wait/xdr-buf), Connection, Continue
- [ ] stdio display screens — ~24 `BGL_*_SCR` types (stats, plan, histograms, CPU spy, genome/disasm, var, options, tping, injection, …)
- [ ] **Beagle Explorer (X11 GUI)** windows: Top, Overview (soup map), OvInfo, OvGene, OvInst, Histo, Stats, Plan, Query, Var, Debug (+DebugKeyWait), Migration, Message, InfoMessage, InfoWindows, KeyIn, TPingC, TPingS
- [ ] GUI features — histograms (size/gene/mem/efficiency) with multi-axis sort options; micro-debugger (keypress/delay/off modes, breakpoint types); overview soup visualization grid w/ cursor probe; migration event tracking
- [ ] Color config — `tcolors.cfg` (console palette), `ovcolmap` (overview genotype colors)
- [ ] ALmond Monitor (doc §3.2, related software)

## P. Networked / distributed Tierra
*(Bglclnt/, Bglserv/, Bglcom/, clstrsrvr/, net files in tierra/)*

- [ ] Beagle client-server protocol — ~40 `BGL_*` message types (Connect, Stats, Plan, histograms, Var, MC_State/Spy, TPing_S/C, OV frames, Migration, Inject, …) + ~130 status codes + `MCXX` monitor command codes
- [ ] Client FSM (clnt_fsm.h) / Server FSM (tbgl_fsm.h) — MSSELECT/MSDO/MSCONNECT/MSFEMENU/… states
- [ ] Client managers — MessageMgr, MigrMgr, OVMgr, SockMgr, ProcCtrl
- [ ] Transports — TCP, UDP, UDP-assembled, UDP tunnels (tiecomm*, tieudptnl*)
- [ ] Cluster server (`clstrsrvr`) — topology, subnets (`TieSubNet`, `SubNetCnt`), online status, bandwidth caps
- [ ] **Migration / surf** — `migrate()`, `NEject()`, immigration limit (`ImmigLimFrac`), session ids, migration control port
- [ ] **Apocalypse** — network-wide extinction (`ApocalypseFreq`, `ApocFixFrac`/`RanFrac`, subnet apoc probability)
- [ ] **TPing telemetry** — `TPingData` (fecundity, speed, cells, age, soup size, transit/fresh time, InstExec, OS); IP maps `IPMapC`/`IPMapS`
- [ ] Authentication — users/passwords, privilege 's'/'n' (`tbglpasswd`, BglDefaultFile)
- [ ] Audio sonification — `tieaudsrv`/`tieaudcl` (soundcard sonification of population data)
- [ ] Ports — Tierra 17501, migration-ctrl 17503, local node 18001 (configurable)
- [ ] XDR wire types — datpkt.x, mesg.x, genebank.x, tiexdrcom.x, bgl_dat_xdr.x

## Q. Configuration / build
*(configur.h, soup_in, scripts, msvcc/)*

- [ ] **`soup_in` parameters — ~150 tunables** (full list enumerated across categories above; Pass 2 must capture each name + default + range from the actual `soup_in` file, not just the schema)
- [ ] **`configur.h` compile switches** — MICRO, IO, NET, SHADOW, READPROT/WRITEPROT/EXECPROT, ERRORTIE, MEM_PROF, SIGBLOCK, EXEINSTSIZTIMSLC, MEM_CHECKER, PLOIDY, STACK_SIZE, ALOC_REG, NUMREG
- [ ] Platform matrix — OPSYS (UNIX/BCDOS/WIN32TIE/DJGPPDOS/MACTIE/AMIGADOS/DECVMS) × FRONTEND (STDIO/BASIC/X11)
- [ ] Startup scripts — `si0`–`si8`, `si-Net` (instruction-set / run configs)
- [ ] Genebank dirs — `gb0`–`gb8`, `gb-Net9`, `gb-Netcluster`
- [ ] Clear scripts — `clr0`–`clr8`, `cclr*` (DOS), `change`, `djgpp.bat`
- [ ] Windows build — 13 `msvcc/*.dsp` projects (tierra, tierra_bgl, tierra_net, tierra_net_bgl, clstrsrvr, tbglpasswd, tiewinlib, arg, arg_net, diffscan, reseq, genalign, probe)
- [ ] Autoconf — configure/configure.in/Makefile.in/config.guess/config.sub

## R. Observed evolutionary phenomena (conceptual — doc)
*(Tierra.doc, publications)*

- [ ] Ancestor (hand-written progenitor, e.g. `0080aaa`)
- [ ] Parasites (use host copy procedure)
- [ ] Hyper-parasites (parasitize parasites)
- [ ] Immunity to parasites
- [ ] Cheaters / social cheating
- [ ] Sociality (dependence on neighbors)
- [ ] Symbiosis
- [ ] Optimization (efficiency gains)
- [ ] Size reduction (genome shrinkage)
- [ ] Sterility / sterilization
- [ ] Genotypic & phenotypic diversity
- [ ] Adaptation to disturbance regime

---

## Open questions / discrepancies to reconcile in Pass 2

1. **Exact instruction count & set membership.** Pass 1 gave three figures: `opcode.map` = 64, `idt[]` ≈ 123–134 (with conditionals), and docs describe Sets 0 / 1–3 / 8. Pass 2 must produce one authoritative table: master idt[] vs. which mnemonics belong to each shipped set, and how compile flags (NET/IO/PLOIDY/SHADOW) add instructions.
2. **soup_in defaults & ranges.** We have the parameter *names* (from `soup_in.h`); Pass 2 must read the actual `soup_in` file(s) `si0`–`si8` for concrete default values, units, and legal ranges.
3. **Ancestor genome.** Pass 2 should disassemble/annotate the canonical ancestor (size 80, `0080aaa`) and its gene structure (via `.tie`/`.gdf`).
4. **Bit vs. word addressing & `StrictIP`/Hamming mapping** — confirm the exact addressing model.
5. **Slicer default** — which slicer variant (queue/random/photon) is the shipped default, and exact size-dependent slice formula.
6. **Reaper ordering** — exact rules for queue position, up/down movement, and interaction with `LazyTol`/`DropDead`/`ReapRndProp`.
7. **Which subsystems are "core Tierra" vs. later research add-ons** (multi-cellularity, network/cluster, thread analysis, audio) — matters for scoping the 2026 rebuild; decided with the user at spec time, not here.

## Pass-2 plan (next)

Deep-dive each checkbox above, one item at a time, pulling exact detail + `file:line`
citations, producing `docs/original-tierra/` reference docs (likely split by category
A–R given the volume). No framing as gaps-vs-ours yet.
