---
id: loops
no: "8"
title: Go in circles
phase: change
lede: Send the reading head back to a signpost, and blocks repeat.
ready: true
requires: [landmarks]
---

<Scrolly>
  <Stage>
    <EntityDesigner>
    <Genome>
      top:
      incA
      jmpb top
      zero
    </Genome>
    </EntityDesigner>
  </Stage>

  <Waypoint focus="ip">
  ## The loop

  {jmpb top} sends the reading head back up to the `top:` landmark. So {incA} runs again and again — a *loop*. (The {zero} at the bottom is a *wall* — it marks where the loop ends. A loop must always have a wall after it.)
  </Waypoint>

  <Waypoint focus="world">
  ## One block, two cells

  Look at the world: {jmpb} fills *two cells*. The first is the *jump* (⏪); the second is a *marker* (🔴) — a copy of the signpost it’s aiming at, exactly the markers you met last chapter. So a jump is a *two-part block*: the jump plus its target marker. Most blocks are one cell; only jumps and searches carry a target like this.
  </Waypoint>

  <Waypoint focus="registers" at="12">
  ## Watch A climb

  Press *Run* and watch A shoot up. A loop is how a creature does a lot with just a few blocks.
  </Waypoint>
</Scrolly>

<Challenge>
Add a {jmpb top} line just above {zero} to make a loop, and push notebook {register-a} to 5.
<Starter>
top:
incA
zero
</Starter>
<Goal kind="regAtLeast" reg="A" value="5" label="A reaches 5" />
<Solution budget="60">
top:
incA
jmpb top
zero
</Solution>
</Challenge>
