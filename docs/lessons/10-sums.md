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

  {subCAB} does a sum: it puts {register-a} minus {register-b} into notebook {register-c}.
  </Waypoint>

  <Waypoint focus="registers">
  ## {register-a} − {register-b} → {register-c}

  Here {register-a} is 3 and {register-b} is 1, so {subCAB} makes {register-c} = 2. Step through and see.
  </Waypoint>
</Scrolly>

<Challenge>
{register-a} is 3 and {register-b} is 1. Add {subCAB} to put {register-a} − {register-b} into {register-c} (that’s 2).
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
