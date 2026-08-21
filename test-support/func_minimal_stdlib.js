export const MINIMAL_FUNC_STDLIB = `
forall X -> X null() asm "PUSHNULL";
tuple empty_tuple() asm "NIL";
forall X -> tuple tpush(tuple t, X value) asm "TPUSH";
forall X -> (tuple, ()) ~tpush(tuple t, X value) asm "TPUSH";
slice begin_parse(cell c) asm "CTOS";
(slice, cell) load_ref(slice s) asm(-> 1 0) "LDREF";
int slice_refs(slice s) asm "SREFS";
int slice_bits(slice s) asm "SBITS";
int slice_empty?(slice s) asm "SEMPTY";
builder begin_cell() asm "NEWC";
cell end_cell(builder b) asm "ENDC";
(slice, int) udict_get?(cell dict, int key_len, int index) asm(index dict key_len) "DICTUGET" "NULLSWAPIFNOT";
(cell, slice, int) udict_delete_get?(cell dict, int key_len, int index) asm(index dict key_len) "DICTUDELGET" "NULLSWAPIFNOT";
(cell, (slice, int)) ~udict_delete_get?(cell dict, int key_len, int index) asm(index dict key_len) "DICTUDELGET" "NULLSWAPIFNOT";
cell udict_set_builder(cell dict, int key_len, int index, builder value) asm(value index dict key_len) "DICTUSETB";
(cell, ()) ~udict_set_builder(cell dict, int key_len, int index, builder value) asm(value index dict key_len) "DICTUSETB";
`;
