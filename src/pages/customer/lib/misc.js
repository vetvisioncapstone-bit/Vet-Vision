// Small standalone helpers ported verbatim from customer/index.html.

export function initialsOf(name) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}
