---
id: count-down
no: "2"
title: Count down
phase: change
lede: What goes up can come down.
ready: true
requires: [count-up]
---

<Scrolly>
  <Stage>
    <EntityDesigner>
    <Genome>
      incC
      incC
      incC
      decC
    </Genome>
    </EntityDesigner>
  </Stage>

  <Waypoint focus="genome">
  ## Taking one away

  <Chip opcode="decC"/> takes *one* away from notebook C — the opposite of <Chip opcode="incC"/>.
  </Waypoint>

  <Waypoint focus="registers">
  ## Up, then down

  This creature counts C up to 3, then <Chip opcode="decC"/> brings it back to 2. Step through and watch.
  </Waypoint>
</Scrolly>

<Challenge>
Count C up, then bring it back down to exactly 1.
<Starter>
incC
incC
incC
</Starter>
<Goal kind="regEquals" reg="C" value="1" label="C returns to 1" />
<Solution budget="20">
incC
incC
incC
decC
decC
</Solution>
</Challenge>
