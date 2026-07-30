from pathlib import Path

p = Path(__file__).resolve().parent.parent / "src/ui/brain-ui/app-shell.js"
text = p.read_text(encoding="utf-8")
needle_start = '    <section class="view-hero" data-view-hero="settings">'
needle_end = '    <div class="settings-body">'
si = text.index(needle_start)
ei = text.index(needle_end, si)
new_block = '''    <section class="view-hero view-hero--settings-plain" data-view-hero="settings">
      <div class="view-hero-text">
        <h2 class="view-hero-title">设置</h2>
        <p class="view-hero-sub">左侧选择类别；连接状态显示在对应菜单右侧。</p>
      </div>
    </section>

'''
text = text[:si] + new_block + text[ei:]
p.write_text(text, encoding="utf-8")
print("patched app-shell.js settings hero")
