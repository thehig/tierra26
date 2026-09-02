---
id: doubling
no: "4"
title: Doubling
phase: change
lede: Build up big numbers fast.
ready: true
requires: [zero-flip]
---

<Scrolly>
  <Stage>
    <EntityDesigner>
    <Genome>
      not0
      shl
      shl
    </Genome>
    </EntityDesigner>
  </Stage>

  <Waypoint focus="genome">
  ## Times two

  {shl} *doubles* notebook {register-c}. Start at 1, and 1 → 2 → 4 → 8 in just a few blocks.
  </Waypoint>

  <Waypoint focus="registers">
  ## Powers of two

  Doubling is how a creature makes big numbers (like its own {size}) without a hundred `grow` blocks.
  </Waypoint>
</Scrolly>

<Challenge>
Make notebook {register-c} reach 4.
<Starter>
not0
shl
</Starter>
<Goal kind="regAtLeast" reg="C" value="4" label="C reaches 4" />
<Solution budget="20">
not0
shl
shl
</Solution>
</Challenge>
