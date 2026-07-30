import pathlib
p = pathlib.Path(r"g:/TaPa/src/ui/brain-ui/app-shell.js")
text = p.read_text(encoding="utf-8")
wrong = "".join(map(chr, [104, 116, 115]))  # hts mistake
text = text.replace(f'id="{wrong}-dot-', 'id="sss-dot-')
text = text.replace(f'id="{wrong}-value-', 'id="sss-value-')
p.write_text(text, encoding="utf-8")
print("fixed ids to sss-*")
