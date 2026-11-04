// Coloca cada anclado en su puesto exacto; lo demás llena los puestos libres en su orden.
export function withPins<X extends { pin_rank?: number | null }>(list: X[]): X[] {
  const pins = list.filter((x) => x.pin_rank != null).sort((a, b) => a.pin_rank! - b.pin_rank!);
  const rest = list.filter((x) => x.pin_rank == null);
  const out: X[] = [];
  let p = 0, r = 0;
  while (p < pins.length || r < rest.length) {
    if (p < pins.length && (pins[p].pin_rank! <= out.length + 1 || r >= rest.length)) out.push(pins[p++]);
    else out.push(rest[r++]);
  }
  return out;
}
