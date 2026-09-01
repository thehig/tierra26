---
id: deciding
no: "9"
title: Know when to stop
phase: change
lede: A loop that never ends is stuck. This is how a creature decides.
ready: true
requires: [loops]
---

<Scrolly>
  <Stage>
    <EntityDesigner>
    <Genome>
      not0
      ifz
      zero
      incA
    </Genome>
    </EntityDesigner>
  </Stage>

  <Waypoint focus="genome">
  ## Only if zero

  <Chip opcode="ifz"/> looks at notebook C. It lets the *next* block run only when C is zero — otherwise it skips it.
  </Waypoint>

  <Waypoint focus="registers">
  ## The off-switch

  Step through: C is 1 (not zero), so <Chip opcode="ifz"/> *skips* the <Chip opcode="zero"/>. This is how a copy loop knows when it’s finished.
  </Waypoint>
</Scrolly>
