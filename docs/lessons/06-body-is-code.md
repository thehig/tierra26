---
id: body-is-code
no: "6"
title: Your body is your code
phase: change
lede: Where does your code actually live? In the world.
ready: true
requires: [world]
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

  <Waypoint focus="genome">
  ## Code lives in the world

  Your {genome} isn’t kept somewhere separate — every *block* of it sits in one *cell* of the {soup world}. Your code and your body are the *same thing*.
  </Waypoint>

  <Waypoint focus="whole">
  ## Block 0 is cell 0

  The numbers beside your blocks are their spots in the {soup world}. *Block 0* is the first bright cell, *block 1* the next, and so on. Hover a block to light up its cell — count the bright cells, then count your blocks. Same number.
  </Waypoint>

  <Waypoint focus="genome">
  ## That’s your size

  How many cells your body fills is your {size}. More blocks means a bigger body that takes up more of the {soup world}.
  </Waypoint>
</Scrolly>

<Challenge>
Add blocks until your body fills exactly 6 cells. (Any `grow`/{not0}/{shl} block is one cell.)
<Starter>
incA
incB
incC
incA
</Starter>
<Goal kind="sizeEquals" value="6" label="your body fills 6 cells" />
<Solution budget="5">
incA
incB
incC
incA
incB
incC
</Solution>
</Challenge>
