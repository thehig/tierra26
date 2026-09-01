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

  <Waypoint focus="genome" at="0">
  ## Taking one away

  {decC} takes *one* away from notebook {register-c} — the opposite of
  {incC}. This creature has four blocks and hasn't run any of them
  yet, so C is still *0*.

  Keep scrolling. Each step below runs one more block.
  </Waypoint>

  <Waypoint focus="registers" at="1">
  ## One

  The first {incC} ran. C is now *1*.
  </Waypoint>

  <Waypoint focus="registers" at="2">
  ## Two

  The second one ran. C is *2* — climbing by one each time.
  </Waypoint>

  <Waypoint focus="registers" at="3">
  ## Three

  And the third. C reaches *3*, the highest this creature counts.
  </Waypoint>

  <Waypoint focus="registers" at="4">
  ## And back down

  Now the last block — {decC} — takes one away again. C drops to
  *2*. Up three, down one.

  Scroll back up and watch it run in reverse.
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
