---
id: sums
no: "10"
title: Doing sums
phase: change
lede: Creatures do arithmetic to work things out — like their own size.
ready: true
requires: [deciding]
---

<Scrolly>
  <Stage>
    <EntityDesigner>
    <Genome>
      incA
      incA
      incA
      incB
      subCAB
    </Genome>
    </EntityDesigner>
  </Stage>

  <Waypoint focus="genome">
  ## Take away

  {subCAB} does a sum: it puts *A minus B* into notebook {register-c}.
  </Waypoint>

  <Waypoint focus="registers">
  ## A − B → C

  Here A is 3 and B is 1, so {subCAB} makes C = 2. Step through and see.
  </Waypoint>
</Scrolly>

<Challenge>
A is 3 and B is 1. Add {subCAB} to put A − B into C (that’s 2).
<Starter>
incA
incA
incA
incB
</Starter>
<Goal kind="regEquals" reg="C" value="2" label="C becomes 2" />
<Solution budget="20">
incA
incA
incA
incB
subCAB
</Solution>
</Challenge>
