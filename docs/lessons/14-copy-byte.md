---
id: copy-byte
no: "14"
title: Copy one byte
phase: daughter
lede: The most important block of all — but one at a time.
ready: true
requires: [make-room]
---

<Scrolly>
  <Stage>
    <EntityDesigner>
    <Genome>
      not0
      shl
      shl
      shl
      shl
      mal
      movii
    </Genome>
    </EntityDesigner>
  </Stage>

  <Waypoint focus="genome">
  ## One byte

  <Chip opcode="movii"/> copies a single byte from the mother into the daughter. Just one.
  </Waypoint>

  <Waypoint focus="daughter">
  ## Not enough

  One byte barely fills the daughter. A whole body is dozens of bytes — so you <Chip opcode="movii"/> over and over. That’s a job for a loop.
  </Waypoint>
</Scrolly>
