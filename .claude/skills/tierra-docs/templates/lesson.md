---
id: «id»
no: "«N»"
title: «Title Case, four words or fewer»
phase: «read | change | daughter | life | evolve | versus»
lede: «One plain sentence. NOT markdown, NOT tokens — this is printed as a string.»
ready: true
requires: [«previous-lesson-id»]
---

<Scrolly>
  <Stage>
    <EntityDesigner>
      <Genome>
«the creature this whole lesson is about — as small as it can be»
      </Genome>
    </EntityDesigner>
  </Stage>

  <Waypoint focus="«whole | world | genome | registers | ip | flags | age | daughter | run»">
  ## «The one idea, named»

  «Two or three sentences. This waypoint is a screen — a reader sees it alone.» «Tag each
  Bible term once here; the next waypoint is a new screen and earns its own cards.»
  </Waypoint>

  <Waypoint focus="registers" at="«tick»">
  ## «What changed»

  «Point at the thing that just moved. `at` parks the demo on a tick; `run-until` runs to
  an event (birth | daughter | halt | error) instead of counting.»
  </Waypoint>
</Scrolly>

<Challenge>
«What to do, in one sentence, naming the blocks with tokens: Add a {jmpb top} line just
above {zero} to make a loop, and push notebook {register-a} to 5.»
<Starter>
«real mnemonics — raw text, never markdown, never tokens»
«MUST NOT already satisfy the goal»
</Starter>
<Goal kind="«regAtLeast»" reg="«A»" value="«5»" label="«the kid-facing one-liner»" />
<Solution budget="«60»">
«the intended solution — MUST satisfy the goal within budget»
</Solution>
</Challenge>
