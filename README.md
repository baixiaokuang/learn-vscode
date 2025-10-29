# Learn VS Code

## Build without extensions

When we only care about VS Code Core, we want to disable all extension related staff to accelerate build and debug pipelines.

### Disable `npm install` in extensions

`build\npm\dirs.js`
Delete extension related directories.

### Skip local builtin extensions build tasks

```bash
npm run gulp compile-client
```

### Skip marketplace builtin extensions

Clear `builtInExtensions` array in `product.json`

### Don't load builtin extensions from `extensions/`

In `.\scripts\code.bat`, add `--builtin-extensions-dir=empty`, and `if not exist empty mkdir empty` to prepare an empty directories for VS Code to load extensions from.

### Run VS Code

Press `F5`.
