---
id: find
no: "11"
title: Finding a signpost
phase: change
lede: A creature reads its own code to find a signpost by name.
ready: true
requires: [sums]
---

<Scrolly>
  <Stage>
    <EntityDesigner>
    <Genome>
      spot:
      incA
      incA
      adrb spot
      incB
    </Genome>
    </EntityDesigner>
  </Stage>

  <Waypoint focus="genome">
  ## Search by name

  {adrb} looks *backwards* through your own blocks for a signpost. This searches your *code*, not the world — it’s how a creature finds a spot inside itself. Like {jmpb}, it’s a *two-cell block* — the search plus the signpost it hunts for. ({adro} looks both ways; {adrf} looks ahead.)
  </Waypoint>

  <Waypoint focus="registers">
  ## Where, and how long

  When it finds the `spot` signpost it fills two notebooks: *A* = the position right after it (here that’s *1* — check the numbers on the blocks), and *C* = how many blocks long the signpost itself is (here, *1*).
  </Waypoint>
</Scrolly>

<Challenge>
Add a {adrb spot} line just above {incB}, so the creature finds its own signpost — its length lands in C.
<Starter>
spot:
incA
incB
</Starter>
<Goal kind="regAtLeast" reg="C" value="1" label="C holds the signpost’s length" />
<Solution budget="20">
spot:
incA
adrb spot
incB
</Solution>
</Challenge>
