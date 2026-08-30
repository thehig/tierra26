// The ancestor: a 72-byte self-replicator, in the spirit of Tierra's 80aaa.
// Self-examines via templates, then loops: mal -> copy -> divide.

export const ANCESTOR_ASM = `
; ---- self-exam ----
nop1 nop1 nop1 nop1      ; BEGIN marker (1111)
adrb nop0 nop0 nop0 nop0 ; ax = start of BEGIN (complement 1111, backward)
mov_ab                   ; bx = start
adrf nop0 nop0 nop0 nop1 ; ax = addr after END marker (complement 1110, forward)
sub_ab                   ; cx = ax - bx = genome size

; ---- reproduction loop ----
nop1 nop1 nop0 nop1      ; LOOP marker (1101)
mal                      ; ax = daughter cell (cx bytes)
call nop0 nop1 nop1 nop1 ; -> COPY proc (complement 1000)
divide                   ; daughter goes free
jmp  nop0 nop0 nop1 nop0 ; -> LOOP (complement 1101)
mov_dc                   ; spacer: keeps templates from merging

; ---- copy procedure ----
nop1 nop0 nop0 nop0      ; COPY marker (1000)
push_a
push_b
push_c
nop1 nop0 nop1 nop0      ; CLOOP marker (1010)
mov_ii                   ; soup[ax] = soup[bx]
dec_c
ifz
jmp  nop0 nop1 nop0 nop0 ; if cx==0 -> CEXIT (complement 1011)
inc_a
inc_b
jmpb nop0 nop1 nop0 nop1 ; -> CLOOP (complement 1010, backward)
mov_dc                   ; spacer: keeps templates from merging
nop1 nop0 nop1 nop1      ; CEXIT marker (1011)
pop_c
pop_b
pop_a
ret

nop1 nop1 nop1 nop0      ; END marker (1110)
`;
