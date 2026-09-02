---
id: measure
no: "12"
title: Measuring
phase: change
lede: Two signposts and a subtraction tell a creature how big it is.
ready: true
requires: [find]
---

<Scrolly>
  <Stage>
    <EntityDesigner>
    <Genome>
      start:
      incA
      incA
      incB
      end:
    </Genome>
    </EntityDesigner>
  </Stage>

  <Waypoint focus="genome">
  ## How big is a piece of me?

  Put a {template signpost} at the *start* of a stretch and one at the *end* (see them at positions 0 and 5). {adro} each to get its position, then {subCAB} the two. The answer is the {size} of everything in between — the number of blocks in that piece of your body.
  </Waypoint>

  <Waypoint focus="age">
  ## Ready to copy

  Measuring itself from start to end is the last thing a creature needs before it can copy *itself*. Next: making room for a {daughter baby}.
  </Waypoint>
</Scrolly>
