# RPM LED Builder

A single-page editor for [Lovely Car Data](https://github.com/Lovely-Sim-Racing/lovely-car-data)
v2.0.0 car files: the rev-light RPMs, colours and redline that ATSR and other SimHub plugins drive
wheel and dash LEDs from.

**Open it:** https://milky28.github.io/rpm-led-builder/ - or download `index.html` and open it in a
browser. Everything runs locally in the page; it only reads the public Lovely Car Data repo.

- **Load from repo** any car already in Lovely Car Data, or **Import JSON** from a file or paste.
- Edit LEDs, colours, gaps and each gear's RPMs, with autofill, undo and autosave.
- **Preview** the strip on a rev sweep, read the way ATSR reads files: an LED lights above its value,
  black colours are gaps, the layout comes from the last gear, and cars with built-in ATSR behaviour
  are flagged.
- **Validate** against the repo's rules before submitting, with a change view against the repo's file.
- Download the file, named the way ATSR looks it up.

To measure a car's lights in game rather than type them in, use the companion SimHub plugin
[Lovely Car Data Capture](https://github.com/Milky28/lovely-car-data-capture), which writes files this
page opens.

A community tool, not made by or affiliated with Lovely Sim Racing or ATSR.

## License

MIT, see [LICENSE](LICENSE). Car files you make are contributed to Lovely Car Data under its license.
