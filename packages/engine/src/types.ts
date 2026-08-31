// Shared scalar aliases for the engine. Integers throughout (C-INT).
// Ref: docs/spec/engine/systems/00-architecture.md §6 (glossary).
export type Addr = number;         // soup index; always taken mod soupSize on access (C-ADDR)
export type InstrId = number;      // canonical dictionary dispatch key (≠ opcode byte)
export type Opcode = number;       // value in a genome byte = index into the active set [0,N)
export type CreatureId = number;   // monotonic id from world.nextId (C-ID)
