---
id: give-birth
no: "16"
title: Give birth
phase: daughter
lede: The moment it all leads to.
ready: true
requires: [copy-loop]
soup: 256
---

<Scrolly>
  <Stage>
    <EntityDesigner soup="256">
    <Genome ref="ancestor" />
    </EntityDesigner>
  </Stage>

  <Waypoint focus="daughter">
  ## Split

  Once the {daughter} is a full copy, {divide} sets her free as a brand-new creature — her own body, her own {reading-head}, her own life.
  </Waypoint>

  <Waypoint focus="world" run-until="birth">
  ## Two, then many

  Now there are two. Each will copy itself too. Press *Run* and watch your creature become a family.
  </Waypoint>
</Scrolly>

<Challenge>
Press ▶ Run until a {daughter baby} is born (the {soup world} shows 2 creatures).
<Starter ref="ancestor" />
<Goal kind="born" label="your first baby is born! 🎉" />
<Solution budget="8000" ref="ancestor" />
</Challenge>
