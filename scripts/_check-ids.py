import pathlib
p = pathlib.Path(r"g:/TaPa/src/ui/brain-ui/app-shell.js")
lines = p.read_text(encoding="utf-8").splitlines()
for idx in (419, 421):
    line = lines[idx]
    frag = line.split('id="', 1)[1].split('"', 1)[0]
    prefix = frag.split('-')[0]
    print(idx + 1, prefix, [ord(c) for c in prefix])
