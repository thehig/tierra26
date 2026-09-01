---
id: landmarks
no: "7"
title: Landmarks
phase: change
lede: Signposts inside your own code.
ready: true
requires: [body-is-code]
---

<Scrolly>
  <Stage>
    <EntityDesigner>
    <Genome>
      incA
      here:
      incB
    </Genome>
    </EntityDesigner>
  </Stage>

  <Waypoint focus="genome">
  ## A signpost

  <Chip opcode="nop0"/> and <Chip opcode="nop1"/> are the two *marker* blocks — the raw pieces a signpost is built from. Write one with a name, like `here:`, and you’ve made a *landmark*: a spot in your list of blocks (see the numbers on the left), not a square in the world. On its own it does nothing; the reading head walks straight past it.
  </Waypoint>

  <Waypoint focus="genome">
  ## Two markers

  There are just two: <Chip opcode="nop0"/> (a blue marker) and <Chip opcode="nop1"/> (a red one). Here’s the part that matters next chapter — when a block *jumps to* or *searches for* a landmark, it carries a *matching marker* as its target. That marker rides along as an *extra cell*. So next time you spot a lone 🔴 beside a jump, you’ll know it: it’s the marker saying *which* signpost.
  </Waypoint>

  <Waypoint focus="ip">
  ## Why bother?

  A landmark is a place you can *jump to* or *search for* by name. Next chapter you’ll send the reading head back to one — and make your first loop.
  </Waypoint>
</Scrolly>
