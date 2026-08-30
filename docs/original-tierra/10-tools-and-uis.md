# 10 — Standalone Tools and User Interfaces

*Pass 2 (LIGHT catalog). Source: Tom Ray's Tierra v6.02, `reference/tierra-v6.02/`. This is a catalog of the auxiliary command-line tools shipped alongside the simulator, plus the three interactive frontends (BASIC/stdio, Beagle stdio, Beagle X11). Purpose-and-shape only — internals not exhaustively traced.*

---

## Section 1 — Tools

Command-line utilities in `reference/tierra-v6.02/tierra/`. Most operate on genebank archive files (`.gen`/`.tie`) or on Tierra run output (`tierra.log`, IP maps, deconstruct/thread-analysis records). They are built as separate binaries from the simulator.

### arg — assembler / disassembler / genebank archiver (`arg.c`)
The core genebank tool, originally by Tom Uffner. Converts ASCII assembler `.tie` source into binary `.gen` files the Tierran VM can execute, and disassembles them back. Also serves as an archive utility (create/replace/table/extract), analogous to `tar`. Usage forms: `arg c|r archive source...` (create/replace), `arg t archive` (table of contents), `arg x archive [genotype...]` (extract, with options for disassembly detail, alignment, instruction-type selection). Used to prepare ancestor genomes for inoculation and to inspect saved genotypes.

### probe — on-disk genebank browser (`probe.c`)
Interactive tool (Dan Pirone, 1992) to "slice through" the genebank `.gen`/`.gdf` files on disk. Reads a genebank directory (`gb0` etc.), lets you browse genotypes by size/label, and pipes disassembly to a viewer (`more`). Used for after-the-fact exploration of what a run saved.

### decode — instruction decode functions (`decode.c`)
Not a standalone user tool but a core simulator/`arg` module: the decode functions that interpret executable creature code and map opcodes onto the executable functions in `instruct.c` (source-value decode, register/direction modes, addressing). Listed here because it is a named unit in the tool set; in practice it is linked into `tierra`/`arg`.

### reseq — re-sequence assembler offsets (`reseq.c`)
Small filter: reads a `.tie` assembler file and a field width, and rewrites/annotates each code line with a running offset counter (skipping directives, comments, `CODE` markers). Used to re-number offset columns in hand-edited assembler source.

### thrdana — thread analysis (`thrdana.c`)
Thread-analysis routines for the simulator: collects per-organism "instruction copy" data (source/destination track, offset, thread id) over a creature's life history, classifies copy operations by thread, and writes thread-analysis data into the genebank entry. Active when the `ThreadAnalysis` parameter is set; feeds `threadtree`. Linked into the simulator (guarded by `#if TIERRA`), not a separate command.

### threadtree — X11 thread-tree viewer (`threadtree.c`)
X11/Xaw GUI tool that reads a genebank archive plus its thread-analysis data and draws the creature's execution as a colored tree of threads over time (bars per thread, zoom in/out on horizontal/vertical axes, palette, save-to-image via ImageMagick `import`). Usage: `threadtree <archive> [-gl genome-label] [-ww width] [-wh height] ...`. Used to visualize how a self-replicator's threads unfold.

### stralign — sequence alignment engine (`stralign.c`, `stralign.h`)
A generic Smith-Waterman-style local string-alignment library (match-score matrix, backtrace callbacks, configurable match/mismatch weights and gap open/extend). Not run directly; it is the alignment core called by `genalign`.

### genalign — genome alignment / comparison (`genalign.c`)
Uses `stralign` to align an "unknown" genebank genome against a "known" reference genome and report matching/aligned and unaligned regions, identifying new genes. Usage: `genalign <unknown archive> [-ug unknown-label] [-kg known archive] [-kl known-label] [-tf threshold] [-maw/-miw/-go/-ge weights] [-pa print-aligned] ...`. Used to find homology and novel gene boundaries between evolved genomes.

### diffscan — extract-line diff scanner (`diffscan.c`)
Tiny text filter over a `tierra.log`-style file: scans for lines matching the exec pattern (`" 100 "`) and reports differences (start line vs end line), with `-d` for detail. Usage: `diffscan [-d] filename`. Used to quickly find where genotype extract records changed across a run.

### micromon — MICRO virtual debugger monitor (`micromon.c`)
The "micro monitor" step-debugger back-end for the simulator: manages breakpoints (`GoBrkClr` and a large `BrkTrapCond` set — break on given genotype/offset, host/parasite, population-change %, size range, thread-analysis-ready, etc.). Drives the single-step / delay / keypress debug modes reachable from the `M-Micro Toggle` menu option. Compiled into the simulator, not standalone.

### frontend — I/O frontend dispatcher (`frontend.c`)
The simulator's input/output layer (Dan Pirone). Contains the basic data-reporting functions and includes exactly one low-level IO module depending on the configured `FRONTEND`: `tstdio.c` for standard IO, or the curses/Beagle variants. Not a tool you invoke — it is what produces the console output and the interactive BASIC screen.

### ttools — histogram routines (`ttools.c`)
Support routines (Dan Pirone) used to build the size, memory, genotype, and reproductive-efficiency histograms shown by the frontend and by `query_species` (sort comparators for frequency/size/efficiency). Linked into the simulator.

### tsetup — startup / shutdown & parameter access (`tsetup.c`)
Simulator setup routines (Tom Uffner et al.): allocate the soup/cell/MemFr arrays at startup, tear them down on exit, and — via `GetAVar` — read or set `soup_in` parameter values (the machinery behind the `v-var` examine/alter menu, including the read-only-protected parameter list). Core module, not standalone.

### log2ipmap — log to IP-map converter (`log2ipmap.c`)
Filter that parses tagged fields from a network run's log/tping output (`fa`=FecundityAvg, `sp`=Speed, `nc`=NumCells, `aa`=AgeAvg, `ie`=InstExec key, `as`=AvgSize) and emits an IP-map (`TPingData`) style report. Used in Network Tierra to turn logged environmental data into a map.

### soupupdtrc — soup-update event tracer (`soupupdtrc.c`)
Reads a genebank archive + genome label and scans/reports the recorded "soup update" events (write events into memory) filtered by destination offset type (self / own daughter / host / host daughter / self-free-memory), track, size, InstP, and thread id. Usage: `soupupdtrc <archive> [-gl label] [-ot type] -of offset -ip InstP ...`. Used to trace exactly where and when a creature wrote to the soup.

### tie2pd — Tierra-to-PD relay (`tie2pd.c`)
Tiny network bridge: opens a TCP read connection to a running Tierra (host/port) and a TCP write connection to a "PD" destination, and forwards message buffers from one to the other. Usage: `tie2pd <tie-host> <tie-port> <pd-host> <pd-port>`. Used to pipe live Tierra output into another program (e.g. a Pure-Data / audio or visualization sink).

### tbglpasswd — Beagle password manager (`tbglpasswd.c`)
Standalone utility (Tsukasa Kimezawa, ATR) to maintain the Beagle network server's user/password file: prompts for name (e-mail) and password, `crypt()`-hashes with a salt, and updates the password files. The Beagle equivalent of `htpasswd`, used to grant clients access to a Beagle-served Tierra.

---

## Section 2 — User Interfaces

Tierra is compiled with one `FRONTEND` selected: `stdio` (plain console + interrupt handler), `basic` (curses full-screen), or `bgl` (Beagle client/server, with either a stdio or X11 UI). See Tierra.doc §6.6 and §4.1.

### 2.1 — The BASIC / stdio interface (Tierra.doc §6.6.1–6.6.2)

Two related console modes. With `FRONTEND=STDIO`, the running simulator streams status to the console and to `tierra.log`; you interrupt it (usually Ctrl-C on UNIX, any key on DOS) to raise the **interrupt-handler main menu**. With `FRONTEND=basic` you get a live full-screen (curses) version of the same menu, its screen divided into five areas: **STATS** (top two lines, updated each birth), **PLAN** (per-million-instruction statistics), **MESSAGE** (state changes / genebank data / prompts), **ERROR**, and **HELP** (keystroke hints).

**Standard output.** Every ~1,000,000 instructions the simulator prints a `plan()` block: `InstExeC`, `Generations`, timestamp, `NumCells`, `NumGenotypes`, `NumSizes`, `AvgSize`, `NumGenDG`, `AvgPop`, `Births`, `Deaths`, `Speed`, `MaxGenPop`/`MaxGenMem` (+ genotype), `RateMut`/`RateMovMut`/`RateFlaw`. `extract: <genotype> @ <pop>` lines mark genotypes crossing the `SavThrMem`/`SavThrPop` thresholds (a trailing `v` = virtual/already-saved extraction).

**tierra.log** (§6.6.3). Written when `TierraLog=1`; an abbreviated, append-only mirror of standard output (`ie`=InstExeC, `gn`=Generations, `nc`/`ng`/`ns`, `as`/`dg`, `bi`/`de`/`ap`, `mp`/`mg`, `sp`, `rm`/`mm`/`rf`, `ex`=extract). Also captures fatal-error messages and periodic memory-usage reports; resuming a run appends without losing prior data.

**Single-key interactive commands** (main menu prompt: `i-info  v-var  s-save  S-shell  q-save&quit  Q-quit  m-misc  c-continue |->`). One keypress, no Enter needed:

| Key | Action |
|-----|--------|
| `i` | **Info** — enter the display-mode submenu (below) |
| `v` | **Var** — examine/alter a `soup_in` variable (submenu `a`-alter / `e`-examine; some params are read-only) |
| `s` | **Save** the soup and continue (confirm) |
| `S` | **Shell** out to a system prompt |
| `q` | **Save & quit** (confirm) |
| `Q` | **Quit/abort** without saving (confirm) |
| `m` | **Misc** submenu (below) |
| `c` | **Continue** the run |

Info (`i`) submenu — `p-plan  s-size_histo  g-gen_histo  m-mem_histo  z-size_query  e-reprod_eff`:
- `p` Plan display (per-million stats, also clears the message area).
- `s` Size-class histogram (genotypes & living cells per size; sortable by size or frequency).
- `m` Memory histogram (memory occupied per size class).
- `g` Genotype histogram (living cells per genotype).
- `z` Size-class query — prompt for a size, list its common genotypes with `#`/`Mem`/`Err`/`Move`/`Bits`, page with `U`/`D`.
- `e` Reproductive-efficiency histograms (by size-avg or genome; 1st/2nd daughter; sortable).

Misc (`m`) submenu — `H-Histo Logging  I-Inject Gene  M-Micro Toggle`:
- `H` Toggle logging of histograms to `tierra.log`.
- `I` Inject a chosen genome from the genebank into the running soup.
- `M` Toggle the MICRO virtual debugger (delay / keypress / off — see `micromon`).

### 2.2 — Beagle UI, stdio menu tree (`reference/tierra-v6.02/Bgl-UI_stdio/`)

The **Beagle** client talks to a Tierra server over sockets; this is its text (stdio) front-panel (`bglstd_menu.c`, `bglstd_show.c`, `bglstd_print.c`). It adds connection management and network features on top of the BASIC menu. Main prompt: `f-file i-info v-var o-ov m-misc p-option C-onnection c-continue |->`. Privilege-aware (SU / non-SU mode per connection).

Menu tree:
- **File** (`f`) — `FILE | s-save soup  q-save&quit Tierra  Q-Quit Tierra  C-lose this connection  E-Exit beagle` (each with y/n confirm).
- **Info** (`i`) — `INFO | p-plan  s-size  g-gen  m-mem  z-size query  e-reprod eff` — same histogram/plan family as BASIC, with sort submenus (freq/size, size/freq, effic/size, 1st/2nd daughter, etc.).
- **Var** (`v`) — `VAR | a-alter variable  e-examine variable`; examine offers `a`-examine all / `o`-examine one.
- **Misc** (`m`) — `MISC | h-Histo Logging  i-Inject Gene  m-Micro Toggle  t-tping  M-migration`; TPing submenu (`C`-cluster tping on / `c`-off) and Migration-tracking submenu (`1`-on / `2`-off) add the Network-Tierra controls.
- **Overview** (`o`) — `OV | s-start overview  q-quit overview  g-genome`; starts/stops the overview (soup-map) display and a per-genome viewer (`Genome| c-continue genome | return-main menu`).
- **oPtion** (`p`) — `OPTION | w-wait time  x-XDR encode/decode buffer size`; tunes client polling wait and XDR buffer size.
- **Connection** (`C`) — lists active connections and `0: Create New Connection`; connect by Beagle URL / connection-script file / `help`.

Display screens mirror the BASIC areas (stats, plan, message, histograms) but are rendered into addressable Beagle screens (`BGL_MENU_SCR`, `BGL_INFOP_SCR`, `BGL_INFOZ_SCR`, …) via `BglStdPrintf`.

### 2.3 — Beagle Explorer, X11 GUI (`reference/tierra-v6.02/Bgl-GUI_X11/`)

The graphical Beagle client (`beagleGUI_*.c`, Athena/Xt widgets; network-version authors Tooru Yoshikawa et al.). One **Top** window opens the others from a "Window" menu. Window types:

| Window | Shows |
|--------|-------|
| **Top** (`TopWindow`) | Root window / launcher; the Window menu opens all other windows. |
| **Overview** (`OverviewWindow`) | The soup-map: a scrollable pixmap of memory, one colored cell per genome region (`SOUP_WIDTH`, color-assign table) — the signature "living soup" picture. |
| **OvGene** (`OvGeneWindow`) | Overview by genome — per-genome color/region detail within the soup map. |
| **OvInst** (`OvInstWindow`) | Overview instruction data — instruction-level view for a selected soup region. |
| **OvInfo** (`OvInfoWindow`) | Overview information panel — textual info/legend for the overview selection (clears/sets gene colors). |
| **Histo** (`HistoWindow`) | Histogram window — size/memory/genotype/efficiency histograms drawn graphically. |
| **Stats** (`StatsWindow`) | Stats area — the per-birth counters (InstExec, Cells, Genotypes, Sizes, last extract). |
| **Plan** (`PlanWindow`) | Plan area — the per-million-instruction statistics block. |
| **Query** (`QueryWindow`) | Query-size window — inspect the genotypes of a chosen size class. |
| **Var** (`VarWindow`) | Examine/alter `soup_in` variables. |
| **Message** (`MessageWindow`) / **InfoMessage** (`InfoMessageWindow`) | Message area — state-change and genebank messages; info/prompt dialogs. |
| **Debug** (`DebugWindow`, `DebugKeyWaitWindow`) | MICRO virtual-debugger front-end — breakpoints/step display, with a key-wait dialog for stepped execution. |
| **Migration** (`MigrationWindow`) | Network-Tierra migration display — creatures migrating between nodes. |
| **TPingC** (`TPingCWindow`) / **TPingS** (`TPingSWindow`) | TPing client / server windows — the network "ping" that requests/replies environmental (neighbor) data across cluster nodes. |
| **KeyIn** (`KeyInWindow`) | Generic keyboard-input dialog used by the other windows. |

**Color configuration** (`reference/tierra-v6.02/tierra/`):
- `tcolors.cfg` — text/background colors for the two console screen areas (information top/bottom vs. central display), by DOS color number (0=BLACK … 15=WHITE).
- `ovcolmap` — the overview soup-map color palette: up to nine hex colors (green/blue/red/purple/… ), one per genome-color slot; only the first nine lines are read, with spare options kept below.

### 2.4 — ALmond Monitor (Tierra.doc §3.2 / §4)

**ALmond** (by Marc Cygnus) is a separate piece of software — the "overview" tool — that connects to a running Tierra over sockets (via `tmonitor.c` support calls; compile with `MakeAlmond`) and displays live activity in the soup; it predates and parallels the Beagle Overview window. See `mlayer.doc` / `OV_README.txt` / `alcomm.doc`.
