---
id: meet
no: "0"
title: Meet a creature
phase: read
lede: Before you build one, let's get to know one — every part of a living program, then watch it run one tick at a time.
ready: true
---

<Scrolly>
  <Stage>
    <EntityDesigner>
    <Genome>
      incA
      incB
      not0
      incA
      incC
    </Genome>
    </EntityDesigner>
  </Stage>

  <Waypoint focus="whole">
  ## This is a creature.

  Everything alive in the {soup} is a tiny program, just like this one. Let’s take it apart and see how it works.
  </Waypoint>

  <Waypoint focus="genome">
  ## Its genome

  A creature is a *stack of instruction blocks* — its {genome}. Each block is one small thing it can do. Read them top to bottom.
  </Waypoint>

  <Waypoint focus="ip">
  ## The reading head

  The little {reading-head} shows which block it’s about to run. Every tick it does that one block, then slides to the next.
  </Waypoint>

  <Waypoint focus="registers">
  ## Four notebooks

  A creature keeps numbers in *four notebooks* — <Chip register="A"/>, <Chip register="B"/>, <Chip register="C"/> and <Chip register="D"/>. Watch them change as it runs.
  </Waypoint>

  <Waypoint focus="flags">
  ## Flags

  {flags} are tiny *yes/no lights* it flips as it works. There are three: <Chip flag="E"/> when something went wrong, <Chip flag="S"/> and <Chip flag="Z"/>. They help it make decisions later on.
  </Waypoint>

  <Waypoint focus="age">
  ## Age & size

  Every creature has an {age} (ticks lived) and a {size} (blocks in its body). When the {soup} fills up, the {reaper} clears out the creatures nearest the front of its queue.
  </Waypoint>

  <Waypoint focus="run">
  ## Watch it run

  Press *Step one tick* over and over. The reading head moves, a notebook changes. That’s a creature *thinking*.
  </Waypoint>
</Scrolly>
