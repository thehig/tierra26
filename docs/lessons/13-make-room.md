---
id: make-room
no: "13"
title: Make room
phase: daughter
lede: Before copying itself, a creature reserves a patch of the world for its baby.
ready: true
requires: [measure]
---

<Scrolly>
  <Stage>
    <EntityDesigner>
    <Genome>
      not0
      shl
      shl
      shl
      shl
      mal
    </Genome>
    </EntityDesigner>
  </Stage>

  <Waypoint focus="world">
  ## A patch of world

  {mal} asks the {soup world} for a patch of *empty cells* — the free space you met earlier — and reserves it as the {daughter}. Notebook {register-c} says how many cells to grab.
  </Waypoint>

  <Waypoint focus="daughter" run-until="daughter">
  ## The daughter appears

  Watch those free cells light up as the {daughter} — empty and waiting. Only the mother may write there.
  </Waypoint>
</Scrolly>

<Challenge>
{register-c} is built up to 16. Add {mal} to reserve room for a {daughter}.
<Starter>
not0
shl
shl
shl
shl
</Starter>
<Goal kind="daughter" label="a daughter is reserved" />
<Solution budget="20">
not0
shl
shl
shl
shl
mal
</Solution>
</Challenge>
