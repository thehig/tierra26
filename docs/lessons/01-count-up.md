---
id: count-up
no: "1"
title: Count up
phase: change
lede: "The simplest thing a creature can do: add one to a notebook."
ready: true
requires: [meet]
---

<Scrolly>
  <Stage>
    <EntityDesigner>
    <Genome>
      incA
      incA
      incA
    </Genome>
    </EntityDesigner>
  </Stage>

  <Waypoint focus="genome">
  ## Adding one

  The block {incA} adds *one* to notebook {register-a}. There’s {incB} and {incC} too — one per notebook.
  </Waypoint>

  <Waypoint focus="registers">
  ## Watch {register-a} climb

  Step through this creature. Each {incA} bumps {register-a} up by one: 0 → 1 → 2 → 3.
  </Waypoint>
</Scrolly>

<Challenge>
Make notebook {register-a} reach 3.
<Starter>
incA
incA
</Starter>
<Goal kind="regAtLeast" reg="A" value="3" label="A reaches 3" />
<Solution budget="20">
incA
incA
incA
</Solution>
</Challenge>
