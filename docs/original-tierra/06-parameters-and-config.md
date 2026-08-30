# 06 — Parameters & Compile-Time Configuration (the "magic numbers")

**Source:** Tom Ray's Tierra v6.02, `reference/tierra-v6.02/`.
Definitive tunables reference. Every default is cited to its source file and line.

## Overview

Tierra has two layers of configuration:

1. **Run-time parameters** — read from a `soup_in`-style text file at startup (one
   `Name = value  comment` per line; lines beginning `#` are comments). The parameter
   *schema* and the built-in fallback defaults live in **`tierra/soup_in.h`**. The
   **actual shipped default file** is **`tierra/soup_in`** (identical to `si0`), and the
   scenario configs `si1`, `si2`, `si3`, `si7`, `si8` override selected values. The end
   of each file (after a blank line) lists the ancestor genotype(s) used to inoculate the
   soup (`NumCells` of them), optionally preceded by `space N` / `center` layout directives.
2. **Compile-time switches** — `#define`s in **`tierra/configur.h`** selecting the OS,
   frontend, ploidy, shadow registers, memory-protection modes, and core VM constants
   (`STACK_SIZE`, `ALOC_REG`, `NUMREG`).

Two default sources differ because they serve different roles:
- **`soup_in.h`** is compiled into the binary; its `alive = 500`, `AliveGen = 1`,
  `DistFreq = .3`, `EjectRate = 50`, `MalMode = 2`, `MalTol = 5`, `LazyTol = 5`,
  `MinSoupSize/MaxSoupSize = 60000` etc. are the C fallbacks.
- **`soup_in` / `si0`** is the ASCII file actually loaded; where it sets a value that
  value wins. Notable file-vs-header disagreements: `alive = 0` (infinite) vs `500`;
  `AliveGen = 0` (instructions) vs `1`; `DistFreq = -.3` (disturbance OFF) vs `.3`;
  `EjectRate = 0` vs `50`; `MalMode = 1` (better-fit) vs `2`; `MalTol = 20` vs `5`;
  `LazyTol = 10` vs `5`; `ReapRndProp = .3` vs `0.0`; `SoupSize = 60000` (single value,
  sets both min & max); `MaxFreeBlocks = 800` vs `600`; `SavMinNum = 10` vs `2`;
  `SavThrMem/Pop = .02` vs `.015`.

The **Default** column below gives the value from `soup_in`/`si0` when present, else the
`soup_in.h` fallback (noted). Meanings/ranges are corroborated by **`Tierra.doc` §11
("soup_in Parameters", detailed prose beginning at doc offset ~287k)**.

Parameter count documented: **~155** (≈100 core + ~55 NET/UDP/TCP/frontend-gated). See
the running tally in the table group headers; grand total stated at the end.

---

## Parameter tables (grouped by area)

Legend: **Def** = shipped default (`soup_in`/`si0`, else `soup_in.h` fallback marked †).
Type from `soup_in.h`. **NET** rows compile only under `#define NET`.

### A. Simulation control / run length (7)

| Name | Def | Type | Range / values | Meaning | Cite |
|---|---|---|---|---|---|
| `alive` | 0 | I32s | ≥0; 0 = infinite | How long to run; unit set by `AliveGen`. Header default 500. | soup_in.h:53; soup_in:28 |
| `AliveGen` | 0 | I32s | 0 = millions of InstExe, 1 = generations | Unit of measure for `alive`. Header default 1. | soup_in.h:54; soup_in:87 |
| `new_soup` | 1 | I32s | 0/1 | 1 = new soup; 0 = restart old run (feed `soup_out` as input). | soup_in.h:97; soup_in:71 |
| `seed` | 0 | I32s | 0 = seed from clock; else fixed seed | RNG seed; starting seed logged for exact replay. | soup_in.h:106; soup_in:79 |
| `DropDead` | 5 | I32s | millions of instr; 0 = off | Halt if no cell division in last x million instr. | soup_in.h:59; soup_in:33 |
| `MinSpeed` | -1† | I32s | -1 = no effect | Min speed to continue run. | soup_in.h:60 |
| `hangup` | 0 | I32s | 0 = exit on error, 1 = hang for debug | Error handling. TIERRA/ARGTIE only. | soup_in.h:364; soup_in:14 |

### B. Memory / soup / allocation (reaper-adjacent) (20)

| Name | Def | Type | Range / values | Meaning | Cite |
|---|---|---|---|---|---|
| `SoupSize` | 60000 | I32s | instructions | Soup size (file uses single `SoupSize`; sets Min=Max). | soup_in:86 |
| `MinSoupSize` | 60000† | I32s | instructions | Min soup size; if `SoupSize=0`, randomize in [Min,Max]. | soup_in.h:117 |
| `MaxSoupSize` | 60000† | I32s | instructions | Max soup size (see above). | soup_in.h:118 |
| `MaxFreeBlocks` | 800 | I32s | ≥1 | Initial # of free-block structures for allocator. Header 600. | soup_in.h:26; soup_in:15 |
| `MalMode` | 1 | I32s | 0=first-fit,1=better-fit,2=random,3=near mother,4=near dx,5=near stack-top,6=suggested(decode) | Where offspring memory is placed. Header default 2. | soup_in.h:78-80; soup_in:51 |
| `MalReapTol` | 1 | I32s | 0 = reap by queue, 1 = reap oldest within `MalTol` | Localized reaping when a target address is specified. | soup_in.h:81; soup_in:54 |
| `MalTol` | 20 | I32s | multiple of avg size | Tolerance region for address-specific mal(). Header 5. | soup_in.h:83; soup_in:56 |
| `MalSamSiz` | 0 | I32s | 0/1 | Force all allocations = parent size (stops size evolution). | soup_in.h:82; soup_in:55 |
| `MaxMalMult` | 3 | float | multiple of cell size | Max mal() request as multiple of mother size (blocks soup-grab). | soup_in.h:87; si1:69 |
| `MinCellSize` | 12 | I32s | instructions | Divide fails if daughter smaller. | soup_in.h:90; soup_in:67 |
| `MinGenMemSiz` | 12 | I32s | instructions | Divide fails if daughter genetic-memory region smaller. | soup_in.h:91; soup_in:68 |
| `MovPropThrDiv` | .7 | float | 0..1 | Min fraction of daughter that mov must fill before divide. | soup_in.h:93; soup_in:70 |
| `DeadMemInit` | 0† | I32s | 0=no change,1=zero,2=randomize | Reinit of soup mem after death (Apocalypse always randomizes). | soup_in.h:42 |
| `MemModeFree` | 0 | I32s | 0..7 rwx | Protection of free (unowned) memory. | soup_in.h:94; soup_in:63 |
| `MemModeMine` | 0 | I32s | 0..7 rwx | Protection of memory owned by the creature itself. | soup_in.h:95; soup_in:64 |
| `MemModeProt` | 2 | I32s | 0..7 rwx (1=exec,2=write,4=read bit) | Protection of memory owned by *another* creature (default = write-protect). | soup_in.h:96; soup_in:65 |
| `NumCells` | 2 | I32s | ≥1 | # creatures+gaps used to inoculate a new soup (matches list at file end). | soup_in.h:373; soup_in:72 |
| `NumCellsMin` | 1† | I32s | ≥0 | Never reap below this population. | soup_in.h:98 |
| `MaxCpuPerCell` | 16 | I32s | ≥1 | Max CPUs (threads) per cell. | soup_in.h:85; soup_in:58 |
| `MateSizeEp` | 2 | I32s | ± instructions | Size window within which a critter may mate. Header 1. | soup_in.h:84; soup_in:57 |

### C. Slicer (CPU time allocation) (11)

| Name | Def | Type | Range / values | Meaning | Cite |
|---|---|---|---|---|---|
| `SliceStyle` | 2 | I32s | 0=SlicerQueue,1=SlicerPhoton,2=RanSlicerQueue | Which slicer function is used. | soup_in.h:112; soup_in:83 |
| `SizDepSlice` | 0 | I32s | 0/1 | 0 = constant/random slice; 1 = slice ∝ genome^`SlicePow`. Header 1. | soup_in.h:107; soup_in:80 |
| `SliceSize` | 25 | I32s | instructions | Base slice when `SizDepSlice=0`. | soup_in.h:111; soup_in:82 |
| `SlicePow` | 1 | double | <1 favors small, 1 neutral, >1 favors large | Power on genome size when `SizDepSlice=1`. | soup_in.h:108; soup_in:81 |
| `SlicFixFrac` | 0 | float | multiple of base | Fixed component of slice (style 2). | soup_in.h:113; soup_in:84 |
| `SlicRanFrac` | 2 | float | multiple of base | Random component of slice (style 2). | soup_in.h:114; soup_in:85 |
| `PhotonPow` | 1.5 | double | power | Slice = (match count)^PhotonPow in photon slicer (style 1). | soup_in.h:99; soup_in:73 |
| `PhotonWidth` | 8 | I32s | instructions | Slide distance to find best photon/template fit. | soup_in.h:100; soup_in:74 |
| `PhotonWord` | chlorophill | I8s[80] | base-32 digits 0-9,a-v (no w/x/y/z), ≤79 chars | Arbitrary pattern absorbing the photon. | soup_in.h:101; soup_in:75 |
| `CpuLoadLimitProp` | 1.0† | double | 0..1 | Portion of `CpuLoadLimitPeriod` actually run. | soup_in.h:109 |
| `CpuLoadLimitPeriod` | 0† | I32s | seconds; 0 = no limit | CPU-load throttling window. | soup_in.h:110 |

### D. Reaper / mortality (3)

| Name | Def | Type | Range / values | Meaning | Cite |
|---|---|---|---|---|---|
| `ReapRndProp` | .3 | float | 0 = strict top, 1 = fully random | Reap from top proportion of reaper queue. Header 0.0. | soup_in.h:103; soup_in:77 |
| `LazyTol` | 10 | I32s | multiple of RepInst | Kill cell if instr since last daughter > LazyTol×RepInst. Header 5. | soup_in.h:77; soup_in:50 |
| `EjectRate` | 0 | I32s | 0 = off; N = 1-in-N | Random ejection (death, or migration in NET). Header 50. | soup_in.h:61; soup_in:34 |

### E. Reproduction / division control (2)

| Name | Def | Type | Range / values | Meaning | Cite |
|---|---|---|---|---|---|
| `DivSameSiz` | 0 | I32s | 0/1 | Abort divide unless daughter = mother size (stops size change). | soup_in.h:57; soup_in:32 |
| `DivSameGen` | 0 | I32s | 0/1 | Abort divide unless daughter = mother genotype (stops evolution). | soup_in.h:58; soup_in:31 |

### F. Mutation / flaw rates (18)

All `GenPer*` are "1 in N cells per generation" (smaller = more mutations; 0.5 ⇒ ~2/gen).

| Name | Def | Type | Meaning | Cite |
|---|---|---|---|---|
| `GenPerBkgMut` | 32 | I32s | Background/"cosmic ray" mutation (affects soup incl. free space). Header 16. | soup_in.h:62; soup_in:35 |
| `GenPerFlaw` | 32 | I32s | Flaw rate (instr results off by ±1); strong effect on shrink pressure. | soup_in.h:63; soup_in:36 |
| `GenPerMovMut` | 0 | I32s | Copy-mutation rate (mov during replication); 0 = off. Header 8. | soup_in.h:64; soup_in:37 |
| `GenPerDivMut` | 32 | I32s | Cosmic-ray mutation applied to daughter genetic memory at birth. Header 64. | soup_in.h:65; soup_in:38 |
| `GenPerCroInsSamSiz` | 32 | I32s | Crossover insertion, size preserved. Header 64. | soup_in.h:66; soup_in:39 |
| `GenPerInsIns` | 32 | I32s | Instruction insertion (anywhere). Header 64. | soup_in.h:67; soup_in:40 |
| `GenPerDelIns` | 32 | I32s | Instruction deletion (anywhere); changes size. Header 64. | soup_in.h:68; soup_in:41 |
| `GenPerCroIns` | 32 | I32s | Crossover insertion (anywhere); can change size. Header 64. | soup_in.h:69; soup_in:42 |
| `GenPerDelSeg` | 32 | I32s | Deletion on segment boundaries. Header 64. | soup_in.h:70; soup_in:43 |
| `GenPerInsSeg` | 32 | I32s | Insertion on segment boundaries. Header 64. | soup_in.h:71; soup_in:44 |
| `GenPerCroSeg` | 32 | I32s | Crossover on segment boundaries. Header 64. | soup_in.h:72; soup_in:45 |
| `MutBitProp` | .2 | float | 0..1 | Fraction of site mutations that are bit-flips (else random-instruction replacement). | soup_in.h:73; soup_in:46 |
| `JmpSouTra` | 0. | float | switches/avg size | (PLOIDY>1) Source-track switch rate for movii. | soup_in.h:75; soup_in:48 |
| `JumpTrackProb` | .2 | float | 0..1 | (PLOIDY>1) Prob of switching execute track on IP jump. | soup_in.h:76; soup_in:49 |
| `MinComSizRat` | 0.41† | double | ≥ ⇒ same narrow tissue | Complexity/size ratio threshold (thread analysis). | soup_in.h:365 |
| `LifeCycFrct` | -1.0† | double | -1 = off | List gene executed in selected life-cycle portion. | soup_in.h:366 |
| `MalMode`/`MalSamSiz` | — | — | (also anti-evolution knobs, see §B) | | — |
| `DivSameGen`/`DivSameSiz` | — | — | (also anti-evolution knobs, see §E) | | — |

### G. Genebank / save / output (17)

| Name | Def | Type | Range / values | Meaning | Cite |
|---|---|---|---|---|---|
| `GeneBnker` | 0 | I32s | 0/1 | Turn genebanker on/off. si1+ = 1. | soup_in.h:372; soup_in:12 |
| `DiskBank` | 1 | I32s | 0/1 | Disk genebanker on/off. | soup_in.h:19; soup_in:8 |
| `DiskOut` | 0 | I32s | 0/1 | Write data files to disk. Header 1; si3/si8 = 1. | soup_in.h:20; soup_in:9 |
| `GenebankPath` | gb0/ | I8s[80] | path (`:gb:` on Mac) | Directory for genebanker output; per-scenario gbN/. | soup_in.h:126; soup_in:13 |
| `CumGeneBnk` | 0 | I32s | 0/1 | Cumulative gene files vs overwrite. si1+ = 1. | soup_in.h:17; soup_in:2 |
| `SaveFreq` | 100 | I32s | ≥0 | Freq of saving core_out/soup_out/list. si1 = 50. | soup_in.h:27; soup_in:16 |
| `SavRenewMem` | 0 | I32s | 0/1 | Free & renew dynamic memory after save. Header 1. | soup_in.h:28; soup_in:17 |
| `SavMinNum` | 10 | I32s | ≥1 | Min individuals before saving a genotype. Header 2. | soup_in.h:29; soup_in:18 |
| `SavThrMem` | .02 | float | 0..1 | Memory-occupancy threshold to save genotype. Header .015. | soup_in.h:30; soup_in:19 |
| `SavThrPop` | .02 | float | 0..1 | Population-proportion threshold to save genotype. Header .015. | soup_in.h:31; soup_in:20 |
| `BrkupSiz` | 1024 | I32s | K | Break output file into break.1, break.2 … of this size. | soup_in.h:16; soup_in:5 |
| `OutPath` | (unset)/td/ | I8s | path | Data output path (si1: `td/`; mac-net: `:td:`). | si1:16 |
| `WatchExe` | 0 | I32s | 0/1 | Mark executed instructions in genebank genome. | soup_in.h:47; soup_in:22 |
| `WatchMov` | 0 | I32s | 0/1 | Set mov bits in genebank genome. | soup_in.h:48; soup_in:23 |
| `WatchTem` | 0 | I32s | 0/1 | Set template bits in genebank genome. | soup_in.h:49; soup_in:24 |
| `GeneBnkerOvrd` | 0† | I32s | 0/1 | Genebanker override flag. | soup_in.h:23 |
| `XDRBufMaxSize` | 200000† | I32s | bytes | Max XDR encode/decode buffer. | soup_in.h:379 |

### H. Search / template / communication (6)

| Name | Def | Type | Range / values | Meaning | Cite |
|---|---|---|---|---|---|
| `SearchLimit` | 5 | float | multiple of avg adult size | How far instructions may search to match templates. Updated per Mininstr. | soup_in.h:104; soup_in:78 |
| `AbsSearchLimit` | 0† | I32s | 0 = none; instr | Absolute cap on template-complement search distance. | soup_in.h:105 |
| `StrictIP` | 1† | I32s | 0 = Hamming-mapped IP, 1 = must be valid | IP validity; if 0, IP mapped by Hamming distance. | soup_in.h:116 |
| `MinTemplSize` | 1 | I32s | ≥1 | Min template length for template-using instructions. | soup_in.h:92; soup_in:69 |
| `PutLimit` | 10 | float | multiple of avg size | Search distance for put/get intercellular messaging. Header 20. | soup_in.h:102; soup_in:76 |
| `IMapFile` | opcode.map | I8s[80] | filename in GenebankPath | Opcode→instruction map defining the instruction set. | soup_in.h:74; soup_in:47 |

### I. Disturbance (2)

| Name | Def | Type | Range / values | Meaning | Cite |
|---|---|---|---|---|---|
| `DistFreq` | -.3 | float | <0 = OFF; ≥0 = factor of recovery time | Freq of disturbance (next = rtime×DistFreq after recovery). Header .3. si3/si7 = 10. | soup_in.h:55; soup_in:29 |
| `DistProp` | .2 | float | 0..1 | Proportion of soup freed per disturbance (reaped off queue). | soup_in.h:56; soup_in:30 |

`DistNext = {0,0}` (Event) is internal state, not user-set. soup_in.h:119.

### J. Thread analysis / instrumentation (11)

| Name | Def | Type | Meaning | Cite |
|---|---|---|---|---|
| `ThreadAnalysis` | 0† | I32s | Thread analysis on/off. | soup_in.h:33 |
| `SplitTissueAna` | 0† | I32s | Collect split-tissue data. | soup_in.h:34 |
| `SouUpdTrk` | 0† | I32s | Track soup memory updates (large data; test only). | soup_in.h:36 |
| `ThrdAnaMaxFec` | -1† | I32s | Fecundity cutoff for thread analysis. | soup_in.h:38 |
| `ThrdAnaStop` | 0† | I32s | Stop-on-thread-analysis flag. | soup_in.h:39 |
| `ThrdAnaTrmCode` | 0† | I32s | Thread-analysis termination code. | soup_in.h:40 |
| `ThrdAnaPartSave` | 0† | I32s | Partial-save flag for thread analysis. | soup_in.h:41 |
| `DeconstructOn` | 0† | I32s | Instruction trace log switch. | soup_in.h:24 |
| `TierraLog` | 0 | I32s | Write tierra.log. si1+ = 1. | soup_in.h:32; soup_in:21 |
| `MaxSigBufSiz` | 8 | I32s | Max signal buffer size. | soup_in.h:25; soup_in:62 |
| `M_OV_threshold` | 100† | I32s | Timeout threshold in OV mode. | soup_in.h:121 |

### K. Debug / monitor / OS niceness (11)

| Name | Def | Type | Meaning | Cite |
|---|---|---|---|---|
| `debug` | 0 | I32s | Debug printf statements on/off. | soup_in.h:18; soup_in:7 |
| `FindTimeM` | 0 | I32s | Debug trap at a given InstExe (millions). | soup_in.h:21; soup_in:10 |
| `FindTimeI` | 0 | I32s | Debug trap at a given InstExe (instructions). | soup_in.h:22; soup_in:11 |
| `TierraNice` | 19† | I32s | Unix nice level (Win: IDLE_PRIORITY if nonzero). | soup_in.h:50 |
| `TierraSleep` | 0† | I32s | Sleep (sec) on key/mouse activity; 0 = none. | soup_in.h:45 |
| `MonPort` | 17501† | I16u | Network-monitor port. | soup_in.h:51 |
| `MigrCtrlPort` | 17503† | I16u | Beagle short-connection port. | soup_in.h:52 |
| `M_tvWait_sec` | 25† | I32s | select() timeout in OV mode (sec). | soup_in.h:120 |
| `SpeedUpdate` | 60† | I32s | Freq (sec) of speed recalculation. | soup_in.h:115 |
| `Host` / `Site` | (mac-net) | I8s | Host/Site name (NETMAC / `__MWERKS__`). | soup_in.h:183-184 |
| `MacHost` / `MacSite` | nohost/nosite† | I8s[80] | Mac host/site defaults. | soup_in.h:183-184 |

### L. I/O buffers (5)

| Name | Def | Type | Meaning | Cite |
|---|---|---|---|---|
| `MaxIOBufSiz` | 8 | I32s | Max IOS (network) buffer size. | soup_in.h:86; soup_in:59 |
| `MaxPutBufSiz` | 4 | I32s | Max put IO buffer size. | soup_in.h:88; soup_in:61 |
| `MaxGetBufSiz` | 4 | I32s | Max get IO buffer size. | soup_in.h:89; soup_in:60 |
| `InstExeUpdFreq` | 5000† | I32s | (FRONTEND==BASIC) InstExe display update interval. | soup_in.h:201 |
| `MaxSigBufSiz` | 8 | I32s | (also §J) signal buffer. | soup_in.h:25 |

### M. NET-only — general (23) — compile with `#define NET`

| Name | Def | Type | Meaning | Cite |
|---|---|---|---|---|
| `LocalPort` | 18001 | I16u | Port for local node. | soup_in.h:133 |
| `BklogProcFreq` | 3 | I32s | Min sec before processing message backlog. | soup_in.h:130 |
| `SensMapAtt` | -1 | I32s | Divide-attempts filter for sensory FOV report. | soup_in.h:131 |
| `PingDatLog` | 0 | I32s | Log ping data to ping.dat. | soup_in.h:132 |
| `TrackNormLike` | 0 | I32s | Mode for gene/size tracking. | soup_in.h:134 |
| `ApocalypseFreq` | 0 | I32s | Freq (millions) of node-wide apocalypse; encourages migration. | soup_in.h:135; si1:35 |
| `SrvrApocSleep` | 60 | I32s | Sleep (sec) after server-triggered apocalypse. | soup_in.h:136 |
| `TieMsgBkLog` | 200 | I32s | Max message backlog (queue length). | soup_in.h:137 |
| `TieMsgMaxAge` | 60 | I32s | Max message age (sec) before discard. | soup_in.h:138 |
| `NodeSelSucRatPrec` | -1 | I32s | Node-selection success-rate precision; -2 random,-1 local,≥0 map idx. | soup_in.h:139 |
| `GetIPPStrtIdxC` | -1 | I32s | Cluster-map getipp start (-1 own,-2 random,≥0 idx). | soup_in.h:145 |
| `GetIPPStrtIdxS` | -1 | I32s | Server-map getipp start. | soup_in.h:146 |
| `BrkIPPStrtIdxC` | -1 | I32s | Break on cluster-map getipp start. | soup_in.h:147 |
| `BrkIPPStrtIdxS` | -1 | I32s | Break on server-map getipp start. | soup_in.h:148 |
| `BrkIPPStopIdxC` | -1 | I32s | Break on cluster-map getipp stop. | soup_in.h:149 |
| `BrkIPPStopIdxS` | -1 | I32s | Break on server-map getipp stop. | soup_in.h:150 |
| `OnLineStat` | 1 | I32s | Online? 0=no,1=yes. | soup_in.h:152 |
| `SubNetCnt` | 1 | I32s | Number of subnets. | soup_in.h:153 |
| `TieSubNet` | 0 | I32s | This node's subnet number. | soup_in.h:154 |
| `BasSubNetChgFrq` | 0 | I32s | Base frequency of subnet change. | soup_in.h:155 |
| `PendReqMax` | 5 | I32s | Max pending TPing requests before Speed→0. | soup_in.h:164 |
| `PendReqTime` | 86400 | I32s | Pending-request age (sec) before node removal. | soup_in.h:165 |
| `SpdZeroTime` | 60 | I32s | Max time (sec) before Speed→0. | soup_in.h:166 |

### N. NET-only — subnet / apocalypse / immigration / maps (11)

| Name | Def | Type | Meaning | Cite |
|---|---|---|---|---|
| `SubNetChgFrqRanFrac` | 0.0 | float | Random fraction of subnet-change freq. | soup_in.h:156 |
| `SubNetChgFrqFixFrac` | 0.0 | float | Fixed fraction of subnet-change freq. | soup_in.h:157 |
| `SubNetChgApocProb` | 0.9 | double | Subnet-transition apocalypse probability. | soup_in.h:158 |
| `ApocFixFrac` | 0.0 | float | Fixed fraction of apocalypse freq. | soup_in.h:159; si1:36 |
| `ApocRanFrac` | 2.0 | float | Random fraction of apocalypse freq. | soup_in.h:160; si1:37 |
| `ImmigLimFrac` | -1.0 | float | Fraction of incoming messages accepted; <0 = no limit. | soup_in.h:161 |
| `NetRcvUpdFreq` | 3 | I32s | Freq (sec) of net message check. | soup_in.h:167 |
| `AutoAddIPMap` | 0 | I32s | Auto-add new nodes to IPMap. | soup_in.h:168 |
| `AutoRemIPMap` | 0 | I32s | Auto-remove inactive/offline nodes from IPMap. | soup_in.h:170 |
| `MinSubNetApoRat` | 0.25 | double | Below this, no subnet contamination. | soup_in.h:172 |
| `map_fnC`/`map_fnS` | MapFileC/MapFileS | I8s[40] | Cluster / server Internet map files. | soup_in.h:175-176 |

### O. NET-only — UDP / TCP transport (6) — gated on NETTYPE

| Name | Def | Type | Meaning | Cite |
|---|---|---|---|---|
| `TieMTU` | 1500 | I32s | (UDP) Largest single UDP packet. | soup_in.h:188 |
| `PktSndDelay` | 0 | I32s | (UDP) Delay (usec) after outgoing packet. | soup_in.h:189 |
| `TCPLocSelTmeSec` | 0 | I32s | (TCP) Local-cluster connect timeout, sec. | soup_in.h:193 |
| `TCPLocSelTmeUSec` | 100000 | I32s | (TCP) Local connect timeout, usec. | soup_in.h:194 |
| `TCPRemSelTmeSec` | 5 | I32s | (TCP) Remote/server connect timeout, sec. | soup_in.h:195 |
| `TCPRemSelTmeUSec` | 0 | I32s | (TCP) Remote connect timeout, usec. | soup_in.h:196 |

Group counts: A7 B20 C11 D3 E2 F18 G17 H6 I2 J11 K11 L5 M23 N11 O6 = **153** distinct
named parameters (plus the internal `DistNext` state and the `idt[]` instruction table).
**Documented total ≈ 155.**

---

## `configur.h` — compile-time switches

File: `tierra/configur.h`. `#define VER 6.02` (line 19).

### Feature `#define`s (default = commented state as shipped)

| Macro | Default | Purpose | Cite |
|---|---|---|---|
| `MICRO` | **ON** | Enable micro-step debugging. | configur.h:21 |
| `IO` | **ON** | Buffered input-output (enables get/put/puticc instructions). | configur.h:22 |
| `NET` | **OFF** (commented) | Network version of Tierra (enables surf/tpings/getip… instructions). | configur.h:23 |
| `SHADOW` | **OFF** (commented) | Shadow-register set (doubles register count; enables A/B/C/D regorder instrs). | configur.h:24 |
| `READPROT` | **OFF** (commented) | Read-protection of soup memory. | configur.h:25 |
| `WRITEPROT` | **ON** | Write-protection of soup memory (the only protection on by default). | configur.h:26 |
| `EXECPROT` | **OFF** (commented) | Execute-protection of soup memory. | configur.h:27 |
| `ERRORTIE` | **ON** | Include error-checking code. | configur.h:28 |
| `MEM_PROF` | **OFF** (commented) | Profile dynamic memory usage (force-undef under ARGTIE). | configur.h:29,142 |
| `DYNIPADR` | OFF (commented, NET-only) | Dynamically assigned IP address. | configur.h:32 |
| `SIGBLOCK` | auto | Defined for TIERRA/BGL_CLNT/CLSTRSRVR on unix (unless MEM_CHECKER). | configur.h:35-39 |

The three memory-protection defines are the compile-time gate; the `MemModeFree/Mine/Prot`
runtime params then control *how* an enabled protection is used. Shipped binary only has
`WRITEPROT`, so only `MemModeProt = 2` (write-protect others' memory) has effect.

### Core VM constants

| Macro | Value | Notes | Cite |
|---|---|---|---|
| `STACK_SIZE` | 10 | CPU stack depth (`Reg st[STACK_SIZE]`). | configur.h:41 |
| `ALOC_REG` | 6 (SHADOW: 12) | Allocated registers (`Reg re[ALOC_REG]`). | configur.h:43,46 |
| `NUMREG` | 6 | Usable registers = ALOC_REG/2 under SHADOW, else ALOC_REG. | configur.h:44,47 |

So without SHADOW: 6 registers, all usable. With SHADOW: 12 allocated, 6 usable
(the other 6 are shadows).

### OPSYS matrix (auto-selected from compiler macros)

| OPSYS | Value | Selected when | TIESHELL | Cite |
|---|---|---|---|---|
| `UNIX` | 0 | `unix` | csh | configur.h:61,99-102 |
| `BCDOS` | 1 | `__TURBOC__` | command | configur.h:62,79-82 |
| `WIN32TIE` | 2 | `_WIN32` | COMMAND | configur.h:63,94-97 |
| `DJGPPDOS` | 3 | `DJGPP` | command | configur.h:64,89-92 |
| `MACTIE` | 4 | `__MWERKS__` | noshell | configur.h:65,69-77 |
| `AMIGADOS` | 5 | `AMIGA` | newshell | configur.h:66,104-107 |
| `DECVMS` | 6 | `DECVAX` | spawn | configur.h:67,109-112 |
| `WATDOS` | — | `__WATCOMC__` | command | configur.h:84-87 |

### FRONTEND matrix

| FRONTEND | Value | Notes | Cite |
|---|---|---|---|
| `STDIO` | 0 | Default (`#ifndef FRONTEND`). | configur.h:52,55-57 |
| `BASIC` | 1 | Forced under `__MWERKS__` and `__GUI__` (Win3.1/WIN32s). | configur.h:53,73,114-117 |

`INTERFACE = (FRONTEND * 7) + OPSYS` (line 138) → combined STDIOU..BASICV codes 0–13
(lines 121–135).

### PLOIDY

`PLOIDY` is **not** defined in `configur.h`; it is set elsewhere (Makefile / license.h) and
gates diploid features. When `PLOIDY > 1`: the `trso`/`trde`/`trex` instructions and the
Cpu track fields (`ex`/`so`/`de`/`wc`) plus `JmpSouTra`/`JumpTrackProb` become active;
otherwise those idt[] slots are NULL stubs (soup_in.h:328-336).

---

## Scenario differences: si0 … si8

Base file (`soup_in` ≡ `si0`) targets **instruction set 0** into `gb0/`, genebanker OFF,
disk output OFF — a quiet "just run set 0" config. Each scenario is a small delta:

| Config | Inst set / gb | Key overrides vs si0 | Ancestor seed | Cite |
|---|---|---|---|---|
| **si0 / soup_in** | set 0, gb0/ | baseline; GeneBnker=0, DiskOut=0, EjectRate=0, GenPerMovMut=0, GenPerFlaw=32, all GenPer*=32, MalMode=1, LazyTol=10, MovPropThrDiv=.7 | `center`, `0080aaa` (80-instr ancestor) | si0:12,34,37,88-90 |
| **si1** | set 1, gb1/ | GeneBnker=1, CumGeneBnk=1, TierraLog=1, OutPath=td/, SaveFreq=50, SavMinNum=3; adds Apocalypse* params; EjectRate=50, GenPerBkgMut=16, GenPerMovMut=8, GenPerFlaw=64, JumpTrackProb=.0, MaxMalMult=3, MovPropThrDiv=.5 | `space 30000`, `0095aaa` | si1:12,17,35-46,80,96-99 |
| **si2** | set 2, gb2/ | Same as si1 but drops the NET comment block; seed `0093aaa` | `space 30000`, `0093aaa` | si2 vs si1 diff |
| **si3** | set 3, gb3/ | vs si2: **DiskOut=1**, SavMinNum=10, SavThrMem/Pop=.05, **DistFreq=10** (disturbance ON), GenPerFlaw=16, JumpTrackProb=.1 | `space 30000`, `0082aaa` | si3 vs si2 diff |
| **si7** | set 3, gb7/ | vs si2: SavMinNum=10, SavThrMem/Pop=.05, **DistFreq=10**, GenPerBkgMut=34, GenPerMovMut=16 (DiskOut stays 0) | `space 30000`, `0085aaa` | si7 vs si2 diff |
| **si8** | (generic), gb8/ | vs si7: **DiskOut=1**, DistFreq back to -.3 (OFF), GenPerBkgMut=16, GenPerMovMut=8, MovPropThrDiv=.6 | `space 30000`, `0082aaa` | si8 vs si7 diff |

Summary of what each knob-set does across scenarios:
- **Genebanking/logging** turns on at si1 (`GeneBnker=1`, `CumGeneBnk=1`, `TierraLog=1`, `OutPath`).
- **Disturbance** (`DistFreq=10`, positive) is only enabled in **si3** and **si7**; everywhere
  else it is negative (OFF).
- **Disk output** (`DiskOut=1`) only in **si3** and **si8**.
- **Mutation intensity** varies most in si7 (higher `GenPerBkgMut=34`, `GenPerMovMut=16`)
  and si3 (higher flaw rate, `GenPerFlaw=16`).
- **Ancestor genome** differs per scenario (0080aaa, 0095aaa, 0093aaa, 0085aaa, 0082aaa),
  matching the instruction set/size the config targets.

### Mac / Net variants (si0-mac, si0-mac-net)

`si0-mac` mirrors si0 with Mac path syntax (`:gb0:`). `si0-mac-net` additionally enables
the network build knobs: `DiskBank=0`, `SaveFreq=0`, `TierraLog=1`, `LocalPort=18001`,
`map_fn=MapFile-Net`, `TierraNice=19`, `Host=ppp7`, `Site=psych.ucsb.edu`,
`ApocalypseFreq/ApocFixFrac/ApocRanFrac`, `SizDepSlice=1`, `SoupSize=200000`, `seed=1`.
These are the NET-only rows (§M–O) surfacing in an actual config file. (si0-mac-net diff)

---

## Cross-references

- Instruction set / opcode map: see `IMapFile` (opcode.map) and the `idt[]` array in
  `soup_in.h:204-360` (Pass 2 doc on the VM/instruction set).
- Reaper & slicer mechanics: `Tierra.doc` §11 prose (extracted at doc offset ~287k–340k).
- The `space N` and `center` directives at file end control initial genome placement in
  the soup (`center` = half-soup gap); `NumCells` must equal the count of genotypes+gaps.
