---
id: world
no: "5"
title: The world
phase: change
lede: Meet the place your creature lives.
ready: true
requires: [doubling]
---

<Scrolly>
  <Stage>
    <EntityDesigner>
    <Genome>
      incA
      incB
      incC
      incA
      incB
    </Genome>
    </EntityDesigner>
  </Stage>

  <Waypoint focus="world">
  ## This is the world

  That big grid up top is the *world* — the space every creature lives in. Think of it as a huge sheet of graph paper, one *cell* per square.
  </Waypoint>

  <Waypoint focus="world">
  ## Your creature is in there

  See the little patch of *bright* cells? That’s your creature — its *whole body* sits in the world, right there. It doesn’t wander around; it stays put and does its thinking on the spot. Step it and watch: the notebooks change, but the patch stays.
  </Waypoint>

  <Waypoint focus="world">
  ## Empty space

  All the *faint* cells are *free space* — empty world with nobody in it yet. That’s the room a creature’s babies will need later.
  </Waypoint>
</Scrolly>
