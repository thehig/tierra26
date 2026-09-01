---
id: zero-flip
no: "3"
title: Zero & flip
phase: change
lede: Two handy tricks for setting a notebook just so.
ready: true
requires: [count-down]
---

<Scrolly>
  <Stage>
    <EntityDesigner>
    <Genome>
      not0
      not0
      zero
    </Genome>
    </EntityDesigner>
  </Stage>

  <Waypoint focus="genome">
  ## Flip and clear

  <Chip opcode="not0"/> flips the smallest bit of C (0 ↔ 1). <Chip opcode="zero"/> wipes C straight back to *zero*.
  </Waypoint>

  <Waypoint focus="registers">
  ## Try it

  Step through: flip makes C 1, flip again makes it 0, clear keeps it 0.
  </Waypoint>
</Scrolly>

<Challenge>
Turn notebook C into 1.
<Starter>
zero
</Starter>
<Goal kind="regEquals" reg="C" value="1" label="C is 1" />
<Solution budget="20">
zero
not0
</Solution>
</Challenge>
