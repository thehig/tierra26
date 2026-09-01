---
id: copy-loop
no: "15"
title: The copy loop
phase: daughter
lede: "Everything so far, together: a creature that copies its whole self."
ready: true
requires: [copy-byte]
soup: 256
---

<Scrolly>
  <Stage>
    <EntityDesigner soup="256">
    <Genome ref="ancestor" />
    </EntityDesigner>
  </Stage>

  <Waypoint focus="genome">
  ## A real creature

  This is a full creature — much bigger now. It finds itself, makes room, and runs a copy loop: {movii}, move along, {jmpb} until it’s done.
  </Waypoint>

  <Waypoint focus="daughter">
  ## Watch it fill

  Press *Run*. The reading head races round the loop and the daughter fills up, byte by byte, into a complete copy.
  </Waypoint>
</Scrolly>

<Challenge>
Press ▶ Run and watch the daughter fill up.
<Starter ref="ancestor" />
<Goal kind="daughterFill" pct="60" label="the daughter is copied" />
<Solution budget="8000" ref="ancestor" />
</Challenge>
